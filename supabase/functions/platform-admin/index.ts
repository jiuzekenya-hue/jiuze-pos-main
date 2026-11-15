import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const adminClient = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)

  try {
    const client = adminClient()
    const token = authorization.slice('Bearer '.length)
    const { data: authData, error: authError } = await client.auth.getUser(token)
    if (authError || !authData.user) return json({ error: 'Invalid session' }, 401)

    const { data: adminRecord, error: adminError } = await client
      .from('platform_admins')
      .select('role')
      .eq('user_id', authData.user.id)
      .maybeSingle()

    let payload: { action?: string; search?: string; business_id?: string; sale_id?: string; items?: Array<{ sale_item_id: string; quantity: number }>; refund_method?: string; refund_reference?: string; reason?: string }
    try {
      payload = await request.json()
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }
    if (payload.action === 'check') {
      return json({ isAdmin: !adminError && adminRecord?.role === 'super_admin' })
    }
    if (adminError || !adminRecord || adminRecord.role !== 'super_admin') {
      return json({ error: 'Platform administrator access required' }, 403)
    }
    if (payload.action === 'sales') {
      let query = client.from('sales')
        .select('id,business_id,receipt_number,cashier_id,subtotal,discount,total,status,created_at')
        .order('created_at', { ascending: false }).limit(100)
      if (payload.business_id) query = query.eq('business_id', payload.business_id)
      if (payload.search?.trim()) query = query.ilike('receipt_number', `%${payload.search.trim()}%`)
      const { data: sales, error } = await query
      if (error) throw error
      const businessIds = [...new Set((sales ?? []).map((s) => s.business_id))]
      const cashierIds = [...new Set((sales ?? []).map((s) => s.cashier_id))]
      const [{ data: businesses }, { data: profiles }] = await Promise.all([
        client.from('businesses').select('id,name').in('id', businessIds.length ? businessIds : ['00000000-0000-0000-0000-000000000000']),
        client.from('profiles').select('id,full_name').in('id', cashierIds.length ? cashierIds : ['00000000-0000-0000-0000-000000000000']),
      ])
      const businessMap = new Map((businesses ?? []).map((b) => [b.id, b.name]))
      const cashierMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
      return json({ sales: (sales ?? []).map((s) => ({ ...s, business_name: businessMap.get(s.business_id) ?? 'Business', cashier_name: cashierMap.get(s.cashier_id) ?? 'Unknown cashier' })) })
    }

    if (payload.action === 'sale_detail') {
      if (!payload.sale_id) return json({ error: 'Sale ID is required' }, 400)
      const { data: sale, error: saleError } = await client.from('sales')
        .select('id,business_id,receipt_number,cashier_id,subtotal,discount,total,status,created_at')
        .eq('id', payload.sale_id).maybeSingle()
      if (saleError) throw saleError
      if (!sale) return json({ error: 'Sale not found' }, 404)
      const [{ data: business }, { data: cashier }, { data: items, error: itemsError }, { data: payments, error: paymentsError }, { data: returns, error: returnsError }, { data: audit }] = await Promise.all([
        client.from('businesses').select('id,name').eq('id', sale.business_id).maybeSingle(),
        client.from('profiles').select('id,full_name').eq('id', sale.cashier_id).maybeSingle(),
        client.from('sale_items').select('id,product_id,product_name,quantity,unit_price,cost_price,discount,subtotal').eq('sale_id', sale.id),
        client.from('payments').select('id,method,amount,reference,created_at').eq('sale_id', sale.id).order('created_at'),
        client.from('sales_returns').select('id,return_receipt_number,refund_method,refund_amount,refund_reference,reason,created_at').eq('original_sale_id', sale.id).order('created_at', { ascending: false }),
        client.from('platform_admin_sales_audit').select('id,action,reason,metadata,created_at').eq('sale_id', sale.id).order('created_at', { ascending: false }),
      ])
      if (itemsError || paymentsError || returnsError) throw itemsError ?? paymentsError ?? returnsError
      const returnIds = (returns ?? []).map((r) => r.id)
      const { data: returnedItems, error: returnedError } = await client.from('sales_return_items')
        .select('return_id,original_sale_item_id,quantity,refund_amount').in('return_id', returnIds.length ? returnIds : ['00000000-0000-0000-0000-000000000000'])
      if (returnedError) throw returnedError
      return json({ sale: { ...sale, business_name: business?.name ?? 'Business', cashier_name: cashier?.full_name ?? 'Unknown cashier' }, items: items ?? [], payments: payments ?? [], returns: returns ?? [], returned_items: returnedItems ?? [], audit: audit ?? [] })
    }

    if (payload.action === 'process_return') {
      if (!payload.sale_id || !payload.business_id || !Array.isArray(payload.items) || payload.items.length === 0 || !payload.reason?.trim()) return json({ error: 'Sale, business, returned items and reason are required' }, 400)
      if (!['cash', 'mpesa', 'card'].includes(payload.refund_method ?? '')) return json({ error: 'Invalid refund method' }, 400)
      if (['mpesa', 'card'].includes(payload.refund_method ?? '') && !payload.refund_reference?.trim()) return json({ error: 'Enter the external refund transaction reference' }, 400)
      const { data: result, error } = await client.rpc('platform_admin_process_sale_return', {
        p_admin_user_id: authData.user.id,
        p_business_id: payload.business_id,
        p_sale_id: payload.sale_id,
        p_items: payload.items,
        p_refund_method: payload.refund_method,
        p_refund_reference: payload.refund_reference?.trim() || null,
        p_reason: payload.reason.trim(),
      })
      if (error) throw error
      return json({ result })
    }

    if (payload.action !== 'overview') return json({ error: 'Unknown action' }, 400)

    const { data: businesses, error: businessesError } = await client
      .from('businesses')
      .select('id, name, phone, location, business_mode, created_at, subscription_exempt')
      .order('created_at', { ascending: false })
      .limit(500)
    if (businessesError) throw businessesError

    const businessIds = (businesses ?? []).map((business) => business.id)
    const { data: subscriptions, error: subscriptionsError } = await client
      .from('subscriptions')
      .select('business_id, status, trial_end, current_period_end, updated_at, subscription_plans(name, code)')
      .in('business_id', businessIds.length ? businessIds : ['00000000-0000-0000-0000-000000000000'])
    if (subscriptionsError) throw subscriptionsError

    const subscriptionByBusiness = new Map((subscriptions ?? []).map((subscription) => [subscription.business_id, subscription]))
    const now = Date.now()
    const effectiveStatus = (subscription: any) => {
      if (!subscription) return 'expired'
      if (subscription.status === 'cancelled') return 'cancelled'
      if (subscription.status === 'trialing') return subscription.trial_end && new Date(subscription.trial_end).getTime() > now ? 'trialing' : 'expired'
      if (subscription.status === 'active') return subscription.current_period_end && new Date(subscription.current_period_end).getTime() > now ? 'active' : 'expired'
      return 'expired'
    }

    const mappedBusinesses = (businesses ?? []).map((business) => {
      const subscription = subscriptionByBusiness.get(business.id) as any
      const plan = subscription?.subscription_plans
      return {
        ...business,
        subscription: subscription ? {
          status: effectiveStatus(subscription),
          plan_name: plan?.name ?? null,
          plan_code: plan?.code ?? null,
          trial_end: subscription.trial_end,
          current_period_end: subscription.current_period_end,
          updated_at: subscription.updated_at,
        } : null,
      }
    })

    const metrics = {
      businesses: mappedBusinesses.length,
      active: mappedBusinesses.filter((business) => !business.subscription_exempt && business.subscription?.status === 'active').length,
      trials: mappedBusinesses.filter((business) => !business.subscription_exempt && business.subscription?.status === 'trialing').length,
      expired: mappedBusinesses.filter((business) => !business.subscription_exempt && (!business.subscription || business.subscription.status === 'expired')).length,
      cancelled: mappedBusinesses.filter((business) => !business.subscription_exempt && business.subscription?.status === 'cancelled').length,
      exempt: mappedBusinesses.filter((business) => business.subscription_exempt).length,
    }

    const activity = [
      ...(mappedBusinesses ?? []).map((business) => ({
        id: `business-${business.id}`,
        type: 'business_registered',
        label: 'Business registered',
        detail: business.name,
        created_at: business.created_at,
      })),
      ...mappedBusinesses.filter((business) => business.subscription?.updated_at).map((business) => ({
        id: `subscription-${business.id}`,
        type: 'subscription_updated',
        label: 'Subscription record updated',
        detail: `${business.name} · ${business.subscription?.plan_name ?? 'No plan'} · ${business.subscription?.status}`,
        created_at: business.subscription!.updated_at,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 12)

    return json({ metrics, businesses: mappedBusinesses, activity })
  } catch (error) {
    console.error('platform-admin error', error)
    return json({ error: 'Unable to load platform data' }, 500)
  }
})

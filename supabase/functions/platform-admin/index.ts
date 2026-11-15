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

    let payload: { action?: string; search?: string; business_id?: string; sale_id?: string; items?: Array<{ sale_item_id: string; quantity: number }>; refund_method?: string; refund_reference?: string; reason?: string; period?: string; subscription_id?: string; amount_kes?: number; payment_method?: string; transaction_reference?: string; paid_at?: string; notes?: string }
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
    if (payload.action === 'subscription_management') {
      const [{ data: businesses, error: businessError }, { data: subscriptions, error: subscriptionError }, { data: plans, error: plansError }, { data: prices, error: pricesError }, { data: payments, error: paymentsError }] = await Promise.all([
        client.from('businesses').select('id,name,phone,location,created_at,subscription_exempt').order('created_at', { ascending: false }).limit(1000),
        client.from('subscriptions').select('id,business_id,plan_id,billing_interval,status,trial_start,trial_end,current_period_start,current_period_end,cancelled_at,created_at,updated_at,subscription_plans(name,code)').order('updated_at', { ascending: false }).limit(1000),
        client.from('subscription_plans').select('id,name,code,description,trial_days,is_active').order('name'),
        client.from('subscription_prices').select('id,plan_id,billing_interval,price_kes,is_active'),
        client.from('platform_subscription_payments').select('id,subscription_id,business_id,amount_kes,payment_method,transaction_reference,status,paid_at,notes').order('paid_at', { ascending: false }).limit(500),
      ])
      if (businessError || subscriptionError || plansError || pricesError || paymentsError) throw businessError ?? subscriptionError ?? plansError ?? pricesError ?? paymentsError
      const businessMap = new Map((businesses ?? []).map((b) => [b.id, b]))
      const priceMap = new Map((prices ?? []).map((p) => [p.plan_id + ':' + p.billing_interval, Number(p.price_kes)]))
      const subscriptionRows = (subscriptions ?? []).map((s: any) => {
        const b = businessMap.get(s.business_id)
        const plan = s.subscription_plans
        const expected = priceMap.get(s.plan_id + ':' + s.billing_interval) ?? null
        const now = Date.now()
        const effective = s.status === 'cancelled' ? 'cancelled'
          : s.status === 'trialing' ? (s.trial_end && new Date(s.trial_end).getTime() > now ? 'trialing' : 'expired')
          : s.status === 'active' ? (s.current_period_end && new Date(s.current_period_end).getTime() > now ? 'active' : 'expired')
          : 'expired'
        return { ...s, business_name: b?.name ?? 'Unknown business', business_phone: b?.phone ?? null, subscription_exempt: b?.subscription_exempt ?? false, plan_name: plan?.name ?? 'Unknown plan', plan_code: plan?.code ?? null, effective_status: effective, expected_price_kes: expected }
      })
      const confirmed = (payments ?? []).filter((p) => p.status === 'confirmed')
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0)
      const collected = confirmed.reduce((sum, p) => sum + Number(p.amount_kes), 0)
      const collectedThisMonth = confirmed.filter((p) => new Date(p.paid_at) >= monthStart).reduce((sum, p) => sum + Number(p.amount_kes), 0)
      const revenueByPlan = new Map<string, number>()
      for (const p of confirmed) {
        const sub = (subscriptions ?? []).find((s) => s.id === p.subscription_id) as any
        const name = sub?.subscription_plans?.name ?? 'Unknown plan'
        revenueByPlan.set(name, (revenueByPlan.get(name) ?? 0) + Number(p.amount_kes))
      }
      return json({
        metrics: {
          total_collected_kes: collected,
          collected_this_month_kes: collectedThisMonth,
          active_subscriptions: subscriptionRows.filter((s) => !s.subscription_exempt && s.effective_status === 'active').length,
          trials: subscriptionRows.filter((s) => !s.subscription_exempt && s.effective_status === 'trialing').length,
          expired: subscriptionRows.filter((s) => !s.subscription_exempt && s.effective_status === 'expired').length,
          upcoming_renewals: subscriptionRows.filter((s) => s.effective_status === 'active' && s.current_period_end && new Date(s.current_period_end).getTime() >= Date.now() && new Date(s.current_period_end).getTime() <= Date.now() + 30 * 86400000).length,
        },
        subscriptions: subscriptionRows,
        businesses: businesses ?? [],
        plans: plans ?? [],
        prices: prices ?? [],
        payments: payments ?? [],
        revenue_by_plan: [...revenueByPlan.entries()].map(([plan_name, amount_kes]) => ({ plan_name, amount_kes })),
      })
    }

    if (payload.action === 'record_subscription_payment') {
      if (!payload.subscription_id || !Number.isFinite(payload.amount_kes) || Number(payload.amount_kes) <= 0 || !['mpesa','bank','cash','card','other'].includes(payload.payment_method ?? '')) return json({ error: 'Subscription, positive amount and valid payment method are required' }, 400)
      if (payload.payment_method === 'mpesa' && !payload.transaction_reference?.trim()) return json({ error: 'M-Pesa transaction reference is required' }, 400)
      const { data: subscription, error: subscriptionError } = await client.from('subscriptions').select('id,business_id').eq('id', payload.subscription_id).maybeSingle()
      if (subscriptionError) throw subscriptionError
      if (!subscription) return json({ error: 'Subscription not found' }, 404)
      const { data: payment, error } = await client.from('platform_subscription_payments').insert({
        subscription_id: subscription.id,
        business_id: subscription.business_id,
        amount_kes: Number(payload.amount_kes),
        payment_method: payload.payment_method,
        transaction_reference: payload.transaction_reference?.trim() || null,
        paid_at: payload.paid_at || new Date().toISOString(),
        recorded_by: authData.user.id,
        notes: payload.notes?.trim() || null,
        status: 'confirmed',
      }).select('*').single()
      if (error) {
        if (error.code === '23505') return json({ error: 'This payment reference has already been recorded.' }, 409)
        throw error
      }
      return json({ payment })
    }

    if (payload.action === 'analytics') {
      const days = payload.period === '7' ? 7 : payload.period === '90' ? 90 : payload.period === '365' ? 365 : 30
      const since = new Date(Date.now() - days * 86400000).toISOString()
      const [{ data: businesses, error: businessError }, { data: sales, error: salesError }, { data: returns, error: returnsError }, { data: payments, error: paymentsError }, { data: saleItems, error: itemsError }] = await Promise.all([
        client.from('businesses').select('id,name,business_mode,created_at,subscription_exempt').order('created_at', { ascending: false }).limit(1000),
        client.from('sales').select('id,business_id,receipt_number,total,status,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(10000),
        client.from('sales_returns').select('business_id,refund_amount,created_at').gte('created_at', since).limit(10000),
        client.from('payments').select('business_id,method,amount,created_at').gte('created_at', since).limit(10000),
        client.from('sale_items').select('sale_id,product_name,quantity,subtotal,created_at').gte('created_at', since).limit(20000),
      ])
      if (businessError || salesError || returnsError || paymentsError || itemsError) throw businessError ?? salesError ?? returnsError ?? paymentsError ?? itemsError
      const businessList = businesses ?? []
      const saleList = sales ?? []
      const completed = saleList.filter((s) => s.status === 'completed')
      const returnList = returns ?? []
      const refundTotal = returnList.reduce((sum, r) => sum + Number(r.refund_amount || 0), 0)
      const grossSales = completed.reduce((sum, s) => sum + Number(s.total || 0), 0)
      const businessMap = new Map(businessList.map((b) => [b.id, b.name]))
      const businessTotals = new Map<string, { business_id: string; business_name: string; transactions: number; gross_sales: number; refunds: number; last_sale: string | null }>()
      for (const b of businessList) businessTotals.set(b.id, { business_id: b.id, business_name: b.name, transactions: 0, gross_sales: 0, refunds: 0, last_sale: null })
      for (const s of completed) {
        const row = businessTotals.get(s.business_id)
        if (!row) continue
        row.transactions += 1
        row.gross_sales += Number(s.total || 0)
        if (!row.last_sale || s.created_at > row.last_sale) row.last_sale = s.created_at
      }
      for (const r of returnList) {
        const row = businessTotals.get(r.business_id)
        if (row) row.refunds += Number(r.refund_amount || 0)
      }
      const daily = new Map<string, { date: string; sales: number; transactions: number }>()
      for (const s of completed) {
        const date = s.created_at.slice(0, 10)
        const row = daily.get(date) ?? { date, sales: 0, transactions: 0 }
        row.sales += Number(s.total || 0); row.transactions += 1; daily.set(date, row)
      }
      const methods = new Map<string, number>()
      for (const p of payments ?? []) methods.set(p.method, (methods.get(p.method) ?? 0) + Number(p.amount || 0))
      const products = new Map<string, { product_name: string; quantity: number; sales_value: number }>()
      const completedIds = new Set(completed.map((s) => s.id))
      for (const item of saleItems ?? []) {
        if (!completedIds.has(item.sale_id)) continue
        const row = products.get(item.product_name) ?? { product_name: item.product_name, quantity: 0, sales_value: 0 }
        row.quantity += Number(item.quantity || 0); row.sales_value += Number(item.subtotal || 0); products.set(item.product_name, row)
      }
      const activeBusinessIds = new Set(completed.map((s) => s.business_id))
      const activeClients = businessList.filter((b) => activeBusinessIds.has(b.id)).length
      const clientRows = [...businessTotals.values()].map((row) => ({ ...row, net_sales: row.gross_sales - row.refunds })).sort((a, b) => b.gross_sales - a.gross_sales)
      return json({
        period_days: days,
        metrics: {
          total_businesses: businessList.length,
          active_clients: activeClients,
          completed_transactions: completed.length,
          gross_sales: grossSales,
          refunds: refundTotal,
          net_sales: grossSales - refundTotal,
          average_transaction: completed.length ? grossSales / completed.length : 0,
          transactions_all_statuses: saleList.length,
        },
        daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
        businesses: clientRows,
        payment_methods: [...methods.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
        top_products: [...products.values()].sort((a, b) => b.sales_value - a.sales_value).slice(0, 10),
        generated_at: new Date().toISOString(),
      })
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
        .select('return_id,original_sale_item_id,product_name,quantity,unit_price,refund_amount').in('return_id', returnIds.length ? returnIds : ['00000000-0000-0000-0000-000000000000'])
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

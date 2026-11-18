import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required.' }, 401)

  const token = authorization.slice(7)
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  const user = authData.user
  if (authError || !user) return json({ error: 'Invalid session.' }, 401)
  if (user.app_metadata?.platform_admin !== true) return json({ error: 'Platform administrator access required.' }, 403)

  let payload: { action?: string; businessId?: string; suspend?: boolean; reason?: string }
  try { payload = await request.json() } catch { return json({ error: 'Invalid request.' }, 400) }

  if (payload.action === 'set_access') {
    if (!payload.businessId || typeof payload.suspend !== 'boolean') {
      return json({ error: 'Business and access status are required.' }, 400)
    }
    const { data: subscription, error: readError } = await admin
      .from('subscriptions')
      .select('id,status,status_before_suspension')
      .eq('business_id', payload.businessId)
      .maybeSingle()
    if (readError) return json({ error: 'Could not load the business subscription.' }, 500)
    if (!subscription) return json({ error: 'This business has no subscription record to control.' }, 409)

    if (payload.suspend) {
      if (subscription.status === 'suspended') return json({ ok: true, status: 'suspended' })
      const { error } = await admin.from('subscriptions').update({
        status_before_suspension: subscription.status,
        status: 'suspended',
        suspended_at: new Date().toISOString(),
        suspension_reason: (payload.reason || 'Temporarily disabled by JIUZE platform admin').slice(0, 500),
      }).eq('id', subscription.id)
      if (error) return json({ error: 'Could not deactivate this business.' }, 500)
      return json({ ok: true, status: 'suspended' })
    }

    if (subscription.status !== 'suspended') return json({ ok: true, status: subscription.status })
    const restoredStatus = ['trialing', 'active', 'expired', 'cancelled'].includes(subscription.status_before_suspension)
      ? subscription.status_before_suspension
      : 'expired'
    const { error } = await admin.from('subscriptions').update({
      status: restoredStatus,
      status_before_suspension: null,
      suspended_at: null,
      suspension_reason: null,
    }).eq('id', subscription.id)
    if (error) return json({ error: 'Could not reactivate this business.' }, 500)
    return json({ ok: true, status: restoredStatus })
  }

  if (payload.action !== 'overview') return json({ error: 'Unknown action.' }, 400)

  const { data: businesses, error: businessesError } = await admin
    .from('businesses')
    .select('id,name,phone,location,business_mode,created_at,subscription_exempt,subscriptions(id,status,billing_interval,trial_end,current_period_end,suspended_at,suspension_reason,subscription_plans(name,code))')
    .order('created_at', { ascending: false })
  if (businessesError) return json({ error: 'Could not load businesses.' }, 500)

  const totals = new Map<string, { salesCount: number; salesTotal: number }>()
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data: sales, error } = await admin.from('sales')
      .select('business_id,total,status')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) return json({ error: 'Could not load sales analytics.' }, 500)
    for (const sale of sales ?? []) {
      if (sale.status !== 'completed') continue
      const current = totals.get(sale.business_id) ?? { salesCount: 0, salesTotal: 0 }
      current.salesCount += 1
      current.salesTotal += Number(sale.total || 0)
      totals.set(sale.business_id, current)
    }
    if (!sales || sales.length < pageSize) break
    from += pageSize
  }

  const rows = (businesses ?? []).map((business) => {
    const stats = totals.get(business.id) ?? { salesCount: 0, salesTotal: 0 }
    const subscription = Array.isArray(business.subscriptions) ? business.subscriptions[0] : business.subscriptions
    const plan = subscription && (Array.isArray(subscription.subscription_plans)
      ? subscription.subscription_plans[0]
      : subscription.subscription_plans)
    return {
      id: business.id,
      name: business.name,
      phone: business.phone,
      location: business.location,
      mode: business.business_mode,
      createdAt: business.created_at,
      subscriptionExempt: business.subscription_exempt,
      subscription: subscription ? {
        id: subscription.id,
        status: subscription.status,
        interval: subscription.billing_interval,
        trialEnd: subscription.trial_end,
        periodEnd: subscription.current_period_end,
        suspendedAt: subscription.suspended_at,
        suspensionReason: subscription.suspension_reason,
        planName: plan?.name ?? 'Unassigned',
        planCode: plan?.code ?? null,
      } : null,
      salesCount: stats.salesCount,
      salesTotal: Math.round(stats.salesTotal * 100) / 100,
    }
  })

  return json({
    businesses: rows,
    summary: {
      businesses: rows.length,
      activeSubscriptions: rows.filter((b) => b.subscription?.status === 'active' || b.subscription?.status === 'trialing').length,
      suspendedBusinesses: rows.filter((b) => b.subscription?.status === 'suspended').length,
      completedSales: rows.reduce((sum, b) => sum + b.salesCount, 0),
      salesTotal: Math.round(rows.reduce((sum, b) => sum + b.salesTotal, 0) * 100) / 100,
    },
  })
})

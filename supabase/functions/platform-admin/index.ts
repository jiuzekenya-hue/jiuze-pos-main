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

    let payload: { action?: string }
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

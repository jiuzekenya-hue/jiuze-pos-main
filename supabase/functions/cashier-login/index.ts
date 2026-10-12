import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let payload: { action?: string; businessId?: string; cashierId?: string; password?: string }
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }

  if (payload.action === 'businesses') {
    const { data, error } = await admin
      .from('businesses')
      .select('id, name')
      .order('name', { ascending: true })

    if (error) return json({ error: 'Unable to load businesses.' }, 500)
    return json({ businesses: (data ?? []).map((business) => ({ id: business.id, name: business.name })) })
  }

  if (payload.action === 'cashiers') {
    const businessId = String(payload.businessId ?? '').trim()
    if (!businessId) return json({ cashiers: [] })

    const { data, error } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('business_id', businessId)
      .in('role', ['owner', 'cashier'])
      .order('full_name', { ascending: true })

    if (error) return json({ error: 'Unable to load cashier accounts.' }, 500)
    return json({
      cashiers: (data ?? []).map((profile) => ({
        id: profile.id,
        fullName: profile.full_name,
      })),
    })
  }

  if (payload.action === 'sign_in') {
    const businessId = String(payload.businessId ?? '').trim()
    const cashierId = String(payload.cashierId ?? '').trim()
    const password = String(payload.password ?? '')

    if (!businessId || !cashierId || !password) {
      return json({ error: 'Select your business and cashier, then enter your password.' }, 400)
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, business_id')
      .eq('id', cashierId)
      .eq('business_id', businessId)
      .in('role', ['owner', 'cashier'])
      .maybeSingle()

    if (profileError || !profile) {
      return json({ error: 'Invalid cashier selection or password.' }, 401)
    }

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id)
    const email = userData.user?.email
    if (userError || !email) {
      return json({ error: 'This account cannot sign in. Contact your business owner.' }, 401)
    }

    // Authenticate through Supabase Auth; the selected user's email stays server-side.
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    if (!authResponse.ok) {
      return json({ error: 'Incorrect password. Try again.' }, 401)
    }

    const session = await authResponse.json()
    return json({
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
    })
  }

  return json({ error: 'Unknown action.' }, 400)
})

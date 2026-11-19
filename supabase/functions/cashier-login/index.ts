import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const publicAuth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })

async function requestKey(request: Request) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let payload: { action?: string; pin?: string }
  try { payload = await request.json() } catch { return json({ error: 'Invalid request.' }, 400) }

  if (payload.action !== 'sign_in') return json({ error: 'Unknown action.' }, 400)
  const pin = String(payload.pin ?? '')
  if (!/^\d{6}$/.test(pin)) return json({ error: 'Enter your 6-digit cashier PIN.' }, 400)

  const ipKey = await requestKey(request)
  const { data: attempt } = await admin.from('cashier_pin_login_attempts')
    .select('failed_attempts, locked_until').eq('ip_key', ipKey).maybeSingle()
  if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > Date.now()) {
    return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429)
  }

  const { data: matches, error: verifyError } = await admin.rpc('platform_verify_cashier_pin', { p_pin: pin })
  const match = !verifyError && Array.isArray(matches) ? matches[0] : null
  if (!match?.cashier_id || !match?.business_id) {
    await admin.rpc('platform_cashier_pin_failure', { p_ip_key: ipKey })
    return json({ error: 'Invalid PIN. Check your PIN and try again.' }, 401)
  }

  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('id, business_id, role').eq('id', match.cashier_id)
    .eq('business_id', match.business_id).eq('role', 'cashier').maybeSingle()
  if (profileError || !profile) {
    await admin.rpc('platform_cashier_pin_failure', { p_ip_key: ipKey })
    return json({ error: 'Unable to sign in. Contact your business owner.' }, 401)
  }

  const { data: authData, error: userError } = await admin.auth.admin.getUserById(profile.id)
  const user = authData.user
  if (userError || !user?.email || (user.banned_until && new Date(user.banned_until).getTime() > Date.now())) {
    return json({ error: 'This cashier account is unavailable. Contact your business owner.' }, 403)
  }

  // Create a real Supabase Auth session for the matched cashier; no credentials are exposed to the browser.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  })
  const tokenHash = linkData?.properties?.hashed_token
  if (linkError || !tokenHash) return json({ error: 'Unable to create a secure session. Try again.' }, 500)

  const { data: verified, error: sessionError } = await publicAuth.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  })
  if (sessionError || !verified.session) return json({ error: 'Unable to complete sign-in. Try again.' }, 500)

  await admin.rpc('platform_cashier_pin_clear_attempts', { p_ip_key: ipKey })
  return json({
    session: {
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
    },
  })
})

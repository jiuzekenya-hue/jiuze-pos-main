import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const publicAuth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  let payload: { action?: string; pin?: string }
  try { payload = await request.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  if (payload.action !== 'sign_in') return json({ error: 'Unknown action.' }, 400)
  const pin = String(payload.pin ?? '')
  if (!/^\d{6}$/.test(pin)) return json({ error: 'Enter your 6-digit cashier PIN.' }, 400)
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const ipKey = await hash(forwarded)
  const { data: attempt } = await admin.from('cashier_pin_login_attempts').select('failed_attempts,locked_until').eq('ip_key', ipKey).maybeSingle()
  if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > Date.now()) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429)
  const { data: matches, error: verifyError } = await admin.rpc('platform_verify_cashier_pin', { p_pin: pin })
  const match = !verifyError && Array.isArray(matches) ? matches[0] : null
  if (!match) {
    const { data: failed } = await admin.rpc('platform_cashier_pin_failure', { p_ip_key: ipKey })
    const locked = Array.isArray(failed) && failed[0]?.locked_until
    return json({ error: locked ? 'Too many incorrect attempts. Try again in 15 minutes.' : 'Incorrect PIN. Try again.' }, locked ? 429 : 401)
  }
  const { data: profile, error: profileError } = await admin.from('profiles').select('id,business_id,role').eq('id', match.cashier_id).eq('business_id', match.business_id).eq('role', 'cashier').maybeSingle()
  if (profileError || !profile) return json({ error: 'This cashier account is unavailable.' }, 401)
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id)
  const email = userData.user?.email
  if (userError || !email) return json({ error: 'This cashier account cannot sign in. Contact the owner.' }, 401)
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = linkData?.properties?.hashed_token
  if (linkError || !tokenHash) return json({ error: 'Unable to establish a secure session. Try again.' }, 500)
  const { data: sessionData, error: sessionError } = await publicAuth.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (sessionError || !sessionData.session) return json({ error: 'Unable to establish a secure session. Try again.' }, 500)
  await admin.rpc('platform_cashier_pin_clear_attempts', { p_ip_key: ipKey })
  return json({ session: { access_token: sessionData.session.access_token, refresh_token: sessionData.session.refresh_token } })
})

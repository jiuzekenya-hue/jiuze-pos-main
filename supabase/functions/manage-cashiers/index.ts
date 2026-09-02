import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type CreatePayload = {
  action: 'create'
  email: string
  password: string
  fullName?: string
  phone?: string
}

type ListPayload = { action: 'list' }
type DeletePayload = { action: 'delete'; userId: string }

type Payload = ListPayload | CreatePayload | DeletePayload

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing authorization' }, 401)

  const token = authHeader.slice('Bearer '.length)
  const client = admin()
  const { data: authData, error: authError } = await client.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Invalid session' }, 401)

  const { data: ownerProfile, error: profileError } = await client
    .from('profiles')
    .select('business_id, role')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError || !ownerProfile || ownerProfile.role !== 'owner') {
    return json({ error: 'Owner access required' }, 403)
  }

  let payload: Payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (payload.action === 'list') {
    const { data: profiles, error } = await client
      .from('profiles')
      .select('id, business_id, full_name, phone, role, created_at')
      .eq('business_id', ownerProfile.business_id)
      .order('created_at', { ascending: true })

    if (error) return json({ error: error.message }, 500)

    const users = await Promise.all(
      (profiles ?? []).map(async (profile) => {
        const { data: authUser } = await client.auth.admin.getUserById(profile.id)
        return {
          id: profile.id,
          email: authUser.user?.email ?? null,
          fullName: profile.full_name,
          phone: profile.phone,
          role: profile.role,
          createdAt: profile.created_at,
        }
      }),
    )

    return json({ users })
  }

  if (payload.action === 'delete') {
    const userId = String(payload.userId ?? '').trim()
    if (!userId) return json({ error: 'User ID is required' }, 400)
    if (userId === authData.user.id) return json({ error: 'You cannot remove your own account' }, 400)

    const { data: target, error: targetError } = await client
      .from('profiles')
      .select('id, business_id, role')
      .eq('id', userId)
      .eq('business_id', ownerProfile.business_id)
      .maybeSingle()

    if (targetError) return json({ error: targetError.message }, 500)
    if (!target) return json({ error: 'Cashier not found in your business' }, 404)
    if (target.role !== 'cashier') return json({ error: 'Only cashier accounts can be removed' }, 400)

    const { count: salesCount, error: salesError } = await client
      .from('sales')
      .select('id', { count: 'exact', head: true })
      .eq('cashier_id', userId)

    if (salesError) return json({ error: salesError.message }, 500)
    if ((salesCount ?? 0) > 0) {
      return json({ error: 'This cashier has recorded sales and cannot be removed. Deactivate the account instead.' }, 409)
    }

    const { count: movementCount, error: movementError } = await client
      .from('stock_movements')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)

    if (movementError) return json({ error: movementError.message }, 500)
    if ((movementCount ?? 0) > 0) {
      return json({ error: 'This cashier has stock history and cannot be removed. Deactivate the account instead.' }, 409)
    }

    const { error: deleteError } = await client.auth.admin.deleteUser(userId)
    if (deleteError) return json({ error: deleteError.message }, 400)

    return json({ success: true })
  }

  if (payload.action !== 'create') return json({ error: 'Unknown action' }, 400)

  const email = String(payload.email ?? '').trim().toLowerCase()
  const password = String(payload.password ?? '')
  const fullName = String(payload.fullName ?? '').trim() || null
  const phone = String(payload.phone ?? '').trim() || null

  if (!email || !email.includes('@')) return json({ error: 'A valid email is required' }, 400)
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)
  if (fullName && fullName.length > 100) return json({ error: 'Full name is too long' }, 400)
  if (phone && phone.length > 50) return json({ error: 'Phone number is too long' }, 400)

  const { data: created, error: createError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError || !created.user) {
    return json({ error: createError?.message ?? 'Unable to create auth user' }, 400)
  }

  const { error: insertError } = await client.from('profiles').insert({
    id: created.user.id,
    business_id: ownerProfile.business_id,
    full_name: fullName,
    phone,
    role: 'cashier',
  })

  if (insertError) {
    await client.auth.admin.deleteUser(created.user.id)
    return json({ error: insertError.message }, 400)
  }

  return json({
    user: {
      id: created.user.id,
      email: created.user.email,
      fullName,
      phone,
      role: 'cashier',
    },
  }, 201)
})

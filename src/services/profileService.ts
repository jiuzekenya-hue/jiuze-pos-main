import { supabase } from '../lib/supabase'
import { isRole, type Role } from '../types/auth'

/**
 * Shape of the row this app expects from the `profiles` table once it
 * exists (Phase 3, see implementation brief §6). Kept intentionally
 * minimal — only the fields Phase 2's auth/permission layer needs.
 */
export interface Profile {
  id: string
  businessId: string
  fullName: string | null
  role: Role
}

export type ProfileLoadResult =
  | { status: 'loaded'; profile: Profile }
  | { status: 'not_found'; reason: 'no_profile_row' }
  | { status: 'schema_pending'; reason: 'profiles_table_missing' }
  | { status: 'error'; reason: string }

/**
 * Loads the authenticated user's profile (business_id + role) from
 * Supabase.
 *
 * IMPORTANT: The `profiles` table does not exist until Phase 3. This
 * function is written against the schema the brief defines, and is
 * expected to fail with `schema_pending` until that table is created.
 * Nothing about the auth or permission architecture needs to change
 * when Phase 3 lands — only this function starts succeeding.
 *
 * The role returned here is informational for the UI only. It must
 * never be treated as the authoritative security boundary — see
 * src/lib/permissions.ts and the Phase 3 RLS policies.
 */
export async function fetchProfile(userId: string): Promise<ProfileLoadResult> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, business_id, full_name, role')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    // PostgREST returns 42P01 (undefined_table) when the table doesn't
    // exist yet. Treat that distinctly from a real error so the UI can
    // say "waiting on Phase 3" instead of "something is broken".
    if (error.code === '42P01' || /relation .*profiles.* does not exist/i.test(error.message)) {
      return { status: 'schema_pending', reason: 'profiles_table_missing' }
    }
    return { status: 'error', reason: error.message }
  }

  if (!data) {
    return { status: 'not_found', reason: 'no_profile_row' }
  }

  if (!isRole(data.role)) {
    return { status: 'error', reason: `Unrecognized role "${String(data.role)}"` }
  }

  return {
    status: 'loaded',
    profile: {
      id: data.id,
      businessId: data.business_id,
      fullName: data.full_name,
      role: data.role,
    },
  }
}

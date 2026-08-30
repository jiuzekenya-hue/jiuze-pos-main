import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../test/supabaseMock'

const mock = createSupabaseMock()

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return mock.supabase
  },
}))

const { fetchProfile } = await import('./profileService')

describe('fetchProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns schema_pending when the profiles table does not exist (Phase 3 not deployed)', async () => {
    mock.__setProfilesQueryResult({
      data: null,
      error: { code: '42P01', message: 'relation "public.profiles" does not exist' },
    })

    const result = await fetchProfile('user-1')
    expect(result).toEqual({ status: 'schema_pending', reason: 'profiles_table_missing' })
  })

  it('returns not_found when the table exists but has no row for the user', async () => {
    mock.__setProfilesQueryResult({ data: null, error: null })

    const result = await fetchProfile('user-1')
    expect(result).toEqual({ status: 'not_found', reason: 'no_profile_row' })
  })

  it('returns loaded with a mapped profile when the row is valid', async () => {
    mock.__setProfilesQueryResult({
      data: { id: 'user-1', business_id: 'biz-1', full_name: 'Amina', role: 'owner' },
      error: null,
    })

    const result = await fetchProfile('user-1')
    expect(result).toEqual({
      status: 'loaded',
      profile: { id: 'user-1', businessId: 'biz-1', fullName: 'Amina', role: 'owner' },
    })
  })

  it('returns an error for an unrecognized role value rather than defaulting silently', async () => {
    mock.__setProfilesQueryResult({
      data: { id: 'user-1', business_id: 'biz-1', full_name: 'Amina', role: 'super-admin' },
      error: null,
    })

    const result = await fetchProfile('user-1')
    expect(result.status).toBe('error')
  })

  it('surfaces a genuine database error distinctly from schema_pending', async () => {
    mock.__setProfilesQueryResult({
      data: null,
      error: { code: '08006', message: 'connection failure' },
    })

    const result = await fetchProfile('user-1')
    expect(result).toEqual({ status: 'error', reason: 'connection failure' })
  })
})

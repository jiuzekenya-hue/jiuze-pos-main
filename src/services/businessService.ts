import { supabase } from '../lib/supabase'

export interface Business {
  id: string
  name: string
  phone: string | null
  location: string | null
  currency: string
}

export async function getBusiness(businessId: string): Promise<Business> {
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, phone, location, currency')
    .eq('id', businessId)
    .single()

  if (error) throw new Error(error.message)
  return data as Business
}

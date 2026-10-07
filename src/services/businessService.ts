import { supabase } from '../lib/supabase'

export type BusinessMode = 'retail' | 'bar_restaurant'

export interface Business {
  id: string
  name: string
  phone: string | null
  location: string | null
  currency: string
  businessMode: BusinessMode
}

export async function getBusiness(businessId: string): Promise<Business> {
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, phone, location, currency, business_mode')
    .eq('id', businessId)
    .single()

  if (error) throw new Error(error.message)
  return {
    ...(data as Omit<Business, 'businessMode'> & { business_mode: BusinessMode }),
    businessMode: data.business_mode as BusinessMode,
  }
}

export async function updateBusinessMode(businessId: string, businessMode: BusinessMode): Promise<void> {
  const { error } = await supabase
    .from('businesses')
    .update({ business_mode: businessMode })
    .eq('id', businessId)

  if (error) throw new Error(error.message)
}

import { supabase } from '../lib/supabase'

export interface ReferralSummary {
  referralCode: string
  totalReferrals: number
}

export async function getReferralSummary(businessId: string): Promise<ReferralSummary> {
  const [{ data: business, error: businessError }, { count, error: referralError }] = await Promise.all([
    supabase.from('businesses').select('referral_code').eq('id', businessId).single(),
    supabase.from('business_referrals').select('id', { count: 'exact', head: true }).eq('referrer_business_id', businessId),
  ])
  if (businessError) throw new Error(businessError.message)
  if (referralError) throw new Error(referralError.message)
  return { referralCode: business.referral_code, totalReferrals: count ?? 0 }
}

export function getReferralLink(referralCode: string): string {
  return window.location.origin + '/signup?ref=' + encodeURIComponent(referralCode)
}

export function getWhatsAppReferralUrl(referralCode: string): string {
  const link = getReferralLink(referralCode)
  const message = 'Try JIUZE POS for your business. Start with a 7-day free trial: ' + link
  return 'https://wa.me/?text=' + encodeURIComponent(message)
}

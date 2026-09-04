import { supabase } from '../lib/supabase'

export type BillingInterval = 'month' | 'year'
export type SubscriptionStatus = 'trialing' | 'active' | 'expired' | 'cancelled'
export type EntitlementValue = boolean | number | string

export type SubscriptionPlan = {
  id: string
  name: string
  code: 'start' | 'grow' | 'pro'
  description: string | null
  trial_days: number
  prices: Partial<Record<BillingInterval, number>>
  features: Record<string, EntitlementValue>
}

export type SubscriptionStatusData = {
  business_id: string
  subscription_id: string | null
  plan_code: SubscriptionPlan['code'] | null
  plan_name: string | null
  billing_interval: 'trial' | BillingInterval | null
  price_kes: number | null
  status: SubscriptionStatus
  access: boolean
  days_remaining: number
  trial_start?: string | null
  trial_end?: string | null
  current_period_start?: string | null
  current_period_end?: string | null
  cancelled_at?: string | null
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatusData> {
  const { data, error } = await supabase.rpc('get_subscription_status')
  if (error) throw new Error(error.message)
  return data as SubscriptionStatusData
}

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const [plansResult, pricesResult, featuresResult, entitlementsResult] = await Promise.all([
    supabase.from('subscription_plans').select('id, name, code, description, trial_days').eq('is_active', true).order('id'),
    supabase.from('subscription_prices').select('plan_id, billing_interval, price_kes').eq('is_active', true),
    supabase.from('subscription_features').select('id, feature_key, name, description, value_type'),
    supabase.from('plan_features').select('plan_id, feature_id, entitlement_value'),
  ])

  if (plansResult.error) throw new Error(plansResult.error.message)
  if (pricesResult.error) throw new Error(pricesResult.error.message)
  if (featuresResult.error) throw new Error(featuresResult.error.message)
  if (entitlementsResult.error) throw new Error(entitlementsResult.error.message)

  const pricesByPlan = new Map<string, Partial<Record<BillingInterval, number>>>()
  for (const price of pricesResult.data ?? []) {
    const current = pricesByPlan.get(price.plan_id) ?? {}
    current[price.billing_interval as BillingInterval] = Number(price.price_kes)
    pricesByPlan.set(price.plan_id, current)
  }

  const featureKeyById = new Map((featuresResult.data ?? []).map((feature) => [feature.id, feature.feature_key]))
  const featuresByPlan = new Map<string, Record<string, EntitlementValue>>()
  for (const entitlement of entitlementsResult.data ?? []) {
    const key = featureKeyById.get(entitlement.feature_id)
    if (!key) continue
    const current = featuresByPlan.get(entitlement.plan_id) ?? {}
    const value = entitlement.entitlement_value
    current[key] = typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string'
      ? value
      : Number(value) === value ? Number(value) : String(value)
    featuresByPlan.set(entitlement.plan_id, current)
  }

  return (plansResult.data ?? []).map((plan) => ({
    id: plan.id,
    name: plan.name,
    code: plan.code,
    description: plan.description,
    trial_days: Number(plan.trial_days),
    prices: pricesByPlan.get(plan.id) ?? {},
    features: featuresByPlan.get(plan.id) ?? {},
  })) as SubscriptionPlan[]
}

export async function hasSubscriptionFeature(featureKey: string): Promise<boolean> {
  const [status, plans] = await Promise.all([getSubscriptionStatus(), getSubscriptionPlans()])
  if (!status.access || !status.plan_code) return false
  const plan = plans.find((item) => item.code === status.plan_code)
  return Boolean(plan?.features[featureKey])
}

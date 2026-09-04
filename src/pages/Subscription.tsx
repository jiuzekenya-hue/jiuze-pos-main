import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import {
  getSubscriptionPlans,
  getSubscriptionStatus,
  type BillingInterval,
  type SubscriptionPlan,
  type SubscriptionStatusData,
} from '../services/subscriptionService'

const money = (value: number) =>
  `KES ${value.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`

const featureLabels: Record<string, string> = {
  checkout: 'POS checkout',
  inventory: 'Inventory management',
  sales_history: 'Sales history',
  basic_reports: 'Basic reports',
  receipts: 'Receipts',
  analytics: 'Business analytics',
  pnl: 'Profit & Loss',
  projections: 'Weekly & monthly projections',
  product_performance: 'Product performance',
  cashier_management: 'Cashier management',
  exports: 'Data exports',
  advanced_inventory: 'Advanced inventory',
  multi_branch: 'Multiple branches',
  advanced_permissions: 'Advanced permissions',
  advanced_analytics: 'Advanced analytics',
  consolidated_reporting: 'Consolidated reporting',
  api_access: 'API access',
}

const featureOrder = Object.keys(featureLabels)

export default function Subscription() {
  const { profile } = useAuth()
  const [status, setStatus] = useState<SubscriptionStatusData | null>(null)
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [interval, setInterval] = useState<BillingInterval>('month')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile?.businessId) return

    setLoading(true)
    setError('')

    Promise.all([getSubscriptionStatus(), getSubscriptionPlans()])
      .then(([subscriptionStatus, subscriptionPlans]) => {
        setStatus(subscriptionStatus)

        setPlans(
          subscriptionPlans.sort(
            (a, b) =>
              ['start', 'grow', 'pro'].indexOf(a.code) -
              ['start', 'grow', 'pro'].indexOf(b.code),
          ),
        )
      })
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load subscription information.',
        ),
      )
      .finally(() => setLoading(false))
  }, [profile?.businessId])

  const comparisonFeatures = useMemo(() => {
    const keys = new Set<string>()

    for (const plan of plans) {
      featureOrder.forEach((key) => {
        if (plan.features[key] !== undefined) {
          keys.add(key)
        }
      })
    }

    return Array.from(keys)
  }, [plans])

  if (loading) {
    return (
      <main className="min-h-screen bg-paper px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl rounded-2xl border border-line bg-paper-raised p-14 text-center text-sm text-ink-muted">
          Loading subscription…
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-market-600">
              Account
            </p>

            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Subscription
            </h1>

            <p className="mt-2 max-w-2xl text-sm text-ink-muted">
              Choose the JIUZE POS plan that fits the way your business operates.
            </p>
          </div>

          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-paper-raised px-4 py-2.5 text-sm font-medium text-ink"
          >
            Back to dashboard
          </Link>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-brick-500/20 bg-brick-500/5 px-4 py-3 text-sm text-brick-600"
          >
            {error}
          </div>
        )}

        {status && (
          <section className="mb-6 rounded-2xl border border-line bg-paper-raised p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-market-600">
                  Current access
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl font-semibold text-ink">
                    {status.plan_name ?? 'No plan'}
                  </h2>

                  <span className="rounded-full bg-market-50 px-3 py-1 text-xs font-medium capitalize text-market-700">
                    {status.status}
                  </span>
                </div>

                <p className="mt-1 text-sm text-ink-muted">
                  {status.status === 'trialing'
                    ? 'Your 7-day trial is active.'
                    : status.status === 'active'
                      ? 'Your subscription is active.'
                      : 'Your POS subscription requires attention.'}
                </p>
              </div>

              <div className="text-left sm:text-right">
                <p className="font-display text-2xl font-semibold text-ink">
                  {status.days_remaining}
                </p>

                <p className="text-xs text-ink-muted">days remaining</p>
              </div>
            </div>
          </section>
        )}

        <div className="mb-5 flex justify-center">
          <div className="inline-flex rounded-full border border-line bg-paper-raised p-1">
            {(['month', 'year'] as BillingInterval[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                className={`rounded-full px-4 py-2 text-xs font-medium ${
                  interval === value
                    ? 'bg-ink text-paper'
                    : 'text-ink-muted'
                }`}
              >
                {value === 'month'
                  ? 'Monthly'
                  : 'Annual · 2 months free'}
              </button>
            ))}
          </div>
        </div>

        <section className="grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.code === status?.plan_code
            const price = plan.prices[interval] ?? 0

            return (
              <article
                key={plan.code}
                className={`relative overflow-hidden rounded-2xl border bg-paper-raised p-5 sm:p-6 ${
                  plan.code === 'grow'
                    ? 'border-market-300 shadow-sm'
                    : 'border-line'
                }`}
              >
                {plan.code === 'grow' && (
                  <span className="absolute right-4 top-4 rounded-full bg-market-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-market-700">
                    Most popular
                  </span>
                )}

                <p className="text-xs font-medium uppercase tracking-[0.12em] text-market-600">
                  {plan.name}
                </p>

                <h2 className="mt-3 font-display text-3xl font-semibold text-ink">
                  {money(price)}
                  <span className="text-sm font-normal text-ink-muted">
                    /{interval === 'month' ? 'month' : 'year'}
                  </span>
                </h2>

                <p className="mt-2 min-h-10 text-sm leading-5 text-ink-muted">
                  {plan.description}
                </p>

                <button
                  type="button"
                  disabled={isCurrent}
                  className="mt-5 min-h-11 w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper disabled:cursor-default disabled:bg-paper disabled:text-ink-muted disabled:ring-1 disabled:ring-line"
                >
                  {isCurrent
                    ? 'Current plan'
                    : `Choose ${
                        plan.code.charAt(0).toUpperCase() +
                        plan.code.slice(1)
                      }`}
                </button>

                <div className="mt-6 border-t border-line pt-5">
                  <p className="text-xs font-medium text-ink">Includes</p>

                  <ul className="mt-3 space-y-2.5">
                    {featureOrder
                      .filter((key) => plan.features[key] === true)
                      .map((key) => (
                        <li
                          key={key}
                          className="flex gap-2 text-sm text-ink-muted"
                        >
                          <span className="text-market-600">✓</span>
                          {featureLabels[key]}
                        </li>
                      ))}

                    <li className="flex gap-2 text-sm text-ink-muted">
                      <span className="text-market-600">✓</span>
                      Up to{' '}
                      {Number(plan.features.max_products).toLocaleString()}{' '}
                      active products
                    </li>

                    <li className="flex gap-2 text-sm text-ink-muted">
                      <span className="text-market-600">✓</span>
                      Up to {plan.features.max_cashiers} cashier
                      {Number(plan.features.max_cashiers) === 1 ? '' : 's'}
                    </li>
                  </ul>
                </div>
              </article>
            )
          })}
        </section>

        <section className="mt-7 overflow-hidden rounded-2xl border border-line bg-paper-raised">
          <div className="border-b border-line p-5 sm:p-6">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-market-600">
              Compare
            </p>

            <h2 className="mt-2 font-display text-xl font-semibold text-ink">
              Plan features
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-5 py-4 font-medium text-ink">
                    Feature
                  </th>

                  {plans.map((plan) => (
                    <th
                      key={plan.code}
                      className="px-5 py-4 font-medium text-ink"
                    >
                      {plan.name.replace('JIUZE ', '')}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {comparisonFeatures.map((key) => (
                  <tr
                    key={key}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-5 py-3 text-ink-muted">
                      {featureLabels[key]}
                    </td>

                    {plans.map((plan) => (
                      <td
                        key={plan.code}
                        className="px-5 py-3 text-ink"
                      >
                        {typeof plan.features[key] === 'boolean'
                          ? plan.features[key]
                            ? 'Included'
                            : '—'
                          : String(plan.features[key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-ink-muted">
          Payments will be securely processed through the JIUZE subscription
          billing flow. Retail customer payments inside the POS remain separate
          from your JIUZE subscription.
        </p>
      </div>
    </main>
  )
}
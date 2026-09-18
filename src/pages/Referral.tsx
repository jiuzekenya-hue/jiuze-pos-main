import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/auth-context'
import { getReferralSummary, getReferralLink, getWhatsAppReferralUrl } from '../services/referralService'

export default function Referral() {
  const { profile, role } = useAuth()
  const [referral, setReferral] = useState<{ referralCode: string; totalReferrals: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile?.businessId && role === 'owner') {
      void getReferralSummary(profile.businessId)
        .then(setReferral)
        .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load referrals.'))
    }
  }, [profile?.businessId, role])

  if (role !== 'owner') return <main className="min-h-screen bg-paper px-5 py-8"><p className="text-sm text-ink-muted">Referral sharing is available to business owners.</p></main>
  if (error) return <main className="min-h-screen bg-paper px-5 py-8"><p role="alert" className="rounded-xl border border-brick-200 bg-brick-50 px-4 py-3 text-sm text-brick-700">{error}</p></main>
  if (!referral) return <main className="min-h-screen bg-paper flex items-center justify-center text-sm text-ink-muted">Loading referrals…</main>

  const link = getReferralLink(referral.referralCode)

  return (
    <main className="min-h-screen bg-paper px-5 py-6 sm:px-6 sm:py-8">
      <div className="max-w-xl mx-auto">
        <header className="mb-7">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-market-600">JIUZE POS</p>
          <h1 className="font-display font-semibold text-3xl text-ink mt-2">Refer a business</h1>
          <p className="text-sm text-ink-muted mt-2">Share JIUZE POS with another shop and invite them to start a 7-day free trial.</p>
        </header>

        <section className="rounded-2xl border border-line bg-paper-raised p-5 sm:p-7">
          <div className="rounded-xl bg-paper px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Your referral code</p>
            <p className="font-mono font-semibold text-xl text-ink mt-1">{referral.referralCode}</p>
            <p className="text-xs text-ink-muted mt-1">{referral.totalReferrals} {referral.totalReferrals === 1 ? 'referral' : 'referrals'}</p>
          </div>

          <div className="mt-5 space-y-3">
            <a href={getWhatsAppReferralUrl(referral.referralCode)} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center rounded-xl bg-market-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-market-700 transition-colors">
              Share on WhatsApp
            </a>
            <button type="button" onClick={() => {
              void navigator.clipboard.writeText(link).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1800)
              })
            }} className="flex w-full items-center justify-center rounded-xl border border-line bg-paper px-4 py-3.5 text-sm font-medium text-ink">
              {copied ? 'Referral link copied' : 'Copy referral link'}
            </button>
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <p className="text-xs uppercase tracking-wide text-ink-muted">How it works</p>
            <ol className="mt-3 space-y-3 text-sm text-ink">
              <li><span className="font-semibold">1.</span> Share your referral link.</li>
              <li><span className="font-semibold">2.</span> The business signs up using your link.</li>
              <li><span className="font-semibold">3.</span> JIUZE POS records the referral.</li>
            </ol>
          </div>
        </section>
      </div>
    </main>
  )
}

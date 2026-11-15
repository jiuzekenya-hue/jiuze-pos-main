import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'

const sections = [
  { to: '/platform-admin', label: 'Overview', end: true },
  { to: '/platform-admin/businesses', label: 'Businesses' },
  { to: '/platform-admin/subscriptions', label: 'Subscriptions' },
  { to: '/platform-admin/activity', label: 'Activity' },
]

export default function PlatformAdminShell() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-[#f5f6f3] text-[#17231d]">
      <header className="sticky top-0 z-40 border-b border-[#dfe5df] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0b2b1d] font-display text-lg font-bold text-[#e9b949]">J</div>
            <div>
              <p className="font-display text-lg font-semibold tracking-tight">JIUZE <span className="text-[#b98520]">ADMIN</span></p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#738078]">Platform control centre</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-xs text-[#68766d] sm:block">{user?.email}</span>
            <NavLink to="/dashboard" className="rounded-lg border border-[#d9e1da] px-3 py-2 text-xs font-semibold text-[#294b39] transition hover:bg-[#f2f6f2]">Open POS</NavLink>
            <button type="button" onClick={() => void signOut()} className="rounded-lg px-3 py-2 text-xs font-medium text-[#78837b] hover:bg-[#f4f5f2] hover:text-[#17231d]">Sign out</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-5 pb-3 sm:px-8" aria-label="JIUZE Admin navigation">
          {sections.map((section) => <NavLink key={section.to} to={section.to} end={section.end} className={({ isActive }) => `whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-[#0b2b1d] text-white shadow-sm' : 'text-[#647269] hover:bg-[#eef2ed] hover:text-[#17231d]'}`}>{section.label}</NavLink>)}
        </nav>
      </header>
      <div className="min-h-[calc(100vh-118px)]">
        <Outlet />
      </div>
    </div>
  )
}

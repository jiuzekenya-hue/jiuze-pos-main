import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'

const sections = [
  { to: '/platform-admin', label: 'Overview', end: true },
  { to: '/platform-admin/businesses', label: 'Businesses' },
  { to: '/platform-admin/subscriptions', label: 'Subscriptions' },
  { to: '/platform-admin/activity', label: 'Activity' },
  { to: '/platform-admin/sales', label: 'Sales Control' },
  { to: '/platform-admin/analytics', label: 'Analytics' },
]

export default function PlatformAdminShell() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-[#f4f6f2] text-[#17231d]">
      <header className="sticky top-0 z-40 border-b border-[#dfe5df] bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#0b2b1d] font-display text-xl font-bold text-[#e9b949]">J</div>
              <div>
                <p className="font-display text-xl font-bold tracking-tight">JIUZE <span className="text-[#b98520]">DIGITAL</span></p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#738078]">Business operating platform</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-[#68766d] md:block">{user?.email}</span>
              <button type="button" onClick={() => void signOut()} className="rounded-lg px-3 py-2 text-xs font-medium text-[#78837b] transition hover:bg-[#f4f5f2] hover:text-[#17231d]">Sign out</button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[#edf0eb] py-3">
            <span className="mr-2 hidden text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b978e] sm:block">Workspaces</span>
            <NavLink to="/dashboard" className="inline-flex min-w-[130px] items-center justify-center gap-2 rounded-xl border border-[#dbe3dc] bg-white px-5 py-3 text-sm font-semibold text-[#365444] transition hover:border-[#9eb6a5] hover:bg-[#f5f8f4]">
              <span aria-hidden="true">▦</span> POS
            </NavLink>
            <NavLink to="/platform-admin" end className={({ isActive }) => `inline-flex min-w-[160px] items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition ${isActive ? 'border border-[#0b2b1d] bg-[#0b2b1d] text-white shadow-sm' : 'border border-[#e7d5a7] bg-[#fbf5e7] text-[#8b641b] hover:bg-[#f7edda]'}`}>
              <span aria-hidden="true">◆</span> JIUZE Admin
            </NavLink>
            <span className="ml-auto hidden rounded-full bg-[#edf4ee] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#41634c] sm:inline-flex">Super Admin workspace</span>
          </div>

          <nav className="flex gap-2 overflow-x-auto pb-3" aria-label="JIUZE Admin sections">
            {sections.map((section) => (
              <NavLink key={section.to} to={section.to} end={section.end} className={({ isActive }) => `whitespace-nowrap rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${isActive ? 'border-[#e8cf8d] bg-[#fbf4e4] text-[#805d18]' : 'border-transparent bg-transparent text-[#647269] hover:border-[#e3e9e2] hover:bg-[#f4f7f2] hover:text-[#17231d]'}`}>
                {section.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <div className="min-h-[calc(100vh-190px)]">
        <Outlet />
      </div>
    </div>
  )
}

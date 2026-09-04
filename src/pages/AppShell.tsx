import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../contexts/auth-context'
import { can } from '../lib/permissions'
import { useOnlineStatus } from '../lib/useOnlineStatus'

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'grid' },
  { to: '/checkout', label: 'New sale', icon: 'cart' },
  { to: '/sales', label: 'Sales', icon: 'receipt' },
  { to: '/products', label: 'Products', icon: 'tag' },
  { to: '/categories', label: 'Categories', icon: 'folder' },
  { to: '/stock-movements', label: 'Stock history', icon: 'box' },
  { to: '/analytics', label: 'Analytics', icon: 'chart', ownerOnly: true },
  { to: '/users', label: 'Users', icon: 'users', ownerOnly: true },
  { to: '/subscription', label: 'Subscription', icon: 'card', ownerOnly: true },
  { to: '/settings', label: 'Settings', icon: 'settings', ownerOnly: true },
]

function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (name === 'grid') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
  if (name === 'cart') return <svg {...common}><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /><path d="M3 4h2l2.2 11h10.9l2-8H6" /></svg>
  if (name === 'receipt') return <svg {...common}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
  if (name === 'tag') return <svg {...common}><path d="M20 13 13 20l-9-9V4h7l9 9Z" /><circle cx="8" cy="8" r="1" /></svg>
  if (name === 'folder') return <svg {...common}><path d="M3 6h7l2 2h9v10H3V6Z" /></svg>
  if (name === 'box') return <svg {...common}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21" /></svg>
  if (name === 'chart') return <svg {...common}><path d="M4 19V5M4 19h16" /><path d="m7 15 3-4 3 2 5-7" /></svg>
  if (name === 'card') return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></svg>
  if (name === 'settings') return <svg {...common}><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.1h-2.6V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H7v-2.6h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9-.3 1.7 1.7 0 0 0 1-1.6V6h2.6v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v2.6h-.1a1.7 1.7 0 0 0-1.6 1Z" /></svg>
  return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M5 21a7 7 0 0 1 14 0M19 4v4M21 6h-4" /></svg>
}

export default function AppShell() {
  const { user, role, profile, signOut } = useAuth()
  const isOnline = useOnlineStatus()
  const location = useLocation()
  const visibleItems = navItems.filter((item) => !item.ownerOnly || can(role, item.to === '/analytics' ? 'reports' : item.to === '/users' ? 'userManagement' : 'settings'))
  const activeLabel = visibleItems.find((item) => item.to === location.pathname)?.label ?? 'JIUZE POS'

  useEffect(() => {
    const activeItem = document.querySelector('[data-mobile-nav-active="true"]')
    if (activeItem instanceof HTMLElement) activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-paper text-ink lg:flex">
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-sidebar-line lg:bg-sidebar px-4 py-5">
        <div className="px-3 mb-8"><div className="font-display text-xl font-semibold tracking-tight text-white"><span className="text-market-400">JIUZE</span> POS</div><p className="text-[10px] uppercase tracking-[0.18em] text-sidebar-muted mt-1">Retail management</p></div>
        <nav className="space-y-1 flex-1" aria-label="Main navigation">{visibleItems.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive ? 'bg-sidebar-active text-market-300' : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'}`}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}</nav>
        <div className="border-t border-sidebar-line pt-4 space-y-3"><div className="flex items-center gap-2 px-3 text-xs text-sidebar-muted"><span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-market-400' : 'bg-brick-500'}`} />{isOnline ? 'Online' : 'Offline'}</div><div className="rounded-xl border border-sidebar-line bg-sidebar-card px-3 py-3"><p className="text-xs font-medium text-white truncate">{profile?.businessId ? 'Business account' : 'JIUZE POS'}</p><p className="text-[11px] text-sidebar-muted mt-0.5 truncate">{user?.email ?? 'Signed in'}</p><p className="text-[10px] uppercase tracking-wide text-market-400 mt-2">{role ?? 'account'}</p></div><button type="button" onClick={() => void signOut()} className="w-full rounded-lg px-3 py-2 text-left text-xs text-sidebar-muted hover:bg-sidebar-hover hover:text-white transition-colors">Sign out</button></div>
      </aside>
      <div className="min-w-0 flex-1"><header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur lg:hidden"><div className="px-4 py-3 flex items-center justify-between gap-4"><div><p className="font-display font-semibold text-lg"><span className="text-market-600">JIUZE</span> POS</p><p className="text-[10px] uppercase tracking-wider text-ink-muted">{activeLabel}</p></div><div className="flex items-center gap-3"><span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-market-400' : 'bg-brick-500'}`} aria-label={isOnline ? 'Online' : 'Offline'} /><button type="button" onClick={() => void signOut()} className="text-xs text-ink-muted">Sign out</button></div></div><nav className="mobile-nav-scroll overflow-x-auto px-3 pb-3 flex gap-1" aria-label="Main navigation">{visibleItems.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} data-mobile-nav-active={location.pathname === item.to ? 'true' : 'false'} className={({ isActive }) => `shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${isActive ? 'bg-ink text-paper' : 'bg-paper-raised border border-line text-ink-muted'}`}>{item.label}</NavLink>)}</nav></header><div className="min-h-[calc(100vh-104px)] lg:min-h-screen"><Outlet /></div></div>
    </div>
  )
}

import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './contexts/auth-context'
import { can, type Permission } from './lib/permissions'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ResetPassword from './pages/ResetPassword'
import AppShell from './pages/AppShell'
import Dashboard from './pages/Dashboard'
import Categories from './pages/Categories'
import Products from './pages/Products'
import StockMovements from './pages/StockMovements'
import ModeAwareCheckout from './pages/ModeAwareCheckout'
import SalesHistory from './pages/SalesHistory'
import Users from './pages/Users'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Subscription from './pages/Subscription'
import Referral from './pages/Referral'
import OpenBills from './pages/OpenBills'

function OwnerOnlyRoute({ children }: { children: ReactNode }) {
  const { role, isProfileLoading } = useAuth()

  if (isProfileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-sm text-gray-500">
        Loading...
      </div>
    )
  }

  if (role !== 'owner') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function PermissionRoute({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { role, customPermissions, isProfileLoading } = useAuth()
  if (isProfileLoading) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading...</div>
  return can(role, permission, customPermissions) ? <>{children}</> : <Navigate to="/dashboard" replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/" element={<ModeAwareCheckout />} />
        <Route path="/dashboard" element={<PermissionRoute permission="dashboard"><Dashboard /></PermissionRoute>} />
        <Route path="/referral" element={<OwnerOnlyRoute><Referral /></OwnerOnlyRoute>} />
        <Route path="/categories" element={<PermissionRoute permission="products"><Categories /></PermissionRoute>} />
        <Route path="/products" element={<PermissionRoute permission="products"><Products /></PermissionRoute>} />
        <Route path="/stock-movements" element={<PermissionRoute permission="inventory"><StockMovements /></PermissionRoute>} />
        <Route path="/checkout" element={<PermissionRoute permission="pos"><ModeAwareCheckout /></PermissionRoute>} />
        <Route path="/sales" element={<PermissionRoute permission="sales"><SalesHistory /></PermissionRoute>} />
        <Route path="/open-bills" element={<OwnerOnlyRoute><OpenBills /></OwnerOnlyRoute>} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/users" element={<Users />} />
        <Route path="/subscription" element={<OwnerOnlyRoute><Subscription /></OwnerOnlyRoute>} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/app" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

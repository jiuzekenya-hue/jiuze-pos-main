import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './contexts/auth-context'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import AppShell from './pages/AppShell'
import Dashboard from './pages/Dashboard'
import Categories from './pages/Categories'
import Products from './pages/Products'
import StockMovements from './pages/StockMovements'
import Checkout from './pages/Checkout'
import SalesHistory from './pages/SalesHistory'
import Users from './pages/Users'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Subscription from './pages/Subscription'

function OwnerOnlyRoute({ children }: { children: React.ReactNode }) {
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

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/products" element={<Products />} />
        <Route path="/stock-movements" element={<StockMovements />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/sales" element={<SalesHistory />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/users" element={<Users />} />
        <Route path="/settings" element={<Settings />} />
        <Route
          path="/subscription"
          element={
            <OwnerOnlyRoute>
              <Subscription />
            </OwnerOnlyRoute>
          }
        />
        <Route path="/app" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

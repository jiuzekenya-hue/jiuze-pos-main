import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import AppShell from './pages/AppShell'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />
      {/* Unknown routes fall back to the protected root, which itself
          redirects to /login if there's no session. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

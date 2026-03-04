import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { restoreSession, sessionExpired } from './store/authSlice'
import { toast } from './store/uiSlice'
import Landing        from './pages/Landing'
import Dashboard      from './pages/Dashboard'
import CourseViewer   from './pages/CourseViewer'
import GeneratingView from './pages/GeneratingView'
import Toast          from './components/Toast'
import AuthModal      from './components/AuthModal'

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useSelector((s) => s.auth)
  return isAuthenticated ? children : <Navigate to="/" replace />
}

function AppRoutes() {
  const dispatch = useDispatch()
  const { isAuthenticated } = useSelector((s) => s.auth)

  // Validate stored token on boot
  useEffect(() => {
    dispatch(restoreSession())
  }, []) // eslint-disable-line

  // Listen for the global session-expired event from apiFetch
  useEffect(() => {
    const handler = () => {
      dispatch(sessionExpired())
      dispatch(toast('Session expired — please log in again.'))
    }
    window.addEventListener('ce:session-expired', handler)
    return () => window.removeEventListener('ce:session-expired', handler)
  }, [dispatch])

  return (
    <>
      <Routes>
        <Route path="/"            element={<Landing />} />
        <Route path="/dashboard"   element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/generating"  element={<ProtectedRoute><GeneratingView /></ProtectedRoute>} />
        <Route path="/course/:courseId" element={<ProtectedRoute><CourseViewer /></ProtectedRoute>} />
        <Route path="*"            element={<Navigate to="/" replace />} />
      </Routes>
      <AuthModal />
      <Toast />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { restoreSession, sessionExpired } from './store/authSlice'
import { toast } from './store/uiSlice'
import Landing             from './pages/Landing'
import Dashboard           from './pages/Dashboard'
import CourseViewer        from './pages/CourseViewer'
import GeneratingView      from './pages/GeneratingView'
import StudentDashboard    from './pages/StudentDashboard'
import StudentCourseViewer from './pages/StudentCourseViewer'
import Toast               from './components/Toast'
import AuthModal           from './components/AuthModal'

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useSelector((s) => s.auth)
  return isAuthenticated ? children : <Navigate to="/" replace />
}

function AdminRoute({ children }) {
  const { isAuthenticated, role } = useSelector((s) => s.auth)
  if (!isAuthenticated) return <Navigate to="/" replace />
  if (role && role !== 'admin') return <Navigate to="/student" replace />
  return children
}

function StudentRoute({ children }) {
  const { isAuthenticated, role } = useSelector((s) => s.auth)
  if (!isAuthenticated) return <Navigate to="/" replace />
  if (role === 'admin') return <Navigate to="/dashboard" replace />
  return children
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

        {/* Admin routes */}
        <Route path="/dashboard"   element={<AdminRoute><Dashboard /></AdminRoute>} />
        <Route path="/generating"  element={<AdminRoute><GeneratingView /></AdminRoute>} />
        <Route path="/course/:courseId" element={<AdminRoute><CourseViewer /></AdminRoute>} />

        {/* Student routes */}
        <Route path="/student"     element={<StudentRoute><StudentDashboard /></StudentRoute>} />
        <Route path="/student/view/:customCourseId" element={<StudentRoute><StudentCourseViewer /></StudentRoute>} />

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

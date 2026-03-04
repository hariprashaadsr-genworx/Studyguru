import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { loadCourses } from '../store/dashboardSlice'
import { openModal } from '../store/uiSlice'
import { logout } from '../store/authSlice'
import { toast } from '../store/uiSlice'
import CourseCard       from '../components/CourseCard'
import StatCards        from '../components/StatCards'
import CreateCourseModal from '../components/CreateCourseModal'

function Skeleton() {
  return (
    <div className="rounded-lg border border-navy-600/40 bg-navy-700/30 overflow-hidden">
      <div className="h-[3px] shimmer" />
      <div className="p-5 space-y-3">
        <div className="h-2.5 w-16 shimmer rounded" />
        <div className="h-4 w-4/5 shimmer rounded" />
        <div className="h-3.5 w-2/3 shimmer rounded" />
        <div className="h-5 w-24 shimmer rounded-full" />
        <div className="h-3 w-full shimmer rounded" />
        <div className="h-px bg-navy-700 mt-4" />
        <div className="flex justify-between">
          <div className="h-3 w-16 shimmer rounded" />
          <div className="h-3 w-10 shimmer rounded" />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { courses, status, error } = useSelector((s) => s.dashboard)
  const { user }                   = useSelector((s) => s.auth)

  useEffect(() => { dispatch(loadCourses()) }, [dispatch])

  const handleLogout = async () => {
    await dispatch(logout())
    dispatch(toast('Signed out successfully'))
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-navy-800 dot-grid">
      {/* nav */}
      <nav className="sticky top-0 z-50 bg-navy-900/95 backdrop-blur-xl border-b border-navy-600/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">✦</div>
            <span className="font-display text-[17px] font-bold text-white">StudyGuru <span className="text-accent">AI</span></span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => dispatch(openModal())}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-accent text-white hover:bg-accent2 transition shadow-glow">
              + New Syllabus
            </button>
            {user && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-navy-600 border border-navy-500/60 flex items-center justify-center text-[13px] font-bold text-accent">
                  {(user.name || user.email || 'U')[0].toUpperCase()}
                </div>
                <button onClick={handleLogout} className="text-[13px] text-navy-300 hover:text-white transition">Sign out</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-[11px] font-semibold mb-3 uppercase tracking-wider">
            AI Learning Dashboard
          </div>
          <h1 className="font-display text-[32px] font-bold text-white mb-1">
            {user ? `Welcome, ${user.name?.split(' ')[0] || 'Learner'}` : 'Dashboard'}
          </h1>
          <p className="text-navy-300 text-[14px]">AI-generated courses with slides, videos, and validated references.</p>
        </div>

        <StatCards />

        {/* toolbar */}
        <div className="flex items-center justify-between mt-8 mb-5">
          <h2 className="font-display text-[18px] font-bold text-white">Your Courses</h2>
          <button onClick={() => dispatch(loadCourses())}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-navy-500/50 text-navy-300 hover:border-accent/50 hover:text-accent transition flex items-center gap-1.5">
            ↻ Refresh
          </button>
        </div>

        {/* error */}
        {status === 'failed' && (
          <div className="mb-6 px-5 py-4 rounded-lg bg-danger/8 border border-danger/25 text-red-300 flex items-center gap-3">
            <span className="text-xl flex-shrink-0">⚠</span>
            <div className="flex-1">
              <div className="font-semibold text-[14px]">Failed to load courses</div>
              <div className="text-[12px] text-red-300/70 mt-0.5">{error}</div>
            </div>
            <button onClick={() => dispatch(loadCourses())}
              className="px-3 py-1.5 rounded-lg bg-danger/15 hover:bg-danger/25 text-[12px] font-semibold text-red-300 transition flex-shrink-0">
              Retry
            </button>
          </div>
        )}

        {/* grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-16">
          {status === 'loading' && [1,2,3,4,5,6].map((i) => <Skeleton key={i} />)}

          {status === 'succeeded' && courses.length === 0 && (
            <div className="col-span-full text-center py-20">
              <div className="text-[60px] mb-5 animate-float">🎓</div>
              <h3 className="font-display text-[20px] font-bold text-white mb-2">No courses yet</h3>
              <p className="text-navy-300 mb-6 text-[14px]">Create your first AI-generated course to get started.</p>
              <button onClick={() => dispatch(openModal())}
                className="px-6 py-3 rounded-lg text-[14px] font-bold bg-accent text-white hover:bg-accent2 shadow-glow transition">
                + Create Course
              </button>
            </div>
          )}

          {status === 'succeeded' && courses.map((c) => (
            <CourseCard key={c.course_id} course={c} />
          ))}
        </div>
      </div>

      <CreateCourseModal />
    </div>
  )
}

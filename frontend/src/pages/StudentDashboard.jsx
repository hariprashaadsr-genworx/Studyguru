import React, { useEffect, useState, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  loadStudentCourses,
  loadCourseStructure,
  toggleModule,
  toggleSubmodule,
  setStep,
  resetCustomFlow,
  loadEnrollments,
  enrollStudent,
} from '../store/studentSlice'
import { logout } from '../store/authSlice'
import { toast } from '../store/uiSlice'
import { fetchEnrollment } from '../api/student'

// ── Level badge ─────────────────────────────────────────────────────────────
const LEVEL_BADGE = {
  1: { label: 'Beginner',  cls: 'text-success border-success/30 bg-success/8' },
  2: { label: 'Beginner',  cls: 'text-success border-success/30 bg-success/8' },
  3: { label: 'Standard',  cls: 'text-accent  border-accent/30  bg-accent/8'  },
  4: { label: 'Standard',  cls: 'text-warn    border-warn/30    bg-warn/8'    },
  5: { label: 'Advanced',  cls: 'text-danger  border-danger/30  bg-danger/8'  },
}

// ── Small reusable components ───────────────────────────────────────────────
const Logo = () => (
  <div className="flex items-center gap-2.5">
    <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">✦</div>
    <span className="font-display text-[17px] font-bold text-white">StudyGuru <span className="text-accent">AI</span></span>
  </div>
)

function Skeleton() {
  return (
    <div className="rounded-lg border border-navy-600/40 bg-navy-700/30 overflow-hidden">
      <div className="h-[3px] shimmer" />
      <div className="p-5 space-y-3">
        <div className="h-2.5 w-16 shimmer rounded" />
        <div className="h-4 w-4/5 shimmer rounded" />
        <div className="h-3.5 w-2/3 shimmer rounded" />
        <div className="h-5 w-24 shimmer rounded-full" />
      </div>
    </div>
  )
}

// ── Enrolled courses section ────────────────────────────────────────────────

function EnrolledCourses() {
  const navigate = useNavigate()
  const { enrollments, enrollmentsStatus } = useSelector((s) => s.student)

  const active = (enrollments || []).filter((e) => e.status === 'active')
  const completed = (enrollments || []).filter((e) => e.status === 'completed')

  if (enrollmentsStatus === 'loading') {
    return (
      <div className="mb-10">
        <h2 className="font-display text-[18px] font-bold text-white mb-4">My Courses</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2].map((i) => <Skeleton key={i} />)}
        </div>
      </div>
    )
  }

  if (!active.length && !completed.length) return null

  return (
    <div className="mb-10">
      {active.length > 0 && (
        <>
          <h2 className="font-display text-[18px] font-bold text-white mb-4">My Active Courses</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {active.map((e) => {
              const progress = e.progress || {}
              const visited = (progress.visited || []).length
              const passed = (progress.module_tests_passed || []).length
              return (
                <div
                  key={e.enrollment_id}
                  onClick={() => navigate(`/student/view/${e.enrollment_id}`)}
                  className="group rounded-lg border border-accent/30 bg-navy-700/40 hover:bg-navy-700/70 overflow-hidden cursor-pointer transition-all shadow-card hover:shadow-card-hover"
                >
                  <div className="h-[3px] bg-gradient-to-r from-success to-accent" />
                  <div className="p-5">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-accent/70 mb-2">
                      {e.subject_domain || 'Course'}
                    </div>
                    <h3 className="text-[15px] font-semibold text-white mb-3 leading-snug group-hover:text-accent-light transition-colors">
                      {e.course_title}
                    </h3>
                    <div className="flex gap-4 text-[12px] text-navy-300 mb-3">
                      <span>{visited} visited</span>
                      <span>{passed} tests passed</span>
                    </div>
                    <div className="h-1.5 bg-navy-800 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${Math.min(100, visited * 10)}%` }} />
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-navy-600/40">
                      <span className="text-[11px] text-navy-400">
                        {e.created_at ? new Date(e.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : ''}
                      </span>
                      <span className="text-[12px] font-semibold text-accent group-hover:text-accent-light transition-colors">
                        Continue →
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {completed.length > 0 && (
        <>
          <h2 className="font-display text-[16px] font-bold text-navy-300 mb-3">Completed Courses</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {completed.map((e) => (
              <div
                key={e.enrollment_id}
                className="rounded-lg border border-navy-600/30 bg-navy-700/20 overflow-hidden opacity-70"
              >
                <div className="h-[3px] bg-success" />
                <div className="p-5">
                  <h3 className="text-[14px] font-semibold text-navy-200 mb-2">{e.course_title}</h3>
                  <span className="text-[11px] text-success font-bold">✓ Completed</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Browse step: Course cards ───────────────────────────────────────────────

function BrowseCourses() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { courses, coursesStatus, enrollments } = useSelector((s) => s.student)

  useEffect(() => {
    dispatch(loadStudentCourses())
  }, [dispatch])

  // Build a map of course_id → enrollment for "open session" detection
  const enrollmentByCourse = {}
  for (const e of (enrollments || [])) {
    if (e.status === 'active') {
      enrollmentByCourse[e.course_id] = e
    }
  }

  const selectCourse = (courseId) => {
    // If already enrolled, go directly to the enrollment
    if (enrollmentByCourse[courseId]) {
      navigate(`/student/view/${enrollmentByCourse[courseId].enrollment_id}`)
      return
    }
    dispatch(loadCourseStructure(courseId))
  }

  return (
    <div>
      <EnrolledCourses />

      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-[18px] font-bold text-white">Available Courses</h2>
        <button onClick={() => dispatch(loadStudentCourses())}
          className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-navy-500/50 text-navy-300 hover:border-accent/50 hover:text-accent transition">
          ↻ Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-16">
        {coursesStatus === 'loading' && [1,2,3].map((i) => <Skeleton key={i} />)}

        {coursesStatus === 'succeeded' && courses.length === 0 && (
          <div className="col-span-full text-center py-20">
            <div className="text-[60px] mb-5 animate-float">📚</div>
            <h3 className="font-display text-[20px] font-bold text-white mb-2">No courses available yet</h3>
            <p className="text-navy-300 text-[14px]">Ask your instructor to create courses.</p>
          </div>
        )}

        {coursesStatus === 'succeeded' && courses.map((c) => {
          const lvl = c.skill_level || 3
          const badge = LEVEL_BADGE[lvl] || LEVEL_BADGE[3]
          const hasEnrollment = !!enrollmentByCourse[c.course_id]

          return (
            <div
              key={c.course_id}
              onClick={() => selectCourse(c.course_id)}
              className={`group rounded-lg border overflow-hidden cursor-pointer transition-all shadow-card hover:shadow-card-hover ${
                hasEnrollment
                  ? 'border-warn/40 bg-navy-700/40 hover:bg-navy-700/70'
                  : 'border-navy-600/50 bg-navy-700/40 hover:bg-navy-700/70 hover:border-accent/30'
              }`}
            >
              <div className={`h-[3px] ${hasEnrollment ? 'bg-gradient-to-r from-warn to-accent' : 'bg-gradient-to-r from-accent2 to-accent'}`} />
              <div className="p-5">
                <div className="text-[11px] font-bold uppercase tracking-widest text-accent/70 mb-2">
                  {c.subject_domain || 'Course'}
                </div>
                <h3 className="text-[15px] font-semibold text-white mb-3 leading-snug group-hover:text-accent-light transition-colors">
                  {c.course_title}
                </h3>

                {hasEnrollment && (
                  <div className="mb-3 px-3 py-2 rounded-lg bg-warn/10 border border-warn/20 text-warn text-[11px] font-semibold flex items-center gap-2">
                    <span>⚠</span> You have an open session with this course
                  </div>
                )}

                <div className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold border mb-4 ${badge.cls}`}>
                  {'★'.repeat(lvl)} {c.skill_label || badge.label}
                </div>
                <div className="flex gap-4 text-[12px] text-navy-300 mb-4">
                  <span>{c.total_modules || 0} modules</span>
                  <span>{c.total_submodules || 0} lessons</span>
                  <span>{c.total_videos || 0} videos</span>
                </div>
                <div className="flex items-center justify-between pt-3.5 border-t border-navy-600/40">
                  <span className="text-[11px] text-navy-400">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : ''}
                  </span>
                  <span className="text-[12px] font-semibold text-accent group-hover:text-accent-light transition-colors">
                    {hasEnrollment ? 'Continue →' : 'Select →'}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Select step: Module/submodule checkboxes ────────────────────────────────

function ModuleSelector() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { structure, structureStatus, selectedModules } = useSelector((s) => s.student)
  const { user } = useSelector((s) => s.auth)
  const [enrolling, setEnrolling] = useState(false)
  const [preparing, setPreparing] = useState(null) // { enrollment_id, already_enrolled } or null
  const pollRef = useRef(null)

  // Clean up poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  if (structureStatus === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-2 border-navy-500 border-t-accent rounded-full animate-spin-slow" />
      </div>
    )
  }

  if (!structure) return null

  const totalSelected = Object.values(selectedModules).reduce((acc, mod) => {
    return acc + Object.values(mod.submodules || {}).filter(Boolean).length
  }, 0)

  const handleStartLearning = async () => {
    if (totalSelected === 0 || enrolling) return
    setEnrolling(true)

    // Build selected modules array
    const selMods = []
    for (const [moduleId, modData] of Object.entries(selectedModules)) {
      const subIds = Object.entries(modData.submodules || {})
        .filter(([_, checked]) => checked)
        .map(([id]) => id)
      if (subIds.length > 0) selMods.push({ module_id: moduleId, submodule_ids: subIds })
    }

    try {
      // Enroll via API — creates persistent custom course enrollment
      const result = await dispatch(enrollStudent({
        userId: user?.user_id || user?.id || user?.email,
        courseId: structure.course_id,
        selectedModules: selMods,
      })).unwrap()

      // If already enrolled, navigate directly
      if (result.already_enrolled) {
        navigate(`/student/view/${result.enrollment_id}`, { replace: true })
        return
      }

      // Show preparing screen and poll until questions are ready
      setPreparing(result)
      setEnrolling(false)

      pollRef.current = setInterval(async () => {
        try {
          const fresh = await fetchEnrollment(result.enrollment_id)
          const p = fresh?.progress || {}
          if (p.questions_ready) {
            if (pollRef.current) clearInterval(pollRef.current)
            navigate(`/student/view/${result.enrollment_id}`, { replace: true })
          }
        } catch (e) { console.warn('Poll failed:', e) }
      }, 3000)
    } catch (e) {
      dispatch(toast(e.message || 'Enrollment failed'))
      setEnrolling(false)
    }
  }

  // ── Preparing screen: questions are being generated ────
  if (preparing) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 border-[3px] border-navy-600 border-t-accent rounded-full animate-spin-slow mb-6" />
        <h2 className="font-display text-[22px] font-bold text-white mb-2">Your course is being prepared</h2>
        <p className="text-navy-300 text-[14px] max-w-md mb-1">
          We're generating personalised quiz questions for each module. This usually takes a moment…
        </p>
        <p className="text-navy-500 text-[12px] mt-4">Please don't close this page.</p>
      </div>
    )
  }

  return (
    <div>
      <button onClick={() => dispatch(resetCustomFlow())}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] font-medium border border-navy-600/60 text-navy-300 hover:border-navy-400 hover:text-white transition mb-6">
        ← Back to courses
      </button>

      <div className="mb-6">
        <h2 className="font-display text-[24px] font-bold text-white mb-1">{structure.course_title}</h2>
        <p className="text-navy-300 text-[14px]">Select the modules and lessons you want to study</p>
      </div>

      <div className="space-y-3 mb-8">
        {structure.modules.map((mod) => {
          const modState = selectedModules[mod.module_id] || { checked: false, submodules: {} }
          const allChecked = mod.submodules.every((s) => modState.submodules[s.submodule_id])
          const someChecked = mod.submodules.some((s) => modState.submodules[s.submodule_id])

          return (
            <div key={mod.module_id} className="rounded-lg border border-navy-700/50 bg-navy-900/50 overflow-hidden">
              <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-navy-800/60 transition">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked }}
                  onChange={(e) => dispatch(toggleModule({ moduleId: mod.module_id, checked: e.target.checked }))}
                  className="w-4 h-4 rounded border-navy-500 bg-navy-800 text-accent focus:ring-accent/30 accent-[var(--accent)]"
                />
                <span className="text-[10px] font-bold text-navy-500 w-7 flex-shrink-0">{mod.module_id}</span>
                <span className="text-[14px] font-semibold text-navy-100 flex-1">{mod.title}</span>
                <span className="text-[11px] text-navy-500">
                  {Object.values(modState.submodules).filter(Boolean).length}/{mod.submodules.length}
                </span>
              </label>

              <div className="border-t border-navy-800/80 px-4 py-2 space-y-1">
                {mod.submodules.map((sub) => {
                  const isChecked = modState.submodules[sub.submodule_id] || false
                  return (
                    <label key={sub.submodule_id}
                      className="flex items-center gap-3 py-1.5 pl-7 cursor-pointer hover:bg-navy-800/30 rounded transition">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => dispatch(toggleSubmodule({
                          moduleId: mod.module_id,
                          submoduleId: sub.submodule_id,
                          checked: e.target.checked,
                        }))}
                        className="w-3.5 h-3.5 rounded border-navy-600 bg-navy-800 text-accent focus:ring-accent/30 accent-[var(--accent)]"
                      />
                      <span className="text-[10px] text-navy-500 w-10 flex-shrink-0">{sub.submodule_id}</span>
                      <span className="text-[13px] text-navy-200">{sub.title}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between px-1 py-4 border-t border-navy-700/60">
        <span className="text-[13px] text-navy-400">
          {totalSelected} lesson{totalSelected !== 1 ? 's' : ''} selected
        </span>
        <button
          onClick={handleStartLearning}
          disabled={totalSelected === 0 || enrolling}
          className="px-6 py-2.5 rounded-lg text-[13px] font-bold bg-accent text-white hover:bg-accent2 disabled:opacity-30 disabled:cursor-not-allowed shadow-glow transition"
        >
          {enrolling ? 'Enrolling…' : 'Start Learning →'}
        </button>
      </div>
    </div>
  )
}


// ── Main page ───────────────────────────────────────────────────────────────

export default function StudentDashboard() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { user } = useSelector((s) => s.auth)
  const { step } = useSelector((s) => s.student)

  useEffect(() => {
    if (user) {
      const userId = user.user_id || user.id || user.email
      if (userId) dispatch(loadEnrollments(userId))
    }
  }, [user, dispatch])

  const handleLogout = async () => {
    await dispatch(logout())
    dispatch(toast('Signed out successfully'))
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-navy-800 dot-grid">
      <nav className="sticky top-0 z-50 bg-navy-900/95 backdrop-blur-xl border-b border-navy-600/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-full bg-success/10 border border-success/20 text-success text-[11px] font-bold">
              Student
            </span>
            {user && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-navy-600 border border-navy-500/60 flex items-center justify-center text-[13px] font-bold text-accent">
                  {(user.name || user.email || 'S')[0].toUpperCase()}
                </div>
                <span className="text-[13px] text-navy-200 font-medium hidden sm:block">{user.name || user.email}</span>
                <button onClick={handleLogout} className="text-[13px] text-navy-300 hover:text-white transition">Sign out</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-[11px] font-semibold mb-3 uppercase tracking-wider">
            Student Learning Portal
          </div>
          <h1 className="font-display text-[32px] font-bold text-white mb-1">
            {user ? `Welcome, ${user.name?.split(' ')[0] || 'Student'}` : 'Student Portal'}
          </h1>
          <p className="text-navy-300 text-[14px]">Browse courses, select topics, and customize your learning experience.</p>
        </div>

        {step === 'browse' && <BrowseCourses />}
        {step === 'select' && <ModuleSelector />}
      </div>
    </div>
  )
}

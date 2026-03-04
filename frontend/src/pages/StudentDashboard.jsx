import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  loadStudentCourses,
  loadCourseStructure,
  toggleModule,
  toggleSubmodule,
  setStep,
  resetCustomFlow,
} from '../store/studentSlice'
import { logout } from '../store/authSlice'
import { toast } from '../store/uiSlice'

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

// ── Browse step: Course cards ───────────────────────────────────────────────

function BrowseCourses() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { courses, coursesStatus } = useSelector((s) => s.student)

  useEffect(() => {
    dispatch(loadStudentCourses())
  }, [dispatch])

  const selectCourse = (courseId) => {
    dispatch(loadCourseStructure(courseId))
  }

  return (
    <div>
      {/* All Available Courses */}
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
          return (
            <div
              key={c.course_id}
              onClick={() => selectCourse(c.course_id)}
              className="group rounded-lg border border-navy-600/50 bg-navy-700/40 hover:bg-navy-700/70 hover:border-accent/30 overflow-hidden cursor-pointer transition-all shadow-card hover:shadow-card-hover"
            >
              <div className="h-[3px] bg-gradient-to-r from-accent2 to-accent" />
              <div className="p-5">
                <div className="text-[11px] font-bold uppercase tracking-widest text-accent/70 mb-2">
                  {c.subject_domain || 'Course'}
                </div>
                <h3 className="text-[15px] font-semibold text-white mb-3 leading-snug group-hover:text-accent-light transition-colors">
                  {c.course_title}
                </h3>
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
                    Select →
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

  const handleStartLearning = () => {
    if (totalSelected === 0) return
    // Build selected modules/submodules for the viewer URL
    const selMods = []
    for (const [moduleId, modData] of Object.entries(selectedModules)) {
      const subIds = Object.entries(modData.submodules || {})
        .filter(([_, checked]) => checked)
        .map(([id]) => id)
      if (subIds.length > 0) selMods.push({ module_id: moduleId, submodule_ids: subIds })
    }
    // Navigate to the base course viewer with selected modules encoded in state
    navigate(`/student/view/${structure.course_id}`, {
      state: { selectedModules: selMods }
    })
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
              {/* Module header */}
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

              {/* Submodules */}
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

      {/* Footer */}
      <div className="flex items-center justify-between px-1 py-4 border-t border-navy-700/60">
        <span className="text-[13px] text-navy-400">
          {totalSelected} lesson{totalSelected !== 1 ? 's' : ''} selected
        </span>
        <button
          onClick={handleStartLearning}
          disabled={totalSelected === 0}
          className="px-6 py-2.5 rounded-lg text-[13px] font-bold bg-accent text-white hover:bg-accent2 disabled:opacity-30 disabled:cursor-not-allowed shadow-glow transition"
        >
          Start Learning →
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

  const handleLogout = async () => {
    await dispatch(logout())
    dispatch(toast('Signed out successfully'))
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-navy-800 dot-grid">
      {/* Nav */}
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
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-[11px] font-semibold mb-3 uppercase tracking-wider">
            Student Learning Portal
          </div>
          <h1 className="font-display text-[32px] font-bold text-white mb-1">
            {user ? `Welcome, ${user.name?.split(' ')[0] || 'Student'}` : 'Student Portal'}
          </h1>
          <p className="text-navy-300 text-[14px]">Browse courses, select topics, and customize your learning experience.</p>
        </div>

        {/* Step content */}
        {step === 'browse' && <BrowseCourses />}
        {step === 'select' && <ModuleSelector />}
      </div>
    </div>
  )
}

import React from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'

export default function ViewerTopBar() {
  const navigate = useNavigate()
  const { data, flatNav, navIdx } = useSelector((s) => s.course)
  const pct = flatNav.length ? Math.round((navIdx / flatNav.length) * 100) : 0

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-5 gap-4 bg-navy-900 border-b border-navy-700/70">
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-1.5 text-[13px] text-navy-300 hover:text-white px-2.5 py-1.5 rounded-md hover:bg-navy-700/60 transition flex-shrink-0"
      >
        <span className="text-[11px]">←</span> Dashboard
      </button>

      <div className="w-px h-5 bg-navy-700 flex-shrink-0" />

      {/* logo in topbar */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-5 h-5 rounded bg-accent flex items-center justify-center text-white text-[10px] font-bold">✦</div>
        <span className="font-display text-[14px] font-bold text-white hidden sm:block">
          StudyGuru <span className="text-accent">AI</span>
        </span>
      </div>

      <div className="flex-1 font-semibold text-[14px] text-navy-200 truncate">
        {data?.course_title || ''}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-[12px] text-navy-400 font-mono">{pct}%</span>
        <div className="w-32 h-1.5 bg-navy-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

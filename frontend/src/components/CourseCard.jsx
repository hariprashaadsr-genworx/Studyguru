import React from 'react'
import { useNavigate } from 'react-router-dom'

// Single consistent color scheme — no rainbow cards
const LEVEL_BADGE = {
  1: { label: 'Beginner',     cls: 'text-success border-success/30 bg-success/8' },
  2: { label: 'Elementary',   cls: 'text-success border-success/30 bg-success/8' },
  3: { label: 'Intermediate', cls: 'text-accent  border-accent/30  bg-accent/8'  },
  4: { label: 'Advanced',     cls: 'text-warn    border-warn/30    bg-warn/8'    },
  5: { label: 'Expert',       cls: 'text-danger  border-danger/30  bg-danger/8'  },
}

export default function CourseCard({ course }) {
  const navigate = useNavigate()
  const lvl   = course.skill_level || 3
  const badge = LEVEL_BADGE[lvl] || LEVEL_BADGE[3]
  const date  = course.created_at ? new Date(course.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : ''

  return (
    <div
      onClick={() => navigate(`/course/${course.course_id}`)}
      className="group rounded-lg border border-navy-600/50 bg-navy-700/40 hover:bg-navy-700/70 hover:border-accent/30 overflow-hidden cursor-pointer transition-all duration-200 shadow-card hover:shadow-card-hover"
    >
      {/* top accent stripe */}
      <div className="h-[3px] bg-gradient-to-r from-accent2 to-accent" />

      <div className="p-5">
        {/* domain tag */}
        <div className="text-[11px] font-bold uppercase tracking-widest text-accent/70 mb-2">
          {course.subject_domain || 'Course'}
        </div>

        {/* title */}
        <h3 className="text-[15px] font-semibold text-white mb-3 leading-snug line-clamp-2 group-hover:text-accent-light transition-colors">
          {course.course_title}
        </h3>

        {/* level badge */}
        <div className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold border mb-4 ${badge.cls}`}>
          {'★'.repeat(lvl)} {course.skill_label || badge.label}
        </div>

        {/* stats row */}
        <div className="flex gap-4 text-[12px] text-navy-300 mb-4">
          <span><svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
    <path d="M2 2h12v2H2zM2 6h12v2H2zM2 10h12v2H2z" />
  </svg> {course.total_modules || 0} modules</span>
          <span><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="bi bi-journal-check" viewBox="0 0 16 16">
  <path fill-rule="evenodd" d="M10.854 6.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 8.793l2.646-2.647a.5.5 0 0 1 .708 0"/>
  <path d="M3 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-1h1v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v1H1V2a2 2 0 0 1 2-2"/>
  <path d="M1 5v-.5a.5.5 0 0 1 1 0V5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0V8h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0v.5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1z"/>
</svg> {course.total_submodules || 0} lessons</span>
          <span><svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
    <path d="M6 4l6 4-6 4z" />
  </svg> {course.total_videos || 0} videos</span>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between pt-3.5 border-t border-navy-600/40">
          <span className="text-[11px] text-navy-400">{date}</span>
          <span className="text-[12px] font-semibold text-accent group-hover:text-accent-light transition-colors">
            View →
          </span>
        </div>
      </div>
    </div>
  )
}

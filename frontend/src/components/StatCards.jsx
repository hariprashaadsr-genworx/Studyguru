import React from 'react'
import { useSelector } from 'react-redux'

const CoursesIcon = () => (
  <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
    <path d="M3 2h10v12H3z" />
  </svg>
)

const ModulesIcon = () => (
  <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
    <path d="M2 2h12v2H2zM2 6h12v2H2zM2 10h12v2H2z" />
  </svg>
)

const SlidesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="bi bi-journal-check" viewBox="0 0 16 16">
  <path fill-rule="evenodd" d="M10.854 6.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 8.793l2.646-2.647a.5.5 0 0 1 .708 0"/>
  <path d="M3 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-1h1v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v1H1V2a2 2 0 0 1 2-2"/>
  <path d="M1 5v-.5a.5.5 0 0 1 1 0V5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0V8h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0v.5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1z"/>
</svg>
)

const VideosIcon = () => (
  <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
    <path d="M6 4l6 4-6 4z" />
  </svg>
)

const STATS = [
  { key: 'courses', label: 'Courses', icon: CoursesIcon, get: (cs) => cs.length },
  { key: 'modules', label: 'Modules', icon: ModulesIcon, get: (cs) => cs.reduce((a,c) => a+(c.total_modules||0), 0) },
  { key: 'slides',  label: 'Slides',  icon: SlidesIcon,  get: (cs) => cs.reduce((a,c) => a+(c.total_slides||0),  0) },
  { key: 'videos',  label: 'Videos',  icon: VideosIcon,  get: (cs) => cs.reduce((a,c) => a+(c.total_videos||0),  0) },
]

export default function StatCards() {
  const courses = useSelector((s) => s.dashboard.courses)

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
      {STATS.map((stat) => {
        const Icon = stat.icon

        return (
          <div
            key={stat.key}
            className="rounded-lg border border-navy-600/50 bg-navy-700/30 px-5 py-4 hover:border-accent/30 transition-colors"
          >
            <div className="text-xl mb-2 text-white">
              <Icon />
            </div>

            <div className="font-display text-[28px] font-bold text-white leading-none">
              {stat.get(courses)}
            </div>

            <div className="text-[12px] text-navy-300 mt-1.5">
              {stat.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

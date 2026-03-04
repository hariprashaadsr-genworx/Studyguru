import React, { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { setNavIdx, markDone } from '../store/courseSlice'

export default function CourseSidebar() {
  const dispatch = useDispatch()
  const { data, flatNav, navIdx, done } = useSelector((s) => s.course)
  const [openMods, setOpenMods] = useState({})

  if (!data) return null
  const mods = data.modules || []
  const currentItem = flatNav[navIdx]

  const toggleMod = (mi) => setOpenMods((p) => ({ ...p, [mi]: p[mi] === false ? true : false }))
  const jumpSub   = (mi, si) => {
    const idx = flatNav.findIndex((n) => n.type === 'slide' && n.mi === mi && n.si === si)
    if (idx >= 0) { dispatch(setNavIdx(idx)); dispatch(markDone(`${mi}-${si}`)) }
  }
  const jumpRefs  = (mi) => {
    const idx = flatNav.findIndex((n) => n.type === 'refs' && n.mi === mi)
    if (idx >= 0) dispatch(setNavIdx(idx))
  }

  return (
    /* Dark sidebar — navy-900 background, fixed width 280px */
    <nav className="fixed top-14 left-0 bottom-0 w-[280px] bg-navy-900 border-r border-navy-700/70 overflow-y-auto z-40 flex flex-col">
      {/* header */}
      <div className="px-4 pt-4 pb-3 border-b border-navy-700/60 flex-shrink-0">
        <div className="text-[9px] font-bold text-navy-500 uppercase tracking-widest mb-1.5">Course Content</div>
        <div className="text-[13px] font-semibold text-navy-100 leading-snug">{data.course_title}</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {mods.map((mod, mi) => {
          const isOpen   = openMods[mi] !== false
          const hasRefs  = (mod.references || []).length > 0
          const vidCount = (mod.youtube_videos || []).length

          return (
            <div key={mi} className="border-b border-navy-800/80">
              {/* module row */}
              <button
                onClick={() => toggleMod(mi)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-navy-800/60 transition select-none"
              >
                <span
                  className="text-[9px] text-navy-500 flex-shrink-0 transition-transform duration-150"
                  style={{ display:'inline-block', transform: isOpen ? 'rotate(90deg)' : '' }}
                >▶</span>
                <span className="text-[12px] font-bold text-navy-200 flex-1 leading-snug">{mod.title}</span>
                {vidCount > 0 && (
                  <span className="text-[9px] text-navy-500 flex-shrink-0 font-mono">▶{vidCount}</span>
                )}
              </button>

              {isOpen && (
                <div className="pb-1.5">
                  {mod.submodules.map((sub, si) => {
                    const isActive = currentItem?.type === 'slide' && currentItem.mi === mi && currentItem.si === si
                    const isDone   = done.includes(`${mi}-${si}`)
                    return (
                      <button
                        key={si}
                        onClick={() => jumpSub(mi, si)}
                        className={`w-full flex items-center gap-2.5 pl-9 pr-4 py-2 text-left transition-all text-[12px] ${
                          isActive
                            ? 'bg-accent/20 text-white font-semibold border-r-2 border-accent'
                            : 'text-navy-400 hover:bg-navy-800/50 hover:text-navy-200'
                        }`}
                      >
                        <span className={`w-[14px] h-[14px] rounded-full border flex-shrink-0 flex items-center justify-center text-[7px] transition-colors ${
                          isDone
                            ? 'bg-success border-success text-white'
                            : isActive
                            ? 'border-accent bg-accent/15'
                            : 'border-navy-600'
                        }`}>
                          {isDone ? '✓' : ''}
                        </span>
                        <span className="leading-snug">{sub.title}</span>
                      </button>
                    )
                  })}
                  {hasRefs && (
                    <button
                      onClick={() => jumpRefs(mi)}
                      className={`w-full flex items-center gap-2 pl-9 pr-4 py-1.5 text-left text-[11px] transition-colors ${
                        currentItem?.type === 'refs' && currentItem.mi === mi
                          ? 'text-accent font-semibold'
                          : 'text-navy-400 hover:text-navy-400 hover:bg-navy-800/30'
                      }`}
                    >
                      <span className="text-[10px]">📎</span> Module References
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}

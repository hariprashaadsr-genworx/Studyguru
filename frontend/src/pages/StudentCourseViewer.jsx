import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { loadBaseCourseForViewing, clearViewingCourse } from '../store/studentSlice'
import { marked } from 'marked'

// ── Markdown / MathJax helpers ──────────────────────────────────────────────
const SENTINEL = '\x00MATH\x00'

function mdToHtml(md) {
  if (!md) return ''
  const saved = []
  let safe = md.replace(/\$\$[\s\S]*?\$\$/g, (m) => { saved.push(m); return `${SENTINEL}${saved.length-1}${SENTINEL}` })
  safe = safe.replace(/\$[^\$\n]+?\$/g, (m) => { saved.push(m); return `${SENTINEL}${saved.length-1}${SENTINEL}` })
  safe = safe.replace(/\\\([\s\S]*?\\\)/g, (m) => { saved.push(m); return `${SENTINEL}${saved.length-1}${SENTINEL}` })
  safe = safe.replace(/\\\[[\s\S]*?\\\]/g, (m) => { saved.push(m); return `${SENTINEL}${saved.length-1}${SENTINEL}` })
  let html = marked.parse(safe, { breaks: true, gfm: true })
  html = html.replace(new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, 'g'), (_, i) => saved[parseInt(i)])
  return html
}

async function runMathJax(el) {
  if (!el || !window.MathJax) return
  try {
    if (window.MathJax.typesetClear) window.MathJax.typesetClear([el])
    await window.MathJax.typesetPromise([el])
  } catch (e) { console.warn('MathJax:', e) }
}


// ── Build flat navigation ───────────────────────────────────────────────────
function buildFlatNav(modules = []) {
  const flatNav = []
  for (let mi = 0; mi < modules.length; mi++) {
    const mod = modules[mi]
    for (let si = 0; si < (mod.submodules || []).length; si++) {
      const sub = mod.submodules[si]
      const slides = sub.slides || []
      for (let sl = 0; sl < slides.length; sl++) {
        flatNav.push({ type: 'slide', mi, si, sl })
      }
    }
    if ((mod.references || []).length) {
      flatNav.push({ type: 'refs', mi })
    }
  }
  return flatNav
}


export default function StudentCourseViewer() {
  const { customCourseId: courseId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch()
  const { viewingCourse, viewingStatus } = useSelector((s) => s.student)
  const { user } = useSelector((s) => s.auth)

  // Selected modules passed via navigation state (from ModuleSelector)
  const selectedModules = location.state?.selectedModules || null

  const [flatNav, setFlatNav] = useState([])
  const [navIdx, setNavIdx] = useState(0)
  const [done, setDone] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState({})
  const bodyRef = React.useRef(null)

  useEffect(() => {
    // Load the base course directly
    dispatch(loadBaseCourseForViewing(courseId))
    return () => dispatch(clearViewingCourse())
  }, [courseId, dispatch])

  useEffect(() => {
    if (viewingCourse?.modules) {
      let modules = viewingCourse.modules
      // Filter modules/submodules if user selected specific ones
      if (selectedModules && selectedModules.length > 0) {
        const selLookup = {}
        for (const sel of selectedModules) {
          selLookup[sel.module_id] = new Set(sel.submodule_ids || [])
        }
        modules = modules
          .filter((m) => selLookup[m.module_id])
          .map((m) => ({
            ...m,
            submodules: (m.submodules || []).filter((s) =>
              selLookup[m.module_id]?.has(s.submodule_id)
            ),
          }))
          .filter((m) => m.submodules.length > 0)
      }
      setFlatNav(buildFlatNav(modules))
      setNavIdx(0)
      setDone([])
    }
  }, [viewingCourse, selectedModules])

  useEffect(() => {
    if (bodyRef.current) {
      const t = setTimeout(() => runMathJax(bodyRef.current), 60)
      return () => clearTimeout(t)
    }
  }, [navIdx])

  if (viewingStatus === 'loading') {
    return (
      <div className="min-h-screen bg-navy-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-navy-500 border-t-accent rounded-full animate-spin-slow mx-auto mb-4" />
          <p className="text-navy-300 text-[14px]">Loading course…</p>
        </div>
      </div>
    )
  }

  if (viewingStatus === 'failed' || !viewingCourse) {
    return (
      <div className="min-h-screen bg-navy-800 flex items-center justify-center">
        <div className="text-center px-8 max-w-sm">
          <div className="text-[56px] mb-5 animate-float">📭</div>
          <h2 className="font-display text-[22px] font-bold text-white mb-2">Course not found</h2>
          <p className="text-navy-300 text-[14px] mb-7">This custom course may not exist or doesn't belong to you.</p>
          <button onClick={() => navigate('/student')}
            className="px-6 py-2.5 rounded-lg font-semibold bg-accent text-white hover:bg-accent2 shadow-glow transition">
            ← Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const data = viewingCourse

  // Build filtered modules (same logic as flatNav)
  let mods = data.modules || []
  if (selectedModules && selectedModules.length > 0) {
    const selLookup = {}
    for (const sel of selectedModules) {
      selLookup[sel.module_id] = new Set(sel.submodule_ids || [])
    }
    mods = mods
      .filter((m) => selLookup[m.module_id])
      .map((m) => ({
        ...m,
        submodules: (m.submodules || []).filter((s) =>
          selLookup[m.module_id]?.has(s.submodule_id)
        ),
      }))
      .filter((m) => m.submodules.length > 0)
  }
  const currentItem = flatNav[navIdx]
  const currentMod = currentItem ? mods[currentItem.mi] : null
  const pct = flatNav.length ? Math.round((navIdx / flatNav.length) * 100) : 0

  const videos = currentMod?.youtube_videos || []

  const jumpSub = (mi, si) => {
    const idx = flatNav.findIndex((n) => n.type === 'slide' && n.mi === mi && n.si === si)
    if (idx >= 0) {
      setDone((d) => d.includes(`${mi}-${si}`) ? d : [...d, `${mi}-${si}`])
      setNavIdx(idx)
    }
  }
  const jumpRefs = (mi) => {
    const idx = flatNav.findIndex((n) => n.type === 'refs' && n.mi === mi)
    if (idx >= 0) setNavIdx(idx)
  }
  const navSlide = (dir) => {
    const next = navIdx + dir
    if (next < 0 || next >= flatNav.length) return
    if (currentItem) setDone((d) => {
      const key = `${currentItem.mi}-${currentItem.si}`
      return d.includes(key) ? d : [...d, key]
    })
    setNavIdx(next)
  }
  const jumpDot = (targetSl) => {
    if (!currentItem) return
    const idx = flatNav.findIndex(
      (n) => n.type === 'slide' && n.mi === currentItem.mi && n.si === currentItem.si && n.sl === targetSl
    )
    if (idx >= 0) setNavIdx(idx)
  }

  // Current slide data
  const slide = currentItem?.type === 'slide' && mods[currentItem.mi]
    ? mods[currentItem.mi].submodules[currentItem.si]?.slides?.[currentItem.sl]
    : null
  const currentSub = currentItem?.type === 'slide' && mods[currentItem.mi]
    ? mods[currentItem.mi].submodules[currentItem.si] : null
  const totalSlides = currentSub ? (currentSub.slides || []).length : 0

  // Refs data
  const refsMod = currentItem?.type === 'refs' ? mods[currentItem.mi] : null
  const refs = refsMod?.references || []

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f8f9fa' }}>
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-5 gap-4 bg-navy-900 border-b border-navy-700/70">
        <button
          onClick={() => navigate('/student')}
          className="flex items-center gap-1.5 text-[13px] text-navy-300 hover:text-white px-2.5 py-1.5 rounded-md hover:bg-navy-700/60 transition flex-shrink-0"
        >
          <span className="text-[11px]">←</span> Dashboard
        </button>
        <div className="w-px h-5 bg-navy-700 flex-shrink-0" />
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-5 h-5 rounded bg-accent flex items-center justify-center text-white text-[10px] font-bold">✦</div>
          <span className="font-display text-[14px] font-bold text-white hidden sm:block">StudyGuru <span className="text-accent">AI</span></span>
        </div>
        <div className="flex-1 font-semibold text-[14px] text-navy-200 truncate">{data.course_title || ''}</div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[12px] text-navy-400 font-mono">{pct}%</span>
          <div className="w-32 h-1.5 bg-navy-700 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <nav className="fixed top-14 left-0 bottom-0 w-[280px] bg-navy-900 border-r border-navy-700/70 overflow-y-auto z-40 flex flex-col">
        <div className="px-4 pt-4 pb-3 border-b border-navy-700/60 flex-shrink-0">
          <div className="text-[9px] font-bold text-navy-500 uppercase tracking-widest mb-1.5">
            📖 Course
          </div>
          <div className="text-[13px] font-semibold text-navy-100 leading-snug">{data.course_title}</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {mods.map((mod, mi) => {
            const isOpen = sidebarOpen[mi] !== false
            const hasRefs = (mod.references || []).length > 0
            const vidCount = (mod.youtube_videos || []).length
            return (
              <div key={mi} className="border-b border-navy-800/80">
                <button
                  onClick={() => setSidebarOpen((p) => ({ ...p, [mi]: !isOpen }))}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-navy-800/60 transition select-none"
                >
                  <span className="text-[9px] text-navy-500 flex-shrink-0 transition-transform duration-150"
                    style={{ display:'inline-block', transform: isOpen ? 'rotate(90deg)' : '' }}>▶</span>
                  <span className="text-[12px] font-bold text-navy-200 flex-1 leading-snug">{mod.title}</span>
                  {vidCount > 0 && <span className="text-[9px] text-navy-500 flex-shrink-0">▶{vidCount}</span>}
                </button>
                {isOpen && (
                  <div className="pb-1.5">
                    {(mod.submodules || []).map((sub, si) => {
                      const isActive = currentItem?.type === 'slide' && currentItem.mi === mi && currentItem.si === si
                      const isDone = done.includes(`${mi}-${si}`)
                      return (
                        <button key={si} onClick={() => jumpSub(mi, si)}
                          className={`w-full flex items-center gap-2.5 pl-9 pr-4 py-2 text-left transition-all text-[12px] ${
                            isActive ? 'bg-accent/20 text-white font-semibold border-r-2 border-accent'
                              : 'text-navy-400 hover:bg-navy-800/50 hover:text-navy-200'
                          }`}>
                          <span className={`w-[14px] h-[14px] rounded-full border flex-shrink-0 flex items-center justify-center text-[7px] transition-colors ${
                            isDone ? 'bg-success border-success text-white'
                              : isActive ? 'border-accent bg-accent/15'
                              : 'border-navy-600'
                          }`}>{isDone ? '✓' : ''}</span>
                          <span className="leading-snug">{sub.title}</span>
                        </button>
                      )
                    })}
                    {hasRefs && (
                      <button onClick={() => jumpRefs(mi)}
                        className={`w-full flex items-center gap-2 pl-9 pr-4 py-1.5 text-left text-[11px] transition-colors ${
                          currentItem?.type === 'refs' && currentItem.mi === mi
                            ? 'text-accent font-semibold' : 'text-navy-400 hover:text-navy-400 hover:bg-navy-800/30'
                        }`}>
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

      {/* Content */}
      <div className="flex flex-col flex-1 overflow-y-auto"
        style={{ marginLeft: '280px', marginTop: '56px', minHeight: 'calc(100vh - 56px)', background: '#ffffff' }}>

        {/* Video bar */}
        {videos.length > 0 && (
          <div className="border-b border-gray-200 bg-gray-900">
            <div className="w-full flex items-center justify-between px-6 py-2.5">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded bg-red-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">▶</span>
                <span className="text-[12px] font-bold text-gray-200 uppercase tracking-wider">VIDEOS</span>
                <span className="text-[11px] text-gray-400">{videos.length} for this module</span>
              </div>
            </div>
            <div className="px-6 pb-4 flex gap-3 overflow-x-auto">
              {videos.map((v, i) => (
                <a key={i} href={v.url} target="_blank" rel="noreferrer"
                  className="flex-shrink-0 w-[260px] flex items-start gap-2.5 p-2.5 rounded-lg border border-gray-700/60 bg-gray-800/60 hover:bg-gray-700/80 hover:border-gray-600 transition-all group">
                  <div className="w-8 h-8 rounded bg-red-700/20 border border-red-700/30 flex-shrink-0 flex items-center justify-center mt-0.5">
                    <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#ef4444" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-gray-200 line-clamp-2 leading-snug group-hover:text-white transition-colors">{v.title}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Slide view */}
        {currentItem?.type === 'slide' && slide && (
          <div className="flex-1 flex flex-col w-full">
            <div className="flex items-center gap-2 px-8 py-3 border-b border-gray-100 text-[12px] bg-gray-50/80">
              <span className="text-accent font-semibold">{currentMod?.title}</span>
              <span className="text-gray-300">›</span>
              <span className="text-gray-600 font-medium">{currentSub?.title}</span>
            </div>
            <div className="flex items-center gap-3 px-8 pt-5 pb-3">
              <div className="flex gap-1.5 flex-1 flex-wrap">
                {(currentSub?.slides || []).map((_, i) => (
                  <button key={i} onClick={() => jumpDot(i)}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      i === currentItem.sl ? 'w-8 bg-accent'
                        : done.includes(`${currentItem.mi}-${currentItem.si}`) && i < currentItem.sl ? 'w-4 bg-accent/30'
                        : 'w-4 bg-gray-200 hover:bg-gray-300'
                    }`} />
                ))}
              </div>
              <span className="text-[11px] text-gray-400 font-mono flex-shrink-0">{currentItem.sl+1}/{totalSlides}</span>
            </div>
            <div className="flex-1 px-8 pb-8">
              <div className="max-w-4xl w-full">
                <h2 className="font-display text-[24px] font-bold text-gray-900 mb-6 leading-snug">{slide.title || 'Section'}</h2>
                <div ref={bodyRef} className="slide-body-light" dangerouslySetInnerHTML={{ __html: mdToHtml(slide.content || '') }} />
              </div>
            </div>
            <div className="flex items-center justify-between px-8 py-4 border-t border-gray-100 bg-gray-50/60 flex-shrink-0">
              <span className="text-[12px] text-gray-400">Slide {currentItem.sl+1} of {totalSlides}</span>
              <div className="flex gap-2.5">
                <button onClick={() => navSlide(-1)} disabled={navIdx <= 0}
                  className="px-6 py-2 rounded-lg text-[13px] font-semibold border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition">← Prev</button>
                <button onClick={() => navSlide(1)} disabled={navIdx >= flatNav.length - 1}
                  className="px-6 py-2 rounded-lg text-[13px] font-bold bg-accent text-white hover:bg-accent2 disabled:opacity-30 disabled:cursor-not-allowed shadow-glow transition">
                  {navIdx >= flatNav.length - 1 ? '✓ Done' : 'Next →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Refs view */}
        {currentItem?.type === 'refs' && refsMod && (
          <div className="flex-1 flex flex-col w-full">
            <div className="px-8 py-3 border-b border-gray-100 bg-gray-50/80">
              <span className="text-[11px] font-bold text-accent uppercase tracking-widest">📎 Module References</span>
            </div>
            <div className="flex-1 px-8 py-6">
              <div className="max-w-4xl w-full">
                <h2 className="font-display text-[22px] font-bold text-gray-900 mb-1">{refsMod.title}</h2>
                <p className="text-gray-400 text-[13px] mb-6">{refs.length} curated references</p>
                <div className="flex flex-col gap-3">
                  {refs.length === 0 ? (
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-8 text-center text-gray-400 text-[14px]">No references available.</div>
                  ) : refs.map((r, i) => {
                    const score = Math.round((r.final_score || 0) * 100)
                    return (
                      <div key={i} className="bg-white border border-gray-100 rounded-lg p-4 flex items-start gap-4 hover:border-accent/30 hover:shadow-sm transition-all group">
                        <div className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 text-accent flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">{i+1}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-semibold text-gray-800 mb-0.5 group-hover:text-accent transition-colors">{r.title || 'Reference'}</div>
                          <a href={r.url} target="_blank" rel="noreferrer" className="text-[12px] text-accent hover:underline truncate block">{r.url}</a>
                          {r.snippet && <div className="text-[12px] text-gray-500 mt-1.5 line-clamp-2">{r.snippet}</div>}
                          <div className="flex items-center gap-2 mt-2.5">
                            <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-accent rounded-full" style={{ width:`${score}%` }} /></div>
                            <span className="text-[10px] text-gray-400 font-mono w-8 text-right">{score}%</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between px-8 py-4 border-t border-gray-100 bg-gray-50/60 flex-shrink-0">
              <span className="text-[12px] text-gray-400">{refs.length} references</span>
              <div className="flex gap-2.5">
                <button onClick={() => navSlide(-1)} disabled={navIdx <= 0}
                  className="px-5 py-2 rounded-lg text-[13px] font-semibold border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition">← Prev</button>
                <button onClick={() => navSlide(1)} disabled={navIdx >= flatNav.length - 1}
                  className="px-5 py-2 rounded-lg text-[13px] font-bold bg-accent text-white hover:bg-accent2 disabled:opacity-30 disabled:cursor-not-allowed shadow-glow transition">
                  {navIdx >= flatNav.length - 1 ? '✓ Done' : 'Next →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fallback: no content */}
        {!currentItem && flatNav.length > 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 text-[14px]">Select a lesson from the sidebar</p>
          </div>
        )}
        {flatNav.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[48px] mb-4">📖</div>
              <h3 className="font-display text-[18px] font-bold text-gray-700 mb-2">Course loaded</h3>
              <p className="text-gray-400 text-[14px]">This course has no slide content yet.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

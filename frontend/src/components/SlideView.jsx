import React, { useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { setNavIdx, markDone } from '../store/courseSlice'
import { marked } from 'marked'

const SENTINEL = '\x00MATH\x00'

function mdToHtml(md) {
  if (!md) return ''
  const saved = []

  let safe = md.replace(/\$\$[\s\S]*?\$\$/g, (m) => { saved.push(m); return `${SENTINEL}${saved.length-1}${SENTINEL}` })
  safe = safe.replace(/\$[^\$\n]+?\$/g,       (m) => { saved.push(m); return `${SENTINEL}${saved.length-1}${SENTINEL}` })
  safe = safe.replace(/\\\([\s\S]*?\\\)/g,    (m) => { saved.push(m); return `${SENTINEL}${saved.length-1}${SENTINEL}` })
  safe = safe.replace(/\\\[[\s\S]*?\\\]/g,    (m) => { saved.push(m); return `${SENTINEL}${saved.length-1}${SENTINEL}` })

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

export default function SlideView() {
  const dispatch = useDispatch()
  const { data, flatNav, navIdx, done } = useSelector((s) => s.course)
  const bodyRef  = useRef(null)
  const item     = flatNav[navIdx]

  useEffect(() => {
    if (item?.type !== 'slide') return
    const t = setTimeout(() => runMathJax(bodyRef.current), 60)
    return () => clearTimeout(t)
  }, [navIdx, item?.type])

  if (!data || !item || item.type !== 'slide') return null

  const { mi, si, sl } = item
  const mod        = data.modules[mi]
  const sub        = mod.submodules[si]
  const slide      = (sub.slides || [])[sl]
  const totalSlides = (sub.slides || []).length
  const isFirst    = navIdx <= 0
  const isLast     = navIdx >= flatNav.length - 1
  const isDone     = done.includes(`${mi}-${si}`)

  const navSlide = (dir) => {
    const next = navIdx + dir
    if (next < 0 || next >= flatNav.length) return
    dispatch(markDone(`${mi}-${si}`))
    dispatch(setNavIdx(next))
  }

  const jumpDot = (targetSl) => {
    const idx = flatNav.findIndex(
      (n) => n.type === 'slide' && n.mi === mi && n.si === si && n.sl === targetSl
    )
    if (idx >= 0) dispatch(setNavIdx(idx))
  }

  return (
    /* Full-width white content panel — no max-width cap */
    <div className="flex-1 flex flex-col w-full">

      {/* breadcrumb — light gray bar */}
      <div className="flex items-center gap-2 px-8 py-3 border-b border-gray-100 text-[12px] bg-gray-50/80">
        <span className="text-accent font-semibold">{mod.title}</span>
        <span className="text-gray-300">›</span>
        <span className="text-gray-600 font-medium">{sub.title}</span>
      </div>

      {/* slide progress dots */}
      <div className="flex items-center gap-3 px-8 pt-5 pb-3">
        <div className="flex gap-1.5 flex-1 flex-wrap">
          {(sub.slides || []).map((_, i) => (
            <button
              key={i}
              onClick={() => jumpDot(i)}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === sl
                  ? 'w-8 bg-accent'
                  : isDone && i < sl
                  ? 'w-4 bg-accent/30'
                  : 'w-4 bg-gray-200 hover:bg-gray-300'
              }`}
            />
          ))}
        </div>
        <span className="text-[11px] text-gray-400 font-mono flex-shrink-0">{sl+1}/{totalSlides}</span>
      </div>

      {/* slide content — white, full width, comfortable reading padding */}
      <div className="flex-1 px-8 pb-8">
        <div className="max-w-4xl w-full">
          <h2 className="font-display text-[24px] font-bold text-gray-900 mb-6 leading-snug">
            {slide?.title || 'Section'}
          </h2>
          <div
            ref={bodyRef}
            className="slide-body-light"
            dangerouslySetInnerHTML={{ __html: mdToHtml(slide?.content || '') }}
          />
        </div>
      </div>

      {/* nav footer */}
      <div className="flex items-center justify-between px-8 py-4 border-t border-gray-100 bg-gray-50/60 flex-shrink-0">
        <span className="text-[12px] text-gray-400">
          Lesson {si+1} · Slide {sl+1} of {totalSlides}
        </span>
        <div className="flex gap-2.5">
          <button
            onClick={() => navSlide(-1)}
            disabled={isFirst}
            className="px-6 py-2 rounded-lg text-[13px] font-semibold border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            ← Prev
          </button>
          <button
            onClick={() => navSlide(1)}
            disabled={isLast}
            className="px-6 py-2 rounded-lg text-[13px] font-bold bg-accent text-white hover:bg-accent2 disabled:opacity-30 disabled:cursor-not-allowed shadow-glow transition"
          >
            {isLast ? '✓ Done' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}

import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { setNavIdx } from '../store/courseSlice'

export default function RefsPanel() {
  const dispatch = useDispatch()
  const { data, flatNav, navIdx } = useSelector((s) => s.course)
  const item = flatNav[navIdx]
  if (!data || !item || item.type !== 'refs') return null

  const mod     = data.modules[item.mi]
  const refs    = mod.references || []
  const isFirst = navIdx <= 0
  const isLast  = navIdx >= flatNav.length - 1

  return (
    /* Full-width white references panel */
    <div className="flex-1 flex flex-col w-full">
      {/* header */}
      <div className="px-8 py-3 border-b border-gray-100 bg-gray-50/80">
        <span className="text-[11px] font-bold text-accent uppercase tracking-widest">📎 Module References</span>
      </div>

      <div className="flex-1 px-8 py-6">
        <div className="max-w-4xl w-full">
          <h2 className="font-display text-[22px] font-bold text-gray-900 mb-1">{mod.title}</h2>
          <p className="text-gray-400 text-[13px] mb-6">{refs.length} curated references ranked by relevance</p>

          <div className="flex flex-col gap-3">
            {refs.length === 0 ? (
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-8 text-center text-gray-400 text-[14px]">
                No references available for this module.
              </div>
            ) : refs.map((r, i) => {
              const score = Math.round((r.final_score || 0) * 100)
              return (
                <div key={i} className="bg-white border border-gray-100 rounded-lg p-4 flex items-start gap-4 hover:border-accent/30 hover:shadow-sm transition-all group">
                  <div className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 text-accent flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">{i+1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-gray-800 mb-0.5 group-hover:text-accent transition-colors">{r.title || 'Reference'}</div>
                    <a href={r.url} target="_blank" rel="noreferrer"
                      className="text-[12px] text-accent hover:underline truncate block">{r.url}</a>
                    {r.snippet && <div className="text-[12px] text-gray-500 mt-1.5 line-clamp-2">{r.snippet}</div>}
                    <div className="flex items-center gap-2 mt-2.5">
                      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width:`${score}%` }} />
                      </div>
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
          <button onClick={() => dispatch(setNavIdx(navIdx-1))} disabled={isFirst}
            className="px-5 py-2 rounded-lg text-[13px] font-semibold border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition">
            ← Prev
          </button>
          <button onClick={() => dispatch(setNavIdx(navIdx+1))} disabled={isLast}
            className="px-5 py-2 rounded-lg text-[13px] font-bold bg-accent text-white hover:bg-accent2 disabled:opacity-30 disabled:cursor-not-allowed shadow-glow transition">
            {isLast ? '✓ Done' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}

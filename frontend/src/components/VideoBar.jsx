import React, { useState } from 'react'

export default function VideoBar({ videos = [] }) {
  const [open, setOpen] = useState(true)
  if (!videos.length) return null

  return (
    /* Video bar uses a dark strip — matching the screenshot style */
    <div className="border-b border-gray-200 bg-gray-900">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-2.5 hover:bg-gray-800 transition"
      >
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded bg-red-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">▶</span>
          <span className="text-[12px] font-bold text-gray-200 uppercase tracking-wider">VIDEOS</span>
          <span className="text-[11px] text-gray-400">{videos.length} for this module</span>
        </div>
        <span className="text-gray-500 text-[10px]" style={{ transform: open ? 'rotate(180deg)' : '', display:'inline-block', transition:'transform .2s' }}>▼</span>
      </button>

      {open && (
        <div className="px-6 pb-4 flex gap-3 overflow-x-auto animate-fade-in">
          {videos.map((v, i) => (
            <a
              key={i}
              href={v.url}
              target="_blank"
              rel="noreferrer"
              className="flex-shrink-0 w-[260px] flex items-start gap-2.5 p-2.5 rounded-lg border border-gray-700/60 bg-gray-800/60 hover:bg-gray-700/80 hover:border-gray-600 transition-all group"
            >
              <div className="w-8 h-8 rounded bg-red-700/20 border border-red-700/30 flex-shrink-0 flex items-center justify-center mt-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24">
                  <path fill="#ef4444" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-gray-200 line-clamp-2 leading-snug group-hover:text-white transition-colors">{v.title}</div>
                {v.snippet && <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{v.snippet}</div>}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

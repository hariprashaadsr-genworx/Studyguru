import React from 'react'
import { useSelector } from 'react-redux'

export default function Toast() {
  const { message, visible } = useSelector((s) => s.ui.toast)
  return (
    <div className={`
      fixed bottom-6 right-6 z-[999]
      flex items-center gap-3
      bg-navy-600 border border-navy-500/60 text-navy-100
      px-5 py-3.5 rounded-lg shadow-modal
      text-[13px] font-medium
      transition-all duration-300
      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}
    `}>
      <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
      {message}
    </div>
  )
}

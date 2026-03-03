import React from 'react'
import { useDispatch } from 'react-redux'
import { openModal } from '../store/uiSlice'

export default function DashboardNav() {
  const dispatch = useDispatch()
  return (
    <nav className="bg-navy-900 border-b border-navy-700/70 px-8 h-16 flex items-center justify-between sticky top-0 z-[100]">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">✦</div>
        <span className="font-display text-[17px] font-bold text-white">StudyGuru <span className="text-accent">AI</span></span>
      </div>
      <button
        onClick={() => dispatch(openModal())}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold bg-accent text-white hover:bg-accent2 transition shadow-glow"
      >
        + Create Course
      </button>
    </nav>
  )
}

import React, { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'

const LOG_COLOR = {
  success: '#3aaf7a',
  error:   '#c0392b',
  step:    '#4a9eda',
  info:    '#9fb3c8',
}

export default function GeneratingView() {
  const navigate = useNavigate()
  const { courseTitle, subtitle, logs, progress, status, completedCourseId } = useSelector((s) => s.generation)
  const logRef = useRef(null)

  useEffect(() => {
    if (status === 'done' && completedCourseId) {
      const t = setTimeout(() => navigate(`/course/${completedCourseId}`, { replace: true }), 1400)
      return () => clearTimeout(t)
    }
  }, [status, completedCourseId, navigate])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const isRunning = status === 'running'
  const isDone    = status === 'done'
  const isError   = status === 'error'

  return (
    <div className="min-h-screen bg-navy-800 dot-grid flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-[680px]">

        <button onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] font-medium border border-navy-600/60 text-navy-300 hover:border-navy-400 hover:text-white transition mb-10">
          ← Back to Dashboard
        </button>

        {/* status badge */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-[11px] font-bold uppercase tracking-wider mb-4">
            {isDone ? '✓ Complete' : isError ? '⚠ Failed' : (
              <><span className="w-1.5 h-1.5 rounded-full bg-accent" style={{ animation:'pulseDot 1.5s ease-in-out infinite' }} />Generating</>
            )}
          </div>
          <h2 className="font-display text-[26px] font-bold text-white mb-1.5">
            {courseTitle || 'Generating Course…'}
          </h2>
          <p className="text-navy-400 text-[14px]">{subtitle || 'This may take a few minutes'}</p>
        </div>

        {/* progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-[11px] text-navy-400 mb-2">
            <span>Progress</span>
            <span className="font-mono">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-navy-900 rounded-full overflow-hidden border border-navy-700/60">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* error banner */}
        {isError && (
          <div className="mb-5 px-5 py-4 rounded-lg bg-danger/10 border border-danger/25 text-red-300 flex items-start gap-3 animate-fade-in">
            <span className="text-lg flex-shrink-0">⚠</span>
            <div>
              <div className="font-semibold text-[14px] mb-0.5">Generation failed</div>
              <div className="text-[12px] text-red-300/70">Check the log below. You can go back and try again.</div>
            </div>
          </div>
        )}

        {/* terminal */}
        <div
          ref={logRef}
          className="bg-navy-900 border border-navy-700/60 rounded-xl p-5 h-[360px] overflow-y-auto font-mono text-[12px] leading-[1.85] space-y-0.5"
        >
          {logs.length === 0 && (
            <div className="text-navy-600 italic">Initializing generation pipeline…</div>
          )}
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2.5 animate-fade-in" style={{ color: LOG_COLOR[log.type] || LOG_COLOR.info }}>
              <span className="text-navy-700 select-none text-[10px] mt-px flex-shrink-0 w-6 text-right">{i+1}</span>
              <span>{log.message}</span>
            </div>
          ))}
          {isRunning && (
            <div className="flex items-center gap-2 text-navy-500 mt-1">
              <span className="w-3 h-3 border border-navy-500 border-t-accent rounded-full animate-spin-slow flex-shrink-0" />
              Processing…
            </div>
          )}
          {isDone && (
            <div className="font-semibold mt-2 animate-fade-in" style={{ color: LOG_COLOR.success }}>
              ✅ Course ready! Redirecting…
            </div>
          )}
        </div>

        {isError && (
          <button onClick={() => navigate('/dashboard')}
            className="mt-4 w-full py-3 rounded-lg text-[13px] font-semibold border border-navy-600/60 text-navy-300 hover:border-navy-400 hover:text-white transition">
            ← Return to Dashboard
          </button>
        )}
      </div>
    </div>
  )
}

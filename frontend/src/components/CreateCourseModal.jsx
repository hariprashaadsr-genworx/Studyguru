import React, { useState, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { closeModal, toast } from '../store/uiSlice'
import { beginGeneration } from '../store/generationSlice'
import { parseSyllabus } from '../api/syllabus'
import { useNavigate } from 'react-router-dom'

let _ctr = 0
const uid = () => `u${++_ctr}`

function blankModule() {
  const id = uid()
  return { id, title: '', submodules: [{ id: uid(), title: '' }, { id: uid(), title: '' }] }
}

function apiToModules(apiMods = []) {
  return apiMods.map((m) => ({
    id: uid(),
    title: m.title || '',
    submodules: (m.submodules || []).map((s) => ({
      id: uid(),
      title: typeof s === 'string' ? s : (s.title || ''),
    })),
  }))
}

const STEP = { SYLLABUS: 0, EDIT: 1 }

const InputCls =
  'w-full px-3 py-2.5 rounded-md bg-navy-900 border border-navy-600/60 text-navy-100 placeholder-navy-600 text-[13px] focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/20 transition'

// ── Step indicator ─────────────────────────────────────────────────────────
function Steps({ step }) {
  const items = [
    { n: 1, label: 'Paste Syllabus' },
    { n: 2, label: 'Review & Edit'  },
  ]
  return (
    <div className="flex items-center gap-3 mb-6 px-7">
      {items.map(({ n, label }, i) => {
        const active = step === i
        const done   = step > i
        return (
          <React.Fragment key={n}>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border transition ${
                done   ? 'bg-success/20 border-success text-success' :
                active ? 'bg-accent/20 border-accent text-accent'   :
                         'bg-navy-800 border-navy-600 text-navy-500'
              }`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-[12px] font-semibold ${
                active ? 'text-white' : done ? 'text-success' : 'text-navy-500'
              }`}>{label}</span>
            </div>
            {i < items.length - 1 && (
              <div className={`flex-1 h-px ${done ? 'bg-success/40' : 'bg-navy-700'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Step 1: Syllabus paste ─────────────────────────────────────────────────
function SyllabusStep({ onParsed, onManual }) {
  const dispatch  = useDispatch()
  const ref       = useRef(null)
  const [text, setText]     = useState('')
  const [busy, setBusy]     = useState(false)
  const [err,  setErr]      = useState('')

  useEffect(() => { ref.current?.focus() }, [])

  const parse = async () => {
    if (!text.trim()) { setErr('Paste your syllabus first.'); return }
    setErr(''); setBusy(true)
    try {
      const result = await parseSyllabus(text.trim())
      onParsed(result)
    } catch (e) { setErr(e.message) }
    finally     { setBusy(false) }
  }

  return (
    <div>
      <p className="text-[13px] text-navy-300 mb-4 leading-relaxed">
        Paste any syllabus, curriculum, or topic list. The AI will extract the title, modules, and lessons automatically.
      </p>

      <div className="relative mb-3">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => { setText(e.target.value); setErr('') }}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') parse() }}
          rows={9}
          placeholder={'e.g.\n\nMachine Learning Fundamentals\n\nModule 1: Introduction\n  - What is Machine Learning?\n  - Supervised vs Unsupervised\n\nModule 2: Linear Models\n  - Linear Regression\n  - Logistic Regression'}
          className="w-full px-4 py-3 rounded-lg bg-navy-900 border border-navy-600/60 text-navy-100 placeholder-navy-600 text-[13px] font-mono leading-relaxed resize-none focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/20 transition"
        />
        {text && (
          <button onClick={() => { setText(''); setErr('') }}
            className="absolute top-2.5 right-2.5 w-5 h-5 rounded bg-navy-700 hover:bg-navy-600 text-navy-400 hover:text-white flex items-center justify-center text-[10px] transition">
            ✕
          </button>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] text-navy-600 font-mono">{text.length} chars</span>
        <span className="text-[11px] text-navy-500">Ctrl+Enter to parse</span>
      </div>

      {err && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-danger/10 border border-danger/25 text-red-300 text-[12px] flex items-center gap-2">
          <span className="flex-shrink-0">⚠</span> {err}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={parse} disabled={busy || !text.trim()}
          className="flex-1 py-2.5 rounded-lg text-[13px] font-bold bg-accent text-white hover:bg-accent2 disabled:opacity-40 disabled:cursor-not-allowed shadow-glow transition flex items-center justify-center gap-2">
          {busy
            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-slow" />Parsing…</>
            : '✨ Parse Syllabus'
          }
        </button>
        <button onClick={onManual}
          className="px-4 py-2.5 rounded-lg text-[12px] font-semibold border border-navy-600/60 text-navy-400 hover:border-navy-400 hover:text-navy-200 transition">
          Build manually →
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Edit ────────────────────────────────────────────────────────────
function EditStep({ title, setTitle, level, setLevel, modules, setModules }) {
  const addModule = () => setModules((p) => [...p, blankModule()])
  const rmModule  = (id) => setModules((p) => p.filter((m) => m.id !== id))
  const upMod     = (id, v) => setModules((p) => p.map((m) => m.id === id ? { ...m, title: v } : m))
  const addSub    = (mid) => setModules((p) => p.map((m) => m.id !== mid ? m : { ...m, submodules: [...m.submodules, { id: uid(), title: '' }] }))
  const rmSub     = (mid, sid) => setModules((p) => p.map((m) => m.id !== mid || m.submodules.length <= 1 ? m : { ...m, submodules: m.submodules.filter((s) => s.id !== sid) }))
  const upSub     = (mid, sid, v) => setModules((p) => p.map((m) => m.id !== mid ? m : { ...m, submodules: m.submodules.map((s) => s.id === sid ? { ...s, title: v } : s) }))

  const totalLessons = modules.reduce((a, m) => a + m.submodules.filter((s) => s.title.trim()).length, 0)

  return (
    <div>
      {/* summary strip */}
      <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-md bg-navy-900/60 border border-navy-700/60 text-[12px] text-navy-300">
        <span className="font-semibold text-navy-100">{modules.filter(m=>m.title.trim()).length} modules</span>
        <span className="text-navy-600">·</span>
        <span className="font-semibold text-navy-100">{totalLessons} lessons</span>
        <span className="flex-1" />
        <span className="text-navy-500">Click any field to edit</span>
      </div>

      {/* title + level */}
      <div className="grid grid-cols-[1fr_160px] gap-3 mb-4">
        <div>
          <label className="block text-[10px] font-bold text-navy-500 uppercase tracking-widest mb-1.5">Course Title *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Machine Learning Fundamentals" className={InputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-navy-500 uppercase tracking-widest mb-1.5">Skill Level</label>
          <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className={InputCls}>
            <option value={1}>1 — Beginner</option>
            <option value={2}>2 — Elementary</option>
            <option value={3}>3 — Intermediate</option>
            <option value={4}>4 — Advanced</option>
            <option value={5}>5 — Expert</option>
          </select>
        </div>
      </div>

      {/* modules */}
      <div className="text-[10px] font-bold text-navy-500 uppercase tracking-widest mb-2">Modules &amp; Lessons</div>

      <div className="space-y-2 mb-3">
        {modules.map((mod, mi) => (
          <div key={mod.id} className="rounded-lg border border-navy-700/50 bg-navy-900/50 overflow-hidden">
            {/* module title row */}
            <div className="flex items-center gap-2 px-3 pt-3 pb-2.5 border-b border-navy-800/80">
              <span className="text-[10px] font-bold text-navy-500 w-5 flex-shrink-0 text-right">M{mi+1}</span>
              <input value={mod.title} onChange={(e) => upMod(mod.id, e.target.value)}
                placeholder={`Module ${mi+1} title`}
                className="flex-1 px-2.5 py-1.5 rounded bg-navy-800 border border-navy-700/60 text-navy-100 text-[13px] font-medium placeholder-navy-500 focus:border-accent/50 focus:outline-none transition" />
              <button onClick={() => rmModule(mod.id)}
                className="w-6 h-6 rounded flex items-center justify-center text-navy-500 hover:text-danger hover:bg-danger/10 transition flex-shrink-0 text-[12px]">✕</button>
            </div>
            {/* submodules */}
            <div className="px-3 pt-2 pb-2.5 space-y-1.5">
              {mod.submodules.map((sub, si) => (
                <div key={sub.id} className="flex items-center gap-2">
                  <span className="text-[9px] text-navy-500 w-8 text-right flex-shrink-0">{mi+1}.{si+1}</span>
                  <input value={sub.title} onChange={(e) => upSub(mod.id, sub.id, e.target.value)}
                    placeholder={`Lesson ${si+1}`}
                    className="flex-1 px-2.5 py-1.5 rounded bg-navy-800/60 border border-navy-800 text-navy-200 text-[12px] placeholder-navy-500 focus:border-accent/40 focus:outline-none transition" />
                  <button onClick={() => rmSub(mod.id, sub.id)}
                    className="w-5 h-5 rounded flex items-center justify-center text-navy-500 hover:text-danger transition flex-shrink-0 text-[11px]">✕</button>
                </div>
              ))}
              <button onClick={() => addSub(mod.id)}
                className="text-[11px] text-accent hover:text-accent-light font-semibold transition pl-10 mt-0.5">
                + Add lesson
              </button>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addModule}
        className="w-full py-2.5 border border-dashed border-navy-700 rounded-lg text-[12px] font-semibold text-navy-500 hover:border-accent/50 hover:text-accent transition">
        + Add Module
      </button>
    </div>
  )
}

// ── Modal shell ─────────────────────────────────────────────────────────────
export default function CreateCourseModal() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const isOpen   = useSelector((s) => s.ui.modalOpen)

  const [step,    setStep]    = useState(STEP.SYLLABUS)
  const [title,   setTitle]   = useState('')
  const [level,   setLevel]   = useState(3)
  const [modules, setModules] = useState([blankModule(), blankModule()])

  useEffect(() => {
    if (isOpen) {
      setStep(STEP.SYLLABUS)
      setTitle('')
      setLevel(3)
      setModules([blankModule(), blankModule()])
    }
  }, [isOpen])

  if (!isOpen) return null

  const onParsed = (data) => {
    setTitle(data.course_title || '')
    setLevel(data.skill_level  || 3)
    const parsed = apiToModules(data.modules || [])
    setModules(parsed.length ? parsed : [blankModule()])
    setStep(STEP.EDIT)
  }

  const onManual = () => {
    setModules([blankModule(), blankModule()])
    setStep(STEP.EDIT)
  }

  const submit = () => {
    if (!title.trim()) { dispatch(toast('Please enter a course title.')); return }
    const builtMods = []
    let mi = 1
    for (const m of modules) {
      if (!m.title.trim()) continue
      const subs = []; let si = 1
      for (const s of m.submodules) {
        if (s.title.trim()) subs.push({ submodule_id: `M${mi}.${si++}`, title: s.title.trim() })
      }
      if (subs.length) builtMods.push({ module_id: `M${mi++}`, title: m.title.trim(), submodules: subs })
    }
    if (!builtMods.length) { dispatch(toast('Add at least one module with lessons.')); return }
    dispatch(closeModal())
    dispatch(beginGeneration({ course_title: title.trim(), skill_level: level, modules: builtMods }))
    navigate('/generating', { replace: true })
  }

  const HEADERS = [
    { t: 'Create New Syllabus',       s: 'Paste your syllabus and let AI structure it' },
    { t: 'Review Course Structure', s: 'Edit modules and lessons, then generate' },
  ]
  const { t: hTitle, s: hSub } = HEADERS[step]

  return (
    <div
      className="fixed inset-0 bg-navy-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-5"
      onClick={(e) => { if (e.target === e.currentTarget) dispatch(closeModal()) }}
    >
      <div className="bg-navy-700 border border-navy-600/60 rounded-xl w-full max-w-[700px] max-h-[92vh] flex flex-col shadow-modal">
        {/* accent line */}
        <div className="h-[3px] flex-shrink-0 rounded-t-xl bg-gradient-to-r from-accent2 via-accent to-accent2" />

        {/* header */}
        <div className="px-7 pt-5 pb-4 flex-shrink-0 border-b border-navy-600/40">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-display text-[19px] font-bold text-white">{hTitle}</h2>
              <p className="text-[12px] text-navy-400 mt-0.5">{hSub}</p>
            </div>
            <button onClick={() => dispatch(closeModal())}
              className="w-7 h-7 rounded flex items-center justify-center text-navy-500 hover:bg-navy-600 hover:text-white transition ml-4 text-[15px]">✕</button>
          </div>
          <Steps step={step} />
        </div>

        {/* body */}
        <div className="px-7 py-5 overflow-y-auto flex-1 min-h-0">
          {step === STEP.SYLLABUS && <SyllabusStep onParsed={onParsed} onManual={onManual} />}
          {step === STEP.EDIT     && (
            <EditStep
              title={title}     setTitle={setTitle}
              level={level}     setLevel={setLevel}
              modules={modules} setModules={setModules}
            />
          )}
        </div>

        {/* footer */}
        <div className="px-7 pb-5 pt-4 flex-shrink-0 border-t border-navy-600/40 flex items-center justify-between">
          {step === STEP.EDIT ? (
            <>
              <button onClick={() => setStep(STEP.SYLLABUS)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border border-navy-600/60 text-navy-400 hover:text-navy-200 hover:border-navy-500 transition">
                ← Re-paste syllabus
              </button>
              <div className="flex items-center gap-2.5">
                <button onClick={() => dispatch(closeModal())}
                  className="px-4 py-2 rounded-lg text-[12px] font-semibold border border-navy-600/60 text-navy-400 hover:text-navy-200 transition">
                  Cancel
                </button>
                <button onClick={submit}
                  className="px-6 py-2.5 rounded-lg text-[13px] font-bold bg-accent text-white hover:bg-accent2 shadow-glow transition flex items-center gap-2">
                   Generate Course
                </button>
              </div>
            </>
          ) : (
            <div className="ml-auto">
              <button onClick={() => dispatch(closeModal())}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold border border-navy-600/60 text-navy-400 hover:text-navy-200 transition">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

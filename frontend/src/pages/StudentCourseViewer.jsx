import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { loadEnrollmentData, clearEnrollmentData } from '../store/studentSlice'
import {
  markSubmoduleVisited,
  fetchModuleQuestions,
  fetchFinalQuestions,
  submitModuleTest,
  submitFinalTest,
  completeCourse,
  fetchEnrollment,
} from '../api/student'
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

// ── Build flat navigation with quizzes ──────────────────────────────────────
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
    // Module quiz after references
    flatNav.push({ type: 'quiz', mi })
  }
  // Final assessment at the end
  flatNav.push({ type: 'final' })
  return flatNav
}

// ── Module locking helpers ──────────────────────────────────────────────────

function isModuleUnlocked(mi, modulesPassed) {
  if (mi === 0) return true
  return modulesPassed.includes(mi - 1)
}

function allSubmodulesVisited(mod, mi, visited) {
  return (mod.submodules || []).every((sub) =>
    visited.includes(`${mod.module_id}::${sub.submodule_id}`)
  )
}

// ── Quiz Panel Component ────────────────────────────────────────────────────

function QuizPanel({ questions, onSubmit, title, subtitle, passThreshold = 0.6, lastResult, readOnly = false, attempts = [], onRetry, onNext }) {
  // lastResult: { score, total, passed, answers: { "0": "ans", "1": "ans" ... } }
  const [answers, setAnswers] = useState({})
  const [hintsUsed, setHintsUsed] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState(null)

  // If we have lastResult and are in readOnly, show last answers with green/red
  const showLast = readOnly && lastResult && lastResult.answers
  const displayAnswers = showLast ? lastResult.answers : answers
  const isSubmittedView = submitted || showLast

  const selectAnswer = (qIdx, value) => {
    if (submitted || showLast) return
    setAnswers((prev) => ({ ...prev, [qIdx]: value }))
  }

  const revealHint = (qIdx) => {
    if (submitted || showLast) return
    setHintsUsed((prev) => {
      const cur = prev[qIdx] || 0
      if (cur >= 3) return prev
      return { ...prev, [qIdx]: cur + 1 }
    })
  }

  const handleSubmit = () => {
    let correct = 0
    const answersToSave = {}
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const userAns = answers[i]
      answersToSave[String(i)] = userAns || null
      if (userAns !== undefined && userAns === q.correct_answer) correct++
    }
    const total = questions.length
    const passed = total > 0 && (correct / total) >= passThreshold
    setResult({ correct, total, passed })
    setSubmitted(true)
    onSubmit(correct, total, passed, answersToSave)
  }

  const handleRetry = () => {
    setSubmitted(false)
    setResult(null)
    setAnswers({})
    setHintsUsed({})
    if (onRetry) onRetry()
  }

  const allAnswered = questions.length > 0 && Object.keys(answers).length === questions.length

  // Compute display result
  const displayResult = showLast
    ? { correct: lastResult.score, total: lastResult.total, passed: lastResult.passed }
    : result

  const isPerfect = displayResult && displayResult.correct === displayResult.total

  return (
    <div className="flex-1 flex flex-col w-full">
      <div className="px-8 py-4 border-b border-gray-100 bg-gray-50/80">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-accent uppercase tracking-widest">{title}</span>
            {subtitle && <p className="text-[12px] text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            {attempts.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-navy-900/5 border border-gray-200">
                <span className="text-[10px] text-gray-500 font-semibold uppercase">Attempts</span>
                <span className="text-[12px] font-bold text-accent">{attempts.length}</span>
                <span className="text-[10px] text-gray-400">|</span>
                <span className="text-[10px] text-gray-500 font-semibold uppercase">Best</span>
                <span className="text-[12px] font-bold text-green-600">
                  {Math.max(...attempts.map(a => a.score))}/{attempts[0]?.total || '?'}
                </span>
              </div>
            )}
            {displayResult && (
              <div className="flex items-center gap-2">
                <span className={`text-[13px] font-bold ${displayResult.passed ? 'text-green-600' : 'text-red-600'}`}>
                  {displayResult.passed ? '✅' : '❌'} {displayResult.correct}/{displayResult.total}
                </span>
                <span className="text-[11px] text-gray-400">
                  ({Math.round((displayResult.correct / displayResult.total) * 100)}%)
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 px-8 py-6 overflow-y-auto">
        <div className="max-w-3xl w-full space-y-6">
          {questions.length === 0 && (
            <div className="text-center py-16">
              <div className="w-10 h-10 border-2 border-gray-300 border-t-accent rounded-full animate-spin-slow mx-auto mb-4" />
              <p className="text-gray-400 text-[14px]">Loading questions…</p>
            </div>
          )}

          {questions.map((q, qIdx) => {
            const userAns = displayAnswers[showLast ? String(qIdx) : qIdx]
            const isCorrect = isSubmittedView && userAns === q.correct_answer
            const isWrong = isSubmittedView && userAns !== undefined && userAns !== null && userAns !== q.correct_answer
            const hintLevel = hintsUsed[qIdx] || 0
            const hints = q.hints || []
            const difficulty = q.difficulty

            return (
              <div key={qIdx} className={`rounded-lg border p-5 transition-all ${
                isSubmittedView
                  ? isCorrect ? 'border-green-300 bg-green-50/50'
                    : isWrong ? 'border-red-300 bg-red-50/50'
                    : 'border-gray-200 bg-gray-50/50'
                  : 'border-gray-200 bg-white'
              }`}>
                <div className="flex items-start gap-3 mb-4">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 ${
                    isSubmittedView
                      ? isCorrect ? 'bg-green-100 border border-green-300 text-green-700'
                        : isWrong ? 'bg-red-100 border border-red-300 text-red-700'
                        : 'bg-gray-100 border border-gray-200 text-gray-500'
                      : 'bg-accent/10 border border-accent/20 text-accent'
                  }`}>
                    {isSubmittedView ? (isCorrect ? '✓' : isWrong ? '✗' : qIdx + 1) : qIdx + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-gray-800 leading-relaxed">{q.question_text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-400 uppercase font-bold">
                        {q.question_type === 'true_false' ? 'True / False' : 'Multiple Choice'}
                      </span>
                      {difficulty && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                          difficulty === 'easy' ? 'bg-green-100 text-green-700'
                            : difficulty === 'hard' ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {difficulty}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-2 mb-4 pl-10">
                  {(q.options || []).map((opt, oi) => {
                    const isSelected = userAns === opt
                    const isCorrectOpt = isSubmittedView && opt === q.correct_answer
                    return (
                      <button key={oi}
                        onClick={() => selectAnswer(qIdx, opt)}
                        disabled={isSubmittedView}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left text-[13px] border transition-all ${
                          isSubmittedView
                            ? isCorrectOpt ? 'border-green-400 bg-green-100 text-green-800 font-semibold'
                              : isSelected && !isCorrectOpt ? 'border-red-400 bg-red-100 text-red-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500'
                            : isSelected ? 'border-accent bg-accent/10 text-accent font-semibold'
                              : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-[9px] ${
                          isSubmittedView
                            ? isCorrectOpt ? 'border-green-500 bg-green-500 text-white' : isSelected ? 'border-red-500 bg-red-500 text-white' : 'border-gray-300'
                            : isSelected ? 'border-accent bg-accent text-white' : 'border-gray-300'
                        }`}>
                          {isSubmittedView ? (isCorrectOpt ? '✓' : isSelected ? '✗' : '') : (isSelected ? '●' : '')}
                        </span>
                        {opt}
                      </button>
                    )
                  })}
                </div>

                {/* Hints */}
                {!showLast && (
                  <div className="pl-10 flex items-center gap-2">
                    {!submitted && hints.length > 0 && hintLevel < hints.length && (
                      <button onClick={() => revealHint(qIdx)}
                        className="text-[11px] text-amber-600 hover:text-amber-700 font-semibold border border-amber-200 bg-amber-50 px-2.5 py-1 rounded-full transition hover:bg-amber-100">
                        💡 Hint {hintLevel + 1}
                      </button>
                    )}
                    {hintLevel > 0 && (
                      <div className="flex flex-col gap-1 flex-1">
                        {hints.slice(0, hintLevel).map((h, hi) => (
                          <div key={hi} className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                            <span className="font-bold">Hint {hi + 1}:</span> {h}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Correct answer reveal */}
                {isSubmittedView && isWrong && (
                  <div className="mt-3 pl-10 text-[12px] text-green-700">
                    Correct answer: <span className="font-semibold">{q.correct_answer}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Submit / Result footer */}
      {questions.length > 0 && (
        <div className="flex items-center justify-between px-8 py-4 border-t border-gray-100 bg-gray-50/60 flex-shrink-0">
          {showLast ? (
            <>
              <div className="flex items-center gap-3">
                <span className={`text-[14px] font-bold ${displayResult.passed ? 'text-green-600' : 'text-red-600'}`}>
                  {displayResult.passed ? '✅ Passed!' : '❌ Not passed'}
                </span>
                <span className="text-[13px] text-gray-500">
                  {displayResult.correct}/{displayResult.total} correct ({Math.round((displayResult.correct / displayResult.total) * 100)}%)
                </span>
              </div>
              <div className="flex gap-2.5">
                {!isPerfect && (
                  <button onClick={handleRetry}
                    className="px-5 py-2 rounded-lg text-[13px] font-semibold border border-amber-300 text-amber-600 hover:border-amber-400 hover:bg-amber-50 transition">
                    🔄 Retake for 100%
                  </button>
                )}
                {displayResult.passed && onNext && (
                  <button onClick={onNext}
                    className="px-6 py-2 rounded-lg text-[13px] font-bold bg-accent text-white hover:bg-accent2 shadow-glow transition">
                    Next →
                  </button>
                )}
              </div>
            </>
          ) : !submitted ? (
            <>
              <span className="text-[12px] text-gray-400">
                {Object.keys(answers).length}/{questions.length} answered
              </span>
              <button onClick={handleSubmit} disabled={!allAnswered}
                className="px-6 py-2.5 rounded-lg text-[13px] font-bold bg-accent text-white hover:bg-accent2 disabled:opacity-30 disabled:cursor-not-allowed shadow-glow transition">
                Submit Answers
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className={`text-[14px] font-bold ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
                  {result.passed ? '✅ Passed!' : '❌ Not passed'}
                </span>
                <span className="text-[13px] text-gray-500">
                  {result.correct}/{result.total} correct ({Math.round((result.correct / result.total) * 100)}%)
                </span>
                <span className="text-[11px] text-gray-400">Need {Math.round(passThreshold * 100)}% to pass</span>
              </div>
              <div className="flex gap-2.5">
                {!result.passed ? (
                  <button onClick={handleRetry}
                    className="px-5 py-2 rounded-lg text-[13px] font-semibold border border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition">
                    Retry Quiz
                  </button>
                ) : !isPerfect ? (
                  <button onClick={handleRetry}
                    className="px-5 py-2 rounded-lg text-[13px] font-semibold border border-amber-300 text-amber-600 hover:border-amber-400 hover:bg-amber-50 transition">
                    🔄 Retake for 100%
                  </button>
                ) : null}
                {result.passed && onNext && (
                  <button onClick={onNext}
                    className="px-6 py-2 rounded-lg text-[13px] font-bold bg-accent text-white hover:bg-accent2 shadow-glow transition">
                    Next →
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// Main Viewer Component
// ══════════════════════════════════════════════════════════════════════════════

export default function StudentCourseViewer() {
  const { customCourseId: enrollmentId } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { enrollmentData, enrollmentStatus } = useSelector((s) => s.student)

  const [flatNav, setFlatNav] = useState([])
  const [navIdx, setNavIdx] = useState(0)
  const [visited, setVisited] = useState([])
  const [modulesPassed, setModulesPassed] = useState([])
  const [finalPassed, setFinalPassed] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState({})
  const [quizQuestions, setQuizQuestions] = useState({})
  const [quizLoading, setQuizLoading] = useState({})
  const [completing, setCompleting] = useState(false)
  const [testResults, setTestResults] = useState({}) // { "M1": {score, total, passed, answers}, "final": {...} }
  const [testAttempts, setTestAttempts] = useState({}) // { "M1": [{score, total, passed}], "final": [...] }
  const [questionsReady, setQuestionsReady] = useState(true)
  const [lockedModalMi, setLockedModalMi] = useState(null) // module index for locked modal
  const [retryingQuiz, setRetryingQuiz] = useState(null) // mi or 'final' — bypasses readOnly branch
  const bodyRef = useRef(null)
  const pollRef = useRef(null)

  // ── Load enrollment data on mount ──────────────────────────────────────
  useEffect(() => {
    dispatch(loadEnrollmentData(enrollmentId))
    return () => {
      dispatch(clearEnrollmentData())
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [enrollmentId, dispatch])

  // ── Build flatNav and restore progress from enrollment ─────────────────
  useEffect(() => {
    if (enrollmentData?.modules) {
      const mods = enrollmentData.modules
      setFlatNav(buildFlatNav(mods))
      setNavIdx(0)

      const progress = enrollmentData.progress || {}
      setVisited(progress.visited || [])
      setFinalPassed(!!progress.final_passed)
      setTestResults(progress.test_results || {})
      setTestAttempts(progress.test_attempts || {})

      // Check questions_ready
      const ready = progress.questions_ready !== false
      setQuestionsReady(ready)

      // Convert module_tests_passed (module_ids) to module indices
      const passedIds = progress.module_tests_passed || []
      const passedIndices = []
      mods.forEach((mod, mi) => {
        if (passedIds.includes(mod.module_id)) passedIndices.push(mi)
      })
      setModulesPassed(passedIndices)

      // If questions not ready, poll
      if (!ready) {
        pollRef.current = setInterval(async () => {
          try {
            const fresh = await fetchEnrollment(enrollmentId)
            const p = fresh?.progress || {}
            if (p.questions_ready) {
              setQuestionsReady(true)
              if (pollRef.current) clearInterval(pollRef.current)
              // Reload full enrollment data
              dispatch(loadEnrollmentData(enrollmentId))
            }
          } catch (e) { console.warn('Poll failed:', e) }
        }, 3000)
      }
    }
  }, [enrollmentData, enrollmentId, dispatch])

  // ── MathJax re-render ──────────────────────────────────────────────────
  useEffect(() => {
    if (bodyRef.current) {
      const t = setTimeout(() => runMathJax(bodyRef.current), 60)
      return () => clearTimeout(t)
    }
  }, [navIdx])

  // ── Visit tracking ────────────────────────────────────────────────────
  const trackVisit = useCallback(async (mod, sub) => {
    if (!mod || !sub) return
    const key = `${mod.module_id}::${sub.submodule_id}`
    if (visited.includes(key)) return
    setVisited((prev) => prev.includes(key) ? prev : [...prev, key])
    try {
      await markSubmoduleVisited(enrollmentId, key)
    } catch (e) { console.warn('Visit track failed:', e) }
  }, [enrollmentId, visited])

  useEffect(() => {
    if (!enrollmentData?.modules || flatNav.length === 0) return
    const item = flatNav[navIdx]
    if (item?.type === 'slide') {
      const mod = enrollmentData.modules[item.mi]
      const sub = mod?.submodules?.[item.si]
      trackVisit(mod, sub)
    }
  }, [navIdx, flatNav, enrollmentData, trackVisit])

  // ── "Your course is being ready" screen ───────────────────────────────
  if (enrollmentStatus === 'loading') {
    return (
      <div className="min-h-screen bg-navy-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-navy-500 border-t-accent rounded-full animate-spin-slow mx-auto mb-4" />
          <p className="text-navy-300 text-[14px]">Loading course…</p>
        </div>
      </div>
    )
  }

  if (enrollmentStatus === 'failed' || !enrollmentData) {
    return (
      <div className="min-h-screen bg-navy-800 flex items-center justify-center">
        <div className="text-center px-8 max-w-sm">
          <div className="text-[56px] mb-5 animate-float">📭</div>
          <h2 className="font-display text-[22px] font-bold text-white mb-2">Course not found</h2>
          <p className="text-navy-300 text-[14px] mb-7">This enrollment may not exist or doesn't belong to you.</p>
          <button onClick={() => navigate('/student')}
            className="px-6 py-2.5 rounded-lg font-semibold bg-accent text-white hover:bg-accent2 shadow-glow transition">
            ← Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (!questionsReady) {
    return (
      <div className="min-h-screen bg-navy-800 flex items-center justify-center">
        <div className="text-center px-8 max-w-md">
          <div className="text-[56px] mb-5 animate-float">⚙️</div>
          <h2 className="font-display text-[22px] font-bold text-white mb-3">Your course is being prepared</h2>
          <p className="text-navy-300 text-[14px] mb-2">Generating quizzes and assessments for your selected modules…</p>
          <p className="text-navy-400 text-[12px] mb-6">This usually takes a few seconds.</p>
          <div className="w-48 h-1.5 bg-navy-700 rounded-full overflow-hidden mx-auto">
            <div className="h-full bg-accent rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    )
  }

  const data = enrollmentData
  const mods = data.modules || []
  const currentItem = flatNav[navIdx]
  const currentMod = (currentItem && currentItem.mi !== undefined) ? mods[currentItem.mi] : null

  // ── Progress calculation (visit-based) ────────────────────────────────
  const totalSubmodules = mods.reduce((acc, mod) => acc + (mod.submodules || []).length, 0)
  const totalItems = totalSubmodules + mods.length + 1
  const completedItems = visited.length + modulesPassed.length + (finalPassed ? 1 : 0)
  const pct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

  const videos = currentMod?.youtube_videos || []

  const allModulesComplete = mods.every((mod, mi) => {
    const allVisited = allSubmodulesVisited(mod, mi, visited)
    const testPassed = modulesPassed.includes(mi)
    return allVisited && testPassed
  })
  const canFinish = allModulesComplete && finalPassed

  // ── Navigation helpers ────────────────────────────────────────────────

  const isNavTargetLocked = (idx) => {
    const item = flatNav[idx]
    if (!item || item.mi === undefined) return false
    return !isModuleUnlocked(item.mi, modulesPassed)
  }

  const jumpSub = (mi, si) => {
    if (!isModuleUnlocked(mi, modulesPassed)) return
    const idx = flatNav.findIndex((n) => n.type === 'slide' && n.mi === mi && n.si === si)
    if (idx >= 0) setNavIdx(idx)
  }

  const jumpRefs = (mi) => {
    if (!isModuleUnlocked(mi, modulesPassed)) return
    const idx = flatNav.findIndex((n) => n.type === 'refs' && n.mi === mi)
    if (idx >= 0) setNavIdx(idx)
  }

  const jumpQuiz = (mi) => {
    if (!isModuleUnlocked(mi, modulesPassed)) return
    const idx = flatNav.findIndex((n) => n.type === 'quiz' && n.mi === mi)
    if (idx >= 0) {
      setNavIdx(idx)
      loadQuiz(mi)
    }
  }

  const jumpFinal = () => {
    if (!allModulesComplete) return
    const idx = flatNav.findIndex((n) => n.type === 'final')
    if (idx >= 0) {
      setNavIdx(idx)
      loadFinalQuiz()
    }
  }

  const navSlide = (dir) => {
    const next = navIdx + dir
    if (next < 0 || next >= flatNav.length) return
    if (isNavTargetLocked(next)) return
    const nextItem = flatNav[next]
    if (nextItem?.type === 'quiz') loadQuiz(nextItem.mi)
    if (nextItem?.type === 'final') loadFinalQuiz()
    setNavIdx(next)
  }

  const jumpDot = (targetSl) => {
    if (!currentItem) return
    const idx = flatNav.findIndex(
      (n) => n.type === 'slide' && n.mi === currentItem.mi && n.si === currentItem.si && n.sl === targetSl
    )
    if (idx >= 0) setNavIdx(idx)
  }

  // ── Quiz loading helpers ──────────────────────────────────────────────

  const loadQuiz = async (mi, force = false) => {
    if ((!force && quizQuestions[mi]) || quizLoading[mi]) return
    const mod = mods[mi]
    if (!mod) return
    setQuizLoading((p) => ({ ...p, [mi]: true }))
    try {
      const qs = await fetchModuleQuestions(enrollmentId, mod.module_id)
      setQuizQuestions((p) => ({ ...p, [mi]: qs }))
    } catch (e) { console.warn('Quiz load failed:', e) }
    setQuizLoading((p) => ({ ...p, [mi]: false }))
  }

  const loadFinalQuiz = async (force = false) => {
    if ((!force && quizQuestions['final']) || quizLoading['final']) return
    setQuizLoading((p) => ({ ...p, final: true }))
    try {
      const qs = await fetchFinalQuestions(enrollmentId)
      setQuizQuestions((p) => ({ ...p, final: qs }))
    } catch (e) { console.warn('Final quiz load failed:', e) }
    setQuizLoading((p) => ({ ...p, final: false }))
  }

  // ── Quiz submit handlers ──────────────────────────────────────────────

  const handleModuleQuizSubmit = async (mi, correct, total, passed, answersMap) => {
    const mod = mods[mi]
    if (!mod) return
    try {
      await submitModuleTest(enrollmentId, mod.module_id, correct, total, answersMap)
    } catch (e) { console.warn('Module test submit failed:', e) }
    // Store results locally
    setTestResults((prev) => ({
      ...prev,
      [mod.module_id]: { score: correct, total, passed, answers: answersMap },
    }))
    // Track attempts
    setTestAttempts((prev) => {
      const existing = prev[mod.module_id] || []
      return { ...prev, [mod.module_id]: [...existing, { score: correct, total, passed }] }
    })
    if (passed && !modulesPassed.includes(mi)) {
      setModulesPassed((prev) => [...prev, mi])
    }
    // Clear retrying flag so readOnly branch can take over again
    if (retryingQuiz === mi) setRetryingQuiz(null)
  }

  const handleFinalQuizSubmit = async (correct, total, passed, answersMap) => {
    try {
      await submitFinalTest(enrollmentId, correct, total, answersMap)
    } catch (e) { console.warn('Final test submit failed:', e) }
    setTestResults((prev) => ({
      ...prev,
      final: { score: correct, total, passed, answers: answersMap },
    }))
    // Track attempts
    setTestAttempts((prev) => {
      const existing = prev['final'] || []
      return { ...prev, final: [...existing, { score: correct, total, passed }] }
    })
    if (passed) setFinalPassed(true)
    // Clear retrying flag
    if (retryingQuiz === 'final') setRetryingQuiz(null)
  }

  // ── Quiz retrial (allow retaking even if passed but not 100%) ─────────
  const handleModuleQuizRetry = (mi) => {
    const mod = mods[mi]
    if (!mod) return
    // Clear cached questions AND test result so QuizPanel fully resets
    setQuizQuestions((prev) => { const next = { ...prev }; delete next[mi]; return next })
    setTestResults((prev) => { const next = { ...prev }; delete next[mod.module_id]; return next })
    setRetryingQuiz(mi)
    loadQuiz(mi, true)
  }

  const handleFinalQuizRetry = () => {
    setQuizQuestions((prev) => { const next = { ...prev }; delete next['final']; return next })
    setTestResults((prev) => { const next = { ...prev }; delete next['final']; return next })
    setRetryingQuiz('final')
    loadFinalQuiz(true)
  }

  const handleDone = async () => {
    if (completing) return
    setCompleting(true)
    try {
      await completeCourse(enrollmentId)
      navigate('/student')
    } catch (e) {
      console.warn('Complete failed:', e)
      setCompleting(false)
    }
  }

  // ── Current item data ─────────────────────────────────────────────────
  const slide = currentItem?.type === 'slide' && mods[currentItem.mi]
    ? mods[currentItem.mi].submodules[currentItem.si]?.slides?.[currentItem.sl]
    : null
  const currentSub = currentItem?.type === 'slide' && mods[currentItem.mi]
    ? mods[currentItem.mi].submodules[currentItem.si] : null
  const totalSlides = currentSub ? (currentSub.slides || []).length : 0

  const refsMod = currentItem?.type === 'refs' ? mods[currentItem.mi] : null
  const refs = refsMod?.references || []

  const quizMi = currentItem?.type === 'quiz' ? currentItem.mi : null
  const quizMod = quizMi !== null ? mods[quizMi] : null
  const quizReady = quizMod ? allSubmodulesVisited(quizMod, quizMi, visited) : false

  const nextLocked = navIdx + 1 < flatNav.length && isNavTargetLocked(navIdx + 1)

  // Get last test result for current module quiz
  const moduleTestResult = quizMod ? testResults[quizMod.module_id] : null
  const finalTestResult = testResults['final'] || null

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f8f9fa' }}>
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
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
          {canFinish && (
            <button onClick={handleDone} disabled={completing}
              className="px-4 py-1.5 rounded-lg text-[12px] font-bold bg-success text-white hover:bg-green-500 disabled:opacity-50 transition shadow-glow">
              {completing ? 'Completing…' : '✓ Done'}
            </button>
          )}
        </div>
      </div>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <nav className="fixed top-14 left-0 bottom-0 w-[280px] bg-navy-900 border-r border-navy-700/70 overflow-y-auto z-40 flex flex-col">
        <div className="px-4 pt-4 pb-3 border-b border-navy-700/60 flex-shrink-0">
          <div className="text-[9px] font-bold text-navy-500 uppercase tracking-widest mb-1.5">📖 Course</div>
          <div className="text-[13px] font-semibold text-navy-100 leading-snug">{data.course_title}</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {mods.map((mod, mi) => {
            const isOpen = sidebarOpen[mi] !== false
            const hasRefs = (mod.references || []).length > 0
            const vidCount = (mod.youtube_videos || []).length
            const locked = !isModuleUnlocked(mi, modulesPassed)
            const testPassed = modulesPassed.includes(mi)
            const allVisited = allSubmodulesVisited(mod, mi, visited)
            const modResult = testResults[mod.module_id]

            return (
              <div key={mi} className={`border-b border-navy-800/80 ${locked ? 'opacity-50' : ''}`}>
                <button
                  onClick={() => locked ? setLockedModalMi(mi) : setSidebarOpen((p) => ({ ...p, [mi]: !isOpen }))}
                  className={`w-full flex items-center gap-2 px-4 py-3 text-left transition select-none ${
                    locked ? 'cursor-pointer' : 'hover:bg-navy-800/60 cursor-pointer'
                  }`}
                >
                  {locked ? (
                    <span className="text-[11px] text-navy-500 flex-shrink-0">🔒</span>
                  ) : (
                    <span className="text-[9px] text-navy-500 flex-shrink-0 transition-transform duration-150"
                      style={{ display:'inline-block', transform: isOpen ? 'rotate(90deg)' : '' }}>▶</span>
                  )}
                  <span className="text-[12px] font-bold text-navy-200 flex-1 leading-snug">{mod.title}</span>
                  {testPassed && <span className="text-[10px] text-success flex-shrink-0">✓</span>}
                  {vidCount > 0 && !locked && <span className="text-[9px] text-navy-500 flex-shrink-0">▶{vidCount}</span>}
                </button>
                {isOpen && !locked && (
                  <div className="pb-1.5">
                    {(mod.submodules || []).map((sub, si) => {
                      const isActive = currentItem?.type === 'slide' && currentItem.mi === mi && currentItem.si === si
                      const subKey = `${mod.module_id}::${sub.submodule_id}`
                      const isDone = visited.includes(subKey)
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
                    {/* Module quiz link with score */}
                    <button onClick={() => jumpQuiz(mi)}
                      className={`w-full flex items-center gap-2 pl-9 pr-4 py-1.5 text-left text-[11px] transition-colors ${
                        currentItem?.type === 'quiz' && currentItem.mi === mi
                          ? 'text-accent font-semibold'
                          : testPassed ? 'text-success'
                          : allVisited ? 'text-warn hover:text-warn hover:bg-navy-800/30'
                          : 'text-navy-500'
                      }`}
                      disabled={!allVisited && !testPassed}
                    >
                      <span className="text-[10px]">{testPassed ? '✅' : allVisited ? '📝' : '🔒'}</span>
                      <span className="flex-1">
                        Module Quiz {!testPassed && !allVisited ? '(visit all lessons)' : ''}
                      </span>
                      {modResult && (
                        <span className={`text-[10px] font-mono ${modResult.passed ? 'text-success' : 'text-red-400'}`}>
                          {modResult.score}/{modResult.total}
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {/* Final assessment link with score */}
          <div className={`border-b border-navy-800/80 ${!allModulesComplete ? 'opacity-50' : ''}`}>
            <button
              onClick={() => allModulesComplete && jumpFinal()}
              className={`w-full flex items-center gap-2 px-4 py-3 text-left text-[12px] font-bold transition ${
                currentItem?.type === 'final'
                  ? 'text-accent bg-accent/10'
                  : finalPassed ? 'text-success' : allModulesComplete ? 'text-warn hover:bg-navy-800/60' : 'text-navy-500 cursor-not-allowed'
              }`}
              disabled={!allModulesComplete}
            >
              <span className="text-[12px]">{finalPassed ? '🏆' : allModulesComplete ? '📋' : '🔒'}</span>
              <span className="flex-1">
                Final Assessment {finalPassed ? '(Passed)' : !allModulesComplete ? '(complete all modules)' : ''}
              </span>
              {finalTestResult && (
                <span className={`text-[10px] font-mono ${finalTestResult.passed ? 'text-success' : 'text-red-400'}`}>
                  {finalTestResult.score}/{finalTestResult.total}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Content Area ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-y-auto"
        style={{ marginLeft: '280px', marginTop: '56px', minHeight: 'calc(100vh - 56px)', background: '#ffffff' }}>

        {/* Video bar */}
        {videos.length > 0 && currentItem?.type !== 'quiz' && currentItem?.type !== 'final' && (
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

        {/* ── Slide view ─────────────────────────────────────────────────── */}
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
                        : i < currentItem.sl ? 'w-4 bg-accent/30'
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
                <button onClick={() => navSlide(1)} disabled={navIdx >= flatNav.length - 1 || nextLocked}
                  className="px-6 py-2 rounded-lg text-[13px] font-bold bg-accent text-white hover:bg-accent2 disabled:opacity-30 disabled:cursor-not-allowed shadow-glow transition">
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Refs view ──────────────────────────────────────────────────── */}
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
                <button onClick={() => navSlide(1)} disabled={navIdx >= flatNav.length - 1 || nextLocked}
                  className="px-5 py-2 rounded-lg text-[13px] font-bold bg-accent text-white hover:bg-accent2 disabled:opacity-30 disabled:cursor-not-allowed shadow-glow transition">
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Module Quiz view ───────────────────────────────────────────── */}
        {currentItem?.type === 'quiz' && quizMod && (
          <>
            {!quizReady ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center px-8 max-w-md">
                  <div className="text-[48px] mb-4">🔒</div>
                  <h3 className="font-display text-[18px] font-bold text-gray-700 mb-2">Module Quiz Locked</h3>
                  <p className="text-gray-400 text-[14px] mb-4">
                    Visit all lessons in <span className="font-semibold text-gray-600">{quizMod.title}</span> to unlock this quiz.
                  </p>
                  <button onClick={() => navSlide(-1)}
                    className="px-5 py-2 rounded-lg text-[13px] font-semibold border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition">
                    ← Go back to lessons
                  </button>
                </div>
              </div>
            ) : modulesPassed.includes(quizMi) && retryingQuiz !== quizMi ? (
              /* Show last results with green/red marks when already passed — allow retrial */
              <QuizPanel
                questions={quizQuestions[quizMi] || []}
                title={`📝 Module Quiz — ${quizMod.title}`}
                subtitle="5 questions · 4 easy, 1 hard · 60% to pass"
                passThreshold={0.6}
                lastResult={moduleTestResult}
                readOnly={true}
                attempts={testAttempts[quizMod.module_id] || []}
                onRetry={() => handleModuleQuizRetry(quizMi)}
                onNext={() => navSlide(1)}
                onSubmit={() => {}}
              />
            ) : (
              <QuizPanel
                questions={quizQuestions[quizMi] || []}
                title={`📝 Module Quiz — ${quizMod.title}`}
                subtitle="5 questions · 4 easy, 1 hard · 60% to pass"
                passThreshold={0.6}
                lastResult={moduleTestResult}
                attempts={testAttempts[quizMod?.module_id] || []}
                onRetry={retryingQuiz === quizMi ? () => handleModuleQuizRetry(quizMi) : undefined}
                onNext={moduleTestResult?.passed ? () => navSlide(1) : undefined}
                onSubmit={(correct, total, passed, answersMap) => handleModuleQuizSubmit(quizMi, correct, total, passed, answersMap)}
              />
            )}
          </>
        )}

        {/* ── Final Assessment view ──────────────────────────────────────── */}
        {currentItem?.type === 'final' && (
          <>
            {!allModulesComplete ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center px-8 max-w-md">
                  <div className="text-[48px] mb-4">🔒</div>
                  <h3 className="font-display text-[18px] font-bold text-gray-700 mb-2">Final Assessment Locked</h3>
                  <p className="text-gray-400 text-[14px]">Complete all module quizzes to unlock the final assessment.</p>
                </div>
              </div>
            ) : finalPassed && retryingQuiz !== 'final' ? (
              <div className="flex-1 flex flex-col w-full">
                {/* Show last results for final, then the completion section */}
                <QuizPanel
                  questions={quizQuestions['final'] || []}
                  title="📋 Final Assessment"
                  subtitle="15 questions · Mixed difficulty · 60% to pass"
                  passThreshold={0.6}
                  lastResult={finalTestResult}
                  readOnly={true}
                  attempts={testAttempts['final'] || []}
                  onRetry={handleFinalQuizRetry}
                  onSubmit={() => {}}
                />
                {canFinish && (
                  <div className="px-8 py-5 border-t border-gray-100 bg-green-50 flex items-center justify-center">
                    <button onClick={handleDone} disabled={completing}
                      className="px-8 py-3 rounded-lg text-[14px] font-bold bg-success text-white hover:bg-green-500 disabled:opacity-50 shadow-glow transition">
                      {completing ? 'Completing…' : '🏆 Mark Course as Done'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <QuizPanel
                questions={quizQuestions['final'] || []}
                title="📋 Final Assessment"
                subtitle="15 questions · Mixed difficulty · 60% to pass"
                passThreshold={0.6}
                lastResult={finalTestResult}
                attempts={testAttempts['final'] || []}
                onRetry={retryingQuiz === 'final' ? handleFinalQuizRetry : undefined}
                onSubmit={(correct, total, passed, answersMap) => handleFinalQuizSubmit(correct, total, passed, answersMap)}
              />
            )}
          </>
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

      {/* ── Locked Module Modal ──────────────────────────────────────────── */}
      {lockedModalMi !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setLockedModalMi(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-xl shadow-2xl px-8 py-7 max-w-sm w-full mx-4 text-center animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="text-[44px] mb-4">🔒</div>
            <h3 className="font-display text-[18px] font-bold text-gray-800 mb-2">Module Locked</h3>
            <p className="text-gray-500 text-[14px] mb-6 leading-relaxed">
              Complete the submodules of the previous module and pass its quiz to unlock
              <span className="font-semibold text-gray-700"> {mods[lockedModalMi]?.title || 'this module'}</span>.
            </p>
            <button
              onClick={() => setLockedModalMi(null)}
              className="px-6 py-2.5 rounded-lg text-[13px] font-bold bg-accent text-white hover:bg-accent2 shadow-glow transition">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

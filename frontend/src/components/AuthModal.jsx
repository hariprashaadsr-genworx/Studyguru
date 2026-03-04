import React, { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { openAuthModal, closeAuthModal, login, signup, clearError } from '../store/authSlice'
import { googleLogin } from '../api/auth'
import { toast } from '../store/uiSlice'
import { useNavigate } from 'react-router-dom'

const Field = ({ label, type = 'text', value, onChange, placeholder, autoComplete, children }) => (
  <div>
    <label className="block text-[11px] font-bold text-navy-300 mb-1.5 uppercase tracking-widest">{label}</label>
    <div className="relative">
      <input
        type={type} value={value} onChange={onChange}
        placeholder={placeholder} autoComplete={autoComplete}
        className="w-full px-4 py-3 rounded-lg bg-navy-900 border border-navy-500/50 text-navy-100 placeholder-navy-500 text-[14px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 transition"
      />
      {children}
    </div>
  </div>
)

export default function AuthModal() {
  const dispatch  = useDispatch()
  const navigate  = useNavigate()
  const { authModal, status, error, isAuthenticated } = useSelector((s) => s.auth)
  const isLogin   = authModal === 'login'

  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  useEffect(() => {
    setName(''); setEmail(''); setPassword(''); setShowPass(false)
    dispatch(clearError())
  }, [authModal, dispatch])

  useEffect(() => {
    if (isAuthenticated && authModal === null) {
      dispatch(toast(isLogin ? 'Welcome back! 👋' : 'Account created! 🎉'))
      navigate('/dashboard')
    }
  }, [isAuthenticated, authModal]) // eslint-disable-line

  if (!authModal) return null

  const submit = (e) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) { dispatch(toast('Please fill all fields')); return }
    if (!isLogin && !name.trim())          { dispatch(toast('Please enter your name')); return }
    if (isLogin) dispatch(login({ email: email.trim(), password }))
    else         dispatch(signup({ name: name.trim(), email: email.trim(), password }))
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-navy-950/85 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) dispatch(closeAuthModal()) }}
    >
      <div className="bg-navy-700 border border-navy-500/40 rounded-xl w-full max-w-[420px] shadow-modal overflow-hidden animate-slide-up">
        {/* top accent line */}
        <div className="h-[3px] bg-gradient-to-r from-accent2 via-accent to-accent2" />

        <div className="p-8">
          {/* header */}
          <div className="flex items-start justify-between mb-7">
            <div>
              <h2 className="font-display text-[21px] font-bold text-white">
                {isLogin ? 'Sign In' : 'Create Account'}
              </h2>
              <p className="text-[13px] text-navy-300 mt-1">
                {isLogin ? 'Welcome back to StudyGuru AI' : 'Start learning with AI-generated courses'}
              </p>
            </div>
            <button
              onClick={() => dispatch(closeAuthModal())}
              className="w-8 h-8 flex-shrink-0 rounded-md flex items-center justify-center text-navy-400 hover:bg-navy-600 hover:text-white transition ml-4 text-lg"
            >✕</button>
          </div>

          {/* Google */}
          <button
  type="button"
  onClick={googleLogin}
  style={{ border: "1px solid #1e3861" }}
  className="w-full flex items-center justify-center gap-3 py-3 rounded-lg
             text-navy-200 font-semibold text-[14px]
             hover:bg-navy-600/60 transition mb-5"
>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-navy-500/40" />
            <span className="text-[11px] text-navy-400 font-medium uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-navy-500/40" />
          </div>

          {/* error */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-danger/10 border border-danger/30 text-red-300 text-[13px] flex items-start gap-2.5 animate-fade-in">
              <span className="flex-shrink-0 mt-px">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            {!isLogin && (
              <Field label="Full Name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace" autoComplete="name" />
            )}
            <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" />
            <Field label="Password" type={showPass ? 'text' : 'password'} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
              autoComplete={isLogin ? 'current-password' : 'new-password'}>
              <button type="button" tabIndex={-1} onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-200 text-[12px] transition">
                {showPass ? '🙈' : '👁'}
              </button>
            </Field>

            <button type="submit" disabled={status === 'loading'}
              className="w-full py-3.5 mt-1 rounded-lg font-bold text-[14px] bg-accent text-white hover:bg-accent2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-glow">
              {status === 'loading'
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-slow" />{isLogin ? 'Signing in…' : 'Creating account…'}</>
                : isLogin ? 'Sign In →' : 'Create Account →'
              }
            </button>
          </form>

          <p className="mt-5 text-center text-[13px] text-navy-400">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => dispatch(openAuthModal(isLogin ? 'signup' : 'login'))}
              className="text-accent hover:text-accent-light font-semibold transition-colors">
              {isLogin ? 'Sign up free' : 'Log in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

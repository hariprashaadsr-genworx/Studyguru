/**
 * Auth API
 *
 * Token strategy:
 *   access_token  → localStorage  (short-lived, sent as Bearer)
 *   refresh_token → httpOnly cookie set by backend  OR  fallback js-cookie
 *
 * All /api/auth/* routes go through Vite proxy → localhost:8001
 */
import Cookies from 'js-cookie'

const AUTH_BASE = '/api/auth'

const COOKIE_OPTS = {
  expires: 30,          // days
  sameSite: 'Lax',
  secure: location.protocol === 'https:',
}

// ── token storage helpers ────────────────────────────────────────────────────
export function getAccessToken()  { return localStorage.getItem('sg_access') || '' }
export function setAccessToken(t) { localStorage.setItem('sg_access', t) }
export function clearAccessToken(){ localStorage.removeItem('sg_access') }

export function getRefreshToken()  { return Cookies.get('sg_refresh') || '' }
export function setRefreshToken(t) { Cookies.set('sg_refresh', t, COOKIE_OPTS) }
export function clearRefreshToken(){ Cookies.remove('sg_refresh') }

function authHeader() {
  const t = getAccessToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

// ── persist / clear full session ────────────────────────────────────────────
export function persistSession({ access_token, refresh_token, user }) {
  if (access_token)  setAccessToken(access_token)
  if (refresh_token) setRefreshToken(refresh_token)
  try { localStorage.setItem('sg_user', JSON.stringify(user)) } catch (_) {}
}

export function clearSession() {
  clearAccessToken()
  clearRefreshToken()
  try { localStorage.removeItem('sg_user') } catch (_) {}
}

export function loadPersistedUser() {
  try {
    const raw = localStorage.getItem('sg_user')
    return raw ? JSON.parse(raw) : null
  } catch (_) { return null }
}

// ── POST /api/auth/login ─────────────────────────────────────────────────────
export async function loginUser({ email, password }) {
  const res  = await fetch(`${AUTH_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',          // let backend set httpOnly cookie too
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.message || `Login failed (${res.status})`)
  return data   // { access_token, refresh_token?, user }
}

// ── POST /api/auth/signup ────────────────────────────────────────────────────
export async function signupUser({ name, email, password }) {
  const res  = await fetch(`${AUTH_BASE}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name, email, password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.message || `Signup failed (${res.status})`)
  return data   // { access_token, refresh_token?, user }
}

// ── POST /api/auth/refresh ───────────────────────────────────────────────────
export async function refreshAccessToken() {
  const refresh = getRefreshToken()

  if (!refresh) {
    throw new Error("No refresh token available")
  }

  const res = await fetch(`${AUTH_BASE}/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      refresh_token: refresh,
    }),
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.detail || 'Refresh failed')
  }

  if (data.access_token) setAccessToken(data.access_token)
  if (data.refresh_token) setRefreshToken(data.refresh_token)

  return data.access_token
}

// ── POST /api/auth/logout ────────────────────────────────────────────────────
export async function logoutUser(logoutAll = false) {
  const refresh = getRefreshToken()

  try {
    await fetch(`${AUTH_BASE}/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(), // sends access token
      },
      credentials: 'include',
      body: JSON.stringify({
        refresh_token: refresh || null,
        logout_all: logoutAll,
      }),
    })
  } catch (err) {
    console.error("Logout failed:", err)
    // best-effort — still clear local session
  }

  clearSession()
}

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
export async function fetchMe() {
  const token = getAccessToken()
  if (!token) throw new Error('No token')
  const res = await fetch(`${AUTH_BASE}/me`, {
    headers: authHeader(),
    credentials: 'include',
  })
  if (res.status === 401) {
    // Try refresh once
    const newToken = await refreshAccessToken()
    const res2 = await fetch(`${AUTH_BASE}/me`, {
      headers: { Authorization: `Bearer ${newToken}` },
      credentials: 'include',
    })
    if (!res2.ok) throw new Error('Session expired')
    return res2.json()
  }
  if (!res.ok) throw new Error('Session expired')
  return res.json()
}

// ── Google OAuth ─────────────────────────────────────────────────────────────
export function googleLogin() {
  window.location.href = `${AUTH_BASE}/google`
}

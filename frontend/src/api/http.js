/**
 * Authenticated fetch wrapper
 * — auto-attaches Bearer token
 * — on 401, attempts one token refresh then retries
 * — on second 401, dispatches a session-expired event
 */
import { getAccessToken, refreshAccessToken, clearSession } from './auth'

export async function apiFetch(url, options = {}) {
  const doFetch = (token) =>
    fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

  let res = await doFetch(getAccessToken())

  if (res.status === 401) {
    try {
      const newToken = await refreshAccessToken()
      res = await doFetch(newToken)
    } catch (_) {
      clearSession()
      window.dispatchEvent(new Event('ce:session-expired'))
      throw new Error('Session expired. Please log in again.')
    }
  }

  return res
}

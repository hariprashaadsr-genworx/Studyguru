import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import {
  loginUser, signupUser, logoutUser, fetchMe,
  persistSession, clearSession, loadPersistedUser,
  getAccessToken, setAccessToken, getRefreshToken, setRefreshToken,
} from '../api/auth'

// ── thunks ────────────────────────────────────────────────────────────────────

export const login = createAsyncThunk('auth/login', async (creds, { rejectWithValue }) => {
  try {
    const data = await loginUser(creds)
    persistSession(data)           // access→LS, refresh→cookie, user→LS
    return data
  } catch (e) { return rejectWithValue(e.message) }
})

export const signup = createAsyncThunk('auth/signup', async (payload, { rejectWithValue }) => {
  try {
    const data = await signupUser(payload)
    persistSession(data)
    return data
  } catch (e) { return rejectWithValue(e.message) }
})

export const logout = createAsyncThunk('auth/logout', async () => {
  await logoutUser()               // calls /api/auth/logout then clearSession()
})

/** Called on boot — validates stored access token (or refreshes via cookie) */
export const restoreSession = createAsyncThunk('auth/restoreSession', async (_, { rejectWithValue }) => {
  if (!getAccessToken() && !getRefreshToken()) return rejectWithValue('no tokens')
  try {
    const user = await fetchMe()   // auto-refreshes on 401
    return { user }
  } catch (e) {
    clearSession()
    return rejectWithValue('expired')
  }
})

// ── initial state from localStorage ──────────────────────────────────────────
const initUser  = loadPersistedUser()
const initToken = getAccessToken()

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user:            initUser,
    token:           initToken,
    role:            initUser?.role || null,
    isAuthenticated: !!(initToken || getRefreshToken()),
    status:          'idle',   // idle | loading
    error:           null,
    authModal:       null,     // null | 'login' | 'signup'
  },
  reducers: {
    openAuthModal(state, action) { state.authModal = action.payload; state.error = null },
    closeAuthModal(state)        { state.authModal = null; state.error = null },
    clearError(state)            { state.error = null },

    /** Hydrate from Google OAuth callback (?token=...&user=...) */
    setAuthFromGoogle(state, action) {
      const { access_token, refresh_token, user } = action.payload
      state.token           = access_token
      state.user            = user
      state.role            = user?.role || 'student'
      state.isAuthenticated = true
      state.authModal       = null
      state.error           = null
      persistSession({ access_token, refresh_token, user })
    },

    /** Called by the http interceptor when both token+refresh fail */
    sessionExpired(state) {
      state.user            = null
      state.token           = null
      state.role            = null
      state.isAuthenticated = false
    },
  },
  extraReducers: (builder) => {
    const setLoading  = (state) => { state.status = 'loading'; state.error = null }
    const setError    = (state, a) => { state.status = 'idle'; state.error = a.payload || a.error.message }
    const setLoggedIn = (state, a) => {
      state.status          = 'idle'
      state.token           = a.payload.access_token
      state.user            = a.payload.user
      state.role            = a.payload.user?.role || 'student'
      state.isAuthenticated = true
      state.authModal       = null
    }

    builder
      .addCase(login.pending,   setLoading)
      .addCase(login.fulfilled, setLoggedIn)
      .addCase(login.rejected,  setError)

    builder
      .addCase(signup.pending,   setLoading)
      .addCase(signup.fulfilled, setLoggedIn)
      .addCase(signup.rejected,  setError)

    builder
      .addCase(logout.fulfilled, (state) => {
        state.user = null; state.token = null; state.role = null; state.isAuthenticated = false
      })

    builder
      .addCase(restoreSession.fulfilled, (state, a) => {
        state.user            = a.payload.user
        state.role            = a.payload.user?.role || 'student'
        state.isAuthenticated = true
        // update stored user
        try { localStorage.setItem('sg_user', JSON.stringify(a.payload.user)) } catch (_) {}
      })
      .addCase(restoreSession.rejected, (state) => {
        state.user = null; state.token = null; state.role = null; state.isAuthenticated = false
      })
  },
})

export const { openAuthModal, closeAuthModal, clearError, setAuthFromGoogle, sessionExpired } = authSlice.actions
export default authSlice.reducer

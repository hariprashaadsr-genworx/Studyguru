# StudyGuru AI — Frontend Architecture & Developer Guide

> **Stack:** React 18 · Redux Toolkit · React Router v6 · Tailwind CSS · Vite  
> **Backend expects:** Auth server on `localhost:8001`, Course API on `localhost:8000`

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Bootstrap — How the App Starts](#2-bootstrap--how-the-app-starts)
3. [Routing](#3-routing)
4. [Redux Store — Overview](#4-redux-store--overview)
5. [Auth Slice — Deep Dive](#5-auth-slice--deep-dive)
6. [Token Strategy & Storage](#6-token-strategy--storage)
7. [API Layer](#7-api-layer)
8. [Authentication Flow — Every Scenario](#8-authentication-flow--every-scenario)
9. [Dashboard Slice](#9-dashboard-slice)
10. [Course Slice & Navigation Model](#10-course-slice--navigation-model)
11. [Generation Slice & SSE Streaming](#11-generation-slice--sse-streaming)
12. [UI Slice — Toasts & Modals](#12-ui-slice--toasts--modals)
13. [Page-by-Page Walkthrough](#13-page-by-page-walkthrough)
14. [Component Reference](#14-component-reference)
15. [Markdown + LaTeX Rendering](#15-markdown--latex-rendering)
16. [Vite Proxy Configuration](#16-vite-proxy-configuration)
17. [Full Redux State Shape](#17-full-redux-state-shape)
18. [All API Endpoints Called](#18-all-api-endpoints-called)
19. [Data Flow Diagrams](#19-data-flow-diagrams)

---

## 1. Project Structure

```
studyguru/
├── index.html                  # Entry HTML — MathJax loaded here
├── vite.config.js              # Dev server + proxy rules
├── tailwind.config.js          # Design tokens (navy palette + accent)
├── package.json
└── src/
    ├── main.jsx                # ReactDOM.createRoot, Redux Provider
    ├── App.jsx                 # BrowserRouter, routes, session restore
    ├── index.css               # Global styles, animations, slide-body-light
    │
    ├── api/
    │   ├── auth.js             # Raw fetch calls to /api/auth/*
    │   ├── http.js             # Authenticated fetch wrapper (auto-refresh)
    │   ├── courses.js          # GET /api/courses, GET /api/course/:id
    │   ├── generate.js         # POST /api/generate
    │   └── syllabus.js         # POST /api/get_syllabus/
    │
    ├── store/
    │   ├── index.js            # configureStore — combines all reducers
    │   ├── authSlice.js        # User identity, login/signup/logout thunks
    │   ├── dashboardSlice.js   # Course list for dashboard
    │   ├── courseSlice.js      # Active course data + flat navigation
    │   ├── generationSlice.js  # Course generation job + SSE log stream
    │   └── uiSlice.js          # Toast notifications, modal open/close
    │
    ├── pages/
    │   ├── Landing.jsx         # Public landing page + Google OAuth callback
    │   ├── Dashboard.jsx       # Course grid (protected)
    │   ├── CourseViewer.jsx    # Slide viewer with sidebar (protected)
    │   └── GeneratingView.jsx  # Live generation progress (protected)
    │
    └── components/
        ├── AuthModal.jsx       # Login / signup modal
        ├── CourseCard.jsx      # Card in dashboard grid
        ├── CourseSidebar.jsx   # Left nav inside CourseViewer
        ├── CreateCourseModal.jsx # 2-step: syllabus paste → edit → generate
        ├── DashboardNav.jsx    # Navbar for dashboard
        ├── RefsPanel.jsx       # References view inside course
        ├── SlideView.jsx       # Slide renderer (Markdown + MathJax)
        ├── StatCards.jsx       # Aggregate stats row on dashboard
        ├── Toast.jsx           # Bottom-right toast notification
        ├── VideoBar.jsx        # Dark video strip above slides
        └── ViewerTopBar.jsx    # Top bar inside CourseViewer
```

---

## 2. Bootstrap — How the App Starts

### `main.jsx`
```
ReactDOM renders <App /> wrapped in:
  └── <React.StrictMode>
        └── <Provider store={store}>   ← injects Redux store into all components
              └── <App />
```

### `store/index.js` — Store is created once at module load time
```js
configureStore({
  reducer: {
    auth:       authReducer,        // user identity
    dashboard:  dashboardReducer,   // course list
    course:     courseReducer,      // active course viewer
    generation: generationReducer,  // active generation job
    ui:         uiReducer,          // toasts, modals
  }
})
```

**Important:** The `auth` slice reads `localStorage` and `js-cookie` **synchronously at module evaluation time** to hydrate the initial state — so even before React renders, Redux already knows if a session exists:
```js
// authSlice.js — runs when the module is first imported
const initUser  = loadPersistedUser()     // reads localStorage['sg_user']
const initToken = getAccessToken()        // reads localStorage['sg_access']

initialState: {
  user:            initUser,              // null or UserObject
  token:           initToken,             // null or JWT string
  isAuthenticated: !!(initToken || getRefreshToken()),  // true if either exists
  ...
}
```

### `App.jsx` — Two side effects run on mount

**Effect 1: Session restoration**
```js
useEffect(() => {
  dispatch(restoreSession())
}, [])
```
This calls `GET /api/auth/me` to validate the stored token. If it succeeds, `auth.user` is refreshed from the server. If it fails (expired), tokens are cleared and `isAuthenticated` becomes `false`.

**Effect 2: Global session-expired listener**
```js
window.addEventListener('ce:session-expired', handler)
```
When any `apiFetch()` call fails a token refresh mid-session, it fires this browser event. The handler dispatches `sessionExpired()` (clears Redux auth state) and shows a toast.

---

## 3. Routing

```
/                    → Landing         (public)
/dashboard           → Dashboard       (protected — redirects to / if not auth)
/generating          → GeneratingView  (protected)
/course/:courseId    → CourseViewer    (protected)
*                    → redirect to /
```

**`ProtectedRoute` wrapper:**
```jsx
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useSelector((s) => s.auth)
  return isAuthenticated ? children : <Navigate to="/" replace />
}
```
If `isAuthenticated` is `false`, the user is silently redirected to `/` (the Landing page). There is no `/login` route — authentication happens via a modal overlay on the Landing page.

**Why `BrowserRouter` (not `HashRouter`):**  
Google OAuth redirects back to `/?token=abc&user=xyz`. HashRouter would put the query string after `#` which breaks the OAuth callback parsing in `Landing.jsx`.

---

## 4. Redux Store — Overview

The store has **5 slices**, each owning a distinct domain:

| Slice | Responsibility | Persisted? |
|---|---|---|
| `auth` | Current user identity + auth modal state | ✅ localStorage + cookie |
| `dashboard` | List of all user courses | ❌ fetched fresh each visit |
| `course` | Active course content + navigation index | ❌ fetched fresh each visit |
| `generation` | Active job ID, progress, SSE log stream | ❌ in-memory only |
| `ui` | Toast message, course-create modal open/close | ❌ ephemeral |

**How components read state:**
```js
// Reading from a slice
const { user, isAuthenticated } = useSelector((s) => s.auth)
const { courses, status }       = useSelector((s) => s.dashboard)
const { data, navIdx, flatNav } = useSelector((s) => s.course)

// Dispatching actions / thunks
const dispatch = useDispatch()
dispatch(login({ email, password }))    // async thunk
dispatch(openModal())                   // sync action
dispatch(toast('Hello!'))               // thunk with setTimeout
```

---

## 5. Auth Slice — Deep Dive

**File:** `src/store/authSlice.js`

### State shape
```js
{
  user:            null | { id, name, email, ... },
  token:           null | "eyJ...",          // access_token JWT
  isAuthenticated: false | true,
  status:          'idle' | 'loading',       // for showing spinners
  error:           null | "Error message",   // shown in AuthModal
  authModal:       null | 'login' | 'signup' // controls which modal tab is open
}
```

### Sync actions (reducers)

| Action | What it does |
|---|---|
| `openAuthModal('login')` | Sets `authModal = 'login'`, clears `error` |
| `openAuthModal('signup')` | Sets `authModal = 'signup'`, clears `error` |
| `closeAuthModal()` | Sets `authModal = null` |
| `clearError()` | Sets `error = null` |
| `setAuthFromGoogle({access_token, refresh_token, user})` | Hydrates full auth state from Google OAuth callback params, calls `persistSession()` |
| `sessionExpired()` | Clears `user`, `token`, `isAuthenticated = false` (called by global event listener) |

### Async thunks

#### `login(credentials)`
```
dispatch(login({ email, password }))
  → calls loginUser() → POST /api/auth/login
  → on success: persistSession(data), sets user/token/isAuthenticated
  → on failure: sets error to backend's `detail` message
```

#### `signup(payload)`
```
dispatch(signup({ name, email, password }))
  → calls signupUser() → POST /api/auth/signup
  → same success/failure flow as login
```

#### `logout()`
```
dispatch(logout())
  → calls logoutUser() → POST /api/auth/logout (best-effort)
  → calls clearSession() → removes sg_access, sg_refresh, sg_user
  → sets user/token to null, isAuthenticated to false
```

#### `restoreSession()`
```
dispatch(restoreSession())
  → checks: if no access token AND no refresh cookie → rejectWithValue('no tokens')
  → calls fetchMe() → GET /api/auth/me
    → if 401: attempts refreshAccessToken() → POST /api/auth/refresh
    → if refresh succeeds: retries GET /api/auth/me with new token
    → if refresh fails: clearSession(), throw
  → on success: updates auth.user in Redux + localStorage
  → on failure: clears all tokens, isAuthenticated = false
```

---

## 6. Token Strategy & Storage

**File:** `src/api/auth.js`

### Two-token architecture

```
┌─────────────────────────────────────────────────────────┐
│  access_token  →  localStorage key: 'sg_access'         │
│  • Short-lived JWT                                       │
│  • Sent as: Authorization: Bearer <token>                │
│  • Read by: getAccessToken()                             │
│  • Written by: setAccessToken(t)                         │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  refresh_token →  Cookie key: 'sg_refresh'               │
│  • Long-lived (30 days), SameSite=Lax                    │
│  • Sent as: X-Refresh-Token header + credentials:include │
│  • Read by: getRefreshToken()  (via js-cookie)           │
│  • Written by: setRefreshToken(t)                        │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  user object   →  localStorage key: 'sg_user'           │
│  • JSON stringified user profile                        │
│  • Used to pre-populate UI immediately on page load      │
└─────────────────────────────────────────────────────────┘
```

### `persistSession({ access_token, refresh_token, user })`
Called after every successful login/signup/Google OAuth. Writes all three values to their respective stores.

### `clearSession()`
Called on logout or session expiry. Removes all three values.

### `apiFetch()` — the authenticated fetch wrapper
**File:** `src/api/http.js`

Every API call (except auth endpoints) goes through `apiFetch()`:

```
apiFetch(url, options)
  1. Reads current access token from localStorage
  2. Makes request with Authorization: Bearer <token>
  3. If response is 401:
     a. Calls refreshAccessToken() → POST /api/auth/refresh
        - Sends X-Refresh-Token header with cookie value
        - Stores new access_token in localStorage
        - Stores new refresh_token in cookie (if returned)
     b. Retries original request with new token
  4. If retry also 401 (refresh failed):
     a. clearSession()
     b. window.dispatchEvent(new Event('ce:session-expired'))
        → App.jsx listener catches this, dispatches sessionExpired() + toast
     c. throws Error('Session expired')
  5. Returns response object for caller to .json()
```

---

## 7. API Layer

All files live in `src/api/`. Auth endpoints bypass `apiFetch` (they establish the session rather than requiring one). Everything else goes through `apiFetch`.

### `auth.js` — Direct fetch calls, no auth header needed

| Function | Method | Endpoint | Payload | Returns |
|---|---|---|---|---|
| `loginUser({ email, password })` | POST | `/api/auth/login` | `{email, password}` | `{access_token, refresh_token?, user}` |
| `signupUser({ name, email, password })` | POST | `/api/auth/signup` | `{name, email, password}` | `{access_token, refresh_token?, user}` |
| `refreshAccessToken()` | POST | `/api/auth/refresh` | `X-Refresh-Token` header | `{access_token, refresh_token?}` |
| `logoutUser()` | POST | `/api/auth/logout` | Bearer + X-Refresh-Token | `{}` |
| `fetchMe()` | GET | `/api/auth/me` | Bearer header | `UserObject` |
| `googleLogin()` | — | Redirects browser to `/api/auth/google` | — | OAuth redirect |

### `courses.js` — via `apiFetch`

| Function | Method | Endpoint | Returns |
|---|---|---|---|
| `fetchCourses()` | GET | `/api/courses` | `CourseList[]` |
| `fetchCourse(courseId)` | GET | `/api/course/:courseId` | `CourseDetail` |

### `generate.js` — via `apiFetch`

| Function | Method | Endpoint | Payload | Returns |
|---|---|---|---|---|
| `startGenerationJob(courseInput)` | POST | `/api/generate` | `{course_input: {...}}` | `{job_id: string}` |

### `syllabus.js` — via `apiFetch`

| Function | Method | Endpoint | Payload | Returns |
|---|---|---|---|---|
| `parseSyllabus(text)` | POST | `/api/get_syllabus/` | `{syllabus: string}` | `{course_title, skill_level, modules[]}` |

### SSE stream (not a fetch call)

```js
const evtSrc = new EventSource(`/api/status/${jobId}`)
evtSrc.addEventListener('log',      handler)   // streaming progress messages
evtSrc.addEventListener('complete', handler)   // job finished, has course_id
evtSrc.addEventListener('error',    handler)   // job failed
```
This is opened directly in `beginGeneration()` thunk — EventSource does not go through `apiFetch` since it's a persistent SSE connection (not a one-shot request).

---

## 8. Authentication Flow — Every Scenario

### Scenario A: Email/password login

```
User fills AuthModal → clicks "Sign In"
  ↓
AuthModal.submit()
  → dispatch(login({ email, password }))
    ↓
  authSlice login thunk
    → loginUser() → POST /api/auth/login
      Backend returns { access_token, refresh_token, user }
    → persistSession()
        localStorage['sg_access']  = access_token
        Cookie['sg_refresh']        = refresh_token
        localStorage['sg_user']    = JSON.stringify(user)
    → Redux state: user=UserObj, token=JWT, isAuthenticated=true, authModal=null
      ↓
  AuthModal useEffect detects isAuthenticated=true + authModal=null
    → dispatch(toast('Welcome back! 👋'))
    → navigate('/dashboard')
```

### Scenario B: Sign up

```
Same as Login except:
  → POST /api/auth/signup  (with name field)
  → toast shows 'Account created! 🎉'
```

### Scenario C: Google OAuth

```
User clicks "Continue with Google"
  ↓
googleLogin() → window.location.href = '/api/auth/google'
  ↓  (browser leaves, backend handles OAuth dance)
  ↓  (backend redirects back to frontend)
  ↓
Browser lands on /?token=ABC&user=BASE64_ENCODED_JSON&refresh_token=XYZ
  ↓
Landing.jsx useEffect parses URL query params
  const token   = params.get('token')
  const userB64 = params.get('user')
  const user    = JSON.parse(atob(userB64))
  → dispatch(setAuthFromGoogle({ access_token: token, refresh_token, user }))
    → persistSession() writes all tokens
    → Redux: isAuthenticated=true
  → window.history.replaceState({}, '', '/')   ← cleans ?token= from URL
  → navigate('/dashboard')
```

### Scenario D: Page reload (session restore)

```
User opens browser / refreshes page
  ↓
main.jsx loads → authSlice module evaluates:
  initToken = localStorage['sg_access']     ← may be null or JWT
  initUser  = localStorage['sg_user']       ← pre-populates user immediately
  isAuthenticated = !!(token || refreshCookie)
  ↓
App.jsx mounts → useEffect dispatches restoreSession()
  ↓
restoreSession thunk:
  → If no token AND no refresh cookie → reject immediately (stays on Landing)
  → fetchMe() → GET /api/auth/me
    → 200 OK: update auth.user from server (may have newer data)
    → 401: try refreshAccessToken() → POST /api/auth/refresh
      → Success: new token stored, retry /api/auth/me
      → Failure: clearSession(), isAuthenticated=false, stay on Landing
```

### Scenario E: Token expires mid-session

```
User is on Dashboard, token has silently expired
  ↓
dispatch(loadCourses())
  → fetchCourses() → apiFetch('/api/courses')
    → response is 401
    → apiFetch auto-tries: refreshAccessToken() → POST /api/auth/refresh
      → If refresh cookie still valid:
          new access_token stored → retry GET /api/courses → succeeds
          (user never knows anything happened)
      → If refresh also expired:
          clearSession()
          window.dispatchEvent(new Event('ce:session-expired'))
            ↓
          App.jsx listener:
            dispatch(sessionExpired())   ← clears Redux auth
            dispatch(toast('Session expired — please log in again.'))
          ProtectedRoute sees isAuthenticated=false
            → <Navigate to="/" />
```

### Scenario F: Logout

```
User clicks "Sign out" in Dashboard nav
  ↓
handleLogout()
  → await dispatch(logout())
    → logoutUser()
        POST /api/auth/logout  (with Bearer + X-Refresh-Token headers)
        (best-effort — even if this fails, local session is cleared)
      → clearSession()
          localStorage.removeItem('sg_access')
          Cookies.remove('sg_refresh')
          localStorage.removeItem('sg_user')
    → Redux: user=null, token=null, isAuthenticated=false
  → dispatch(toast('Signed out successfully'))
  → navigate('/')
```

---

## 9. Dashboard Slice

**File:** `src/store/dashboardSlice.js`

### State
```js
{
  courses: [],                      // CourseCard[] from GET /api/courses
  status:  'idle' | 'loading' | 'succeeded' | 'failed',
  error:   null | "string"
}
```

### Only one thunk: `loadCourses()`
```
dispatch(loadCourses())
  → status = 'loading'
  → fetchCourses() → apiFetch('GET /api/courses')
  → on success: courses = payload, status = 'succeeded'
  → on failure: error = message, status = 'failed'
```

**Triggered from:** `Dashboard.jsx` in `useEffect` on mount, and by the "Refresh" button.

### What each course object contains
```js
{
  course_id:       "uuid",
  course_title:    "Machine Learning Fundamentals",
  subject_domain:  "Computer Science",
  skill_level:     3,
  skill_label:     "Intermediate",
  total_modules:   4,
  total_submodules:18,
  total_slides:    90,
  total_videos:    20,
  created_at:      "2025-01-15T10:30:00Z"
}
```

### StatCards component
Reads `dashboard.courses` and derives aggregates client-side:
```js
total courses   = courses.length
total modules   = sum of course.total_modules
total slides    = sum of course.total_slides
total videos    = sum of course.total_videos
```

---

## 10. Course Slice & Navigation Model

**File:** `src/store/courseSlice.js`

### State
```js
{
  data:    null | CourseDetailObject,   // full course from GET /api/course/:id
  flatNav: [],                          // flat array of navigation items
  navIdx:  0,                           // current position in flatNav
  done:    [],                          // ["mi-si", ...] completed submodules
  status:  'idle' | 'loading' | 'succeeded' | 'failed',
  error:   null | "string"
}
```

### The `flatNav` model — how course navigation works

The course data from the backend is hierarchical:
```
Course
  └── Module 0 (Trigonometry)
        ├── Submodule 0 (Angle of Depression)
        │     ├── Slide 0
        │     ├── Slide 1
        │     └── Slide 2
        ├── Submodule 1 (Angle of Elevation)
        │     ├── Slide 0
        │     └── Slide 1
        └── References
```

`buildFlatNav()` converts this tree into a **flat ordered array** so navigation is a simple index increment/decrement:
```js
flatNav = [
  { type: 'slide', mi: 0, si: 0, sl: 0 },   // index 0
  { type: 'slide', mi: 0, si: 0, sl: 1 },   // index 1
  { type: 'slide', mi: 0, si: 0, sl: 2 },   // index 2
  { type: 'slide', mi: 0, si: 1, sl: 0 },   // index 3
  { type: 'slide', mi: 0, si: 1, sl: 1 },   // index 4
  { type: 'refs',  mi: 0 },                  // index 5  ← module refs
  // next module items follow...
]
```

**Navigation actions:**
```js
dispatch(setNavIdx(n))        // jump to any position
dispatch(markDone('0-1'))     // marks submodule mi=0,si=1 as completed
```

When the user clicks Next/Prev, the component calls:
```js
dispatch(markDone(`${mi}-${si}`))   // mark current lesson done
dispatch(setNavIdx(navIdx + 1))     // advance
```

**Progress percentage** (shown in ViewerTopBar):
```js
pct = Math.round((navIdx / flatNav.length) * 100)
```

### What a full course object looks like
```js
{
  course_id:    "uuid",
  course_title: "Trigonometry",
  modules: [
    {
      title: "Introduction to Trig",
      youtube_videos: [
        { title: "...", url: "https://youtube.com/...", snippet: "..." },
      ],
      references: [
        { title: "...", url: "...", snippet: "...", final_score: 0.87 },
      ],
      submodules: [
        {
          title: "Angle of Depression",
          slides: [
            { title: "Introduction: Angle of Depression Concept", content: "## ...\n$...LaTeX...$" },
            { title: "Formula Derivation", content: "..." },
          ]
        }
      ]
    }
  ]
}
```

### `loadCourse(courseId)` thunk
```
dispatch(loadCourse(courseId))
  → resets all state (data=null, flatNav=[], navIdx=0, done=[])
  → status = 'loading'
  → fetchCourse(courseId) → apiFetch('GET /api/course/:courseId')
  → on success:
      data = full course object
      flatNav = buildFlatNav(data.modules)   ← builds navigation array
      status = 'succeeded'
  → on 404: error = 'Course not found'
  → on other error: error = message
```

---

## 11. Generation Slice & SSE Streaming

**File:** `src/store/generationSlice.js`

### State
```js
{
  jobId:             null | "uuid",
  courseTitle:       "",
  subtitle:          "",                            // "Level 3 · 4 modules"
  logs:              [],                            // [{message, type}]
  progress:          0,                             // 0-100
  status:            'idle' | 'running' | 'done' | 'error',
  completedCourseId: null | "uuid"
}
```

### Sync actions (used only by the `beginGeneration` thunk)

| Action | Effect |
|---|---|
| `startGeneration({courseTitle, subtitle})` | Resets all state, sets status='running' |
| `setJobId(jobId)` | Stores the job ID returned from POST /api/generate |
| `addLog({message, type})` | Appends a log line to the terminal display |
| `setProgress(n)` | Updates progress bar (0-100) |
| `generationComplete(courseId)` | Sets status='done', progress=100 |
| `generationError(message)` | Sets status='error', adds error log line |

### `beginGeneration(courseInput)` — the main thunk

This is the most complex thunk in the app. It orchestrates two phases:

**Phase 1: Start the job**
```
dispatch(beginGeneration(courseInput))
  ↓
Estimate total steps for progress tracking:
  totalSubs  = sum of submodule counts across modules
  totalSteps = (totalSubs × 9) + (modules.length × 3) + 5

dispatch(startGeneration({ courseTitle, subtitle }))
  → Redux: status='running', logs=[], progress=0

await startGenerationJob(courseInput)
  → POST /api/generate  body: { course_input: courseInput }
  → Returns: { job_id: "abc-123" }
  
dispatch(setJobId(jobId))
```

**Phase 2: SSE stream**
```
const evtSrc = new EventSource('/api/status/abc-123')

evtSrc.on('log', (e) => {
  msg = JSON.parse(e.data).message
  stepsDone++
  progress = Math.min(95, (stepsDone / totalSteps) * 100)
  dispatch(setProgress(progress))
  
  // Classify log message type by emoji prefix:
  type = msg.includes('✅')                     → 'success'
       | msg.includes('❌')                     → 'error'
       | msg.startsWith('🧠') || '✍' || '📋'  → 'step'
       | otherwise                             → 'info'
  
  dispatch(addLog({ message: msg, type }))
})

evtSrc.on('complete', (e) => {
  evtSrc.close()                          ← stop listening
  const { course_id } = JSON.parse(e.data)
  dispatch(generationComplete(course_id)) ← status='done', progress=100
})

evtSrc.on('error', (e) => {
  evtSrc.close()
  dispatch(generationError(err))          ← status='error'
})
```

**GeneratingView.jsx** subscribes to Redux state and:
- Renders log lines in a `<div>` with auto-scroll
- Shows an animated progress bar
- When `status === 'done'`, waits 1400ms then navigates to `/course/:completedCourseId`

### courseInput payload shape sent to the backend
```js
{
  course_title: "Machine Learning Fundamentals",
  skill_level:  3,
  modules: [
    {
      module_id: "M1",
      title: "Introduction to ML",
      submodules: [
        { submodule_id: "M1.1", title: "What is Machine Learning?" },
        { submodule_id: "M1.2", title: "Types of ML" },
      ]
    },
    // ...
  ]
}
```

---

## 12. UI Slice — Toasts & Modals

**File:** `src/store/uiSlice.js`

### State
```js
{
  toast:     { message: '', visible: false },
  modalOpen: false     // true = CreateCourseModal is open
}
```

### Toast system

The `toast()` function is a **thunk factory** (not a slice action):
```js
dispatch(toast('Hello!'))
  → dispatch(showToast('Hello!'))    ← visible=true
  → setTimeout(2800ms)
    → dispatch(hideToast())          ← visible=false
```

`Toast.jsx` component watches `ui.toast.visible` and animates in/out with CSS transitions.

### CreateCourseModal

```js
dispatch(openModal())    // sets modalOpen=true → CreateCourseModal renders
dispatch(closeModal())   // sets modalOpen=false → CreateCourseModal unmounts
```

The modal is always present in the DOM tree (rendered inside `Dashboard.jsx`) but only `visible` when `modalOpen=true`.

---

## 13. Page-by-Page Walkthrough

### Landing.jsx (`/`)

**What it does:**
1. If `isAuthenticated`, immediately `navigate('/dashboard')` — logged-in users never see the landing page
2. On mount, checks URL for Google OAuth callback params (`?token=...&user=...`)
3. Shows hero, features, stats, CTA sections
4. "Log In" and "Sign Up" buttons dispatch `openAuthModal('login'/'signup')` — this opens `AuthModal` (always rendered in `App.jsx`)

**Google OAuth callback handling:**
```js
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const token   = params.get('token') || params.get('access_token')
  const userB64 = params.get('user')
  if (token && userB64) {
    const user = JSON.parse(atob(userB64))          // base64 decode
    dispatch(setAuthFromGoogle({ access_token: token, ... , user }))
    window.history.replaceState({}, '', '/')         // clean URL
    navigate('/dashboard')
  }
}, [])
```

---

### Dashboard.jsx (`/dashboard`)

**On mount:**
```js
useEffect(() => { dispatch(loadCourses()) }, [dispatch])
```

**Renders:**
- Sticky nav with logo, "New Course" button, user avatar, sign-out
- StatCards (total courses/modules/slides/videos)
- Grid of CourseCard components (or skeleton loaders while `status='loading'`)
- Empty state with CTA if no courses
- Error banner with Retry button if `status='failed'`
- `CreateCourseModal` (always in tree, only visible when `ui.modalOpen=true`)

**Clicking a CourseCard:**
```js
navigate(`/course/${course.course_id}`)
```

**Clicking "+ New Course":**
```js
dispatch(openModal())    // sets ui.modalOpen=true
```

---

### CreateCourseModal (2-step flow)

**Step 1: Paste Syllabus**
```
User pastes raw text into textarea
  → clicks "Parse Syllabus"
    → await parseSyllabus(text)
      → POST /api/get_syllabus/  body: { syllabus: "..." }
      → Returns: { course_title, skill_level, modules: [{title, submodules:[{title}]}] }
    → apiToModules() converts response to internal format with React keys
    → Advances to Step 2 with pre-filled data

  OR user clicks "Build manually →"
    → skips API call, goes straight to Step 2 with blank form
```

**Step 2: Review & Edit**
```
User can:
  - Edit course title and skill level
  - Edit/add/remove module titles
  - Edit/add/remove lesson titles within modules
  - Click "← Re-paste syllabus" to go back

When ready, clicks "🚀 Generate Course":
  → Validates title and at least 1 module with 1 lesson
  → Builds modules array with auto-assigned IDs (M1, M1.1, M1.2...)
  → dispatch(closeModal())
  → dispatch(beginGeneration(courseInput))  ← kicks off generation + SSE
  → navigate('/generating')
```

---

### GeneratingView.jsx (`/generating`)

**Reads from Redux:**
```js
const { courseTitle, subtitle, logs, progress, status, completedCourseId }
  = useSelector((s) => s.generation)
```

**Auto-scroll logs:**
```js
useEffect(() => {
  if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
}, [logs])   // fires every time a new log line arrives
```

**Auto-redirect on completion:**
```js
useEffect(() => {
  if (status === 'done' && completedCourseId) {
    setTimeout(() => navigate(`/course/${completedCourseId}`), 1400)
  }
}, [status, completedCourseId])
```

**Log colors** (by message type):
- `success` → green (#3aaf7a)
- `error` → red (#c0392b)
- `step` → blue (#4a9eda)
- `info` → muted gray (#9fb3c8)

---

### CourseViewer.jsx (`/course/:courseId`)

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  ViewerTopBar (fixed, full width, h=56px, dark)      │
├──────────────┬──────────────────────────────────────┤
│              │  VideoBar (dark strip, if videos)     │
│  CourseSidebar├──────────────────────────────────────┤
│  (fixed,     │                                      │
│   280px,     │  SlideView   or   RefsPanel           │
│   dark)      │  (white bg, full remaining width)     │
│              │                                      │
└──────────────┴──────────────────────────────────────┘
```

**On mount:**
```js
useEffect(() => { dispatch(loadCourse(courseId)) }, [courseId, dispatch])
```

**Which content to show:**
```js
const currentItem = flatNav[navIdx]   // e.g. { type: 'slide', mi:0, si:0, sl:1 }

{currentItem?.type === 'slide' && <SlideView />}
{currentItem?.type === 'refs'  && <RefsPanel />}
```

**Videos shown for current module:**
```js
const currentMod = data.modules[currentItem.mi]
const videos     = currentMod?.youtube_videos || []
// passed to <VideoBar videos={videos} />
```

---

## 14. Component Reference

### `CourseSidebar`
- Fixed position, 280px wide, dark `navy-900` background
- Reads: `course.data`, `course.flatNav`, `course.navIdx`, `course.done`
- Modules are collapsed/expanded via local `useState({ [mi]: bool })`
- Active lesson: `bg-accent/20`, right border accent indicator
- Completed lesson: green circle with ✓
- Clicking a lesson: `dispatch(setNavIdx(flatNavIndex))`
- Clicking References: `dispatch(setNavIdx(refsIndex))`

### `SlideView`
- White background, full width
- `mdToHtml(content)` converts Markdown to HTML with LaTeX protection
- After each render, calls `MathJax.typesetPromise([el])` with 60ms delay
- Breadcrumb: Module → Lesson
- Dot navigation: click any dot to jump to that slide within the lesson
- Prev/Next buttons advance `navIdx` and mark current lesson done

### `VideoBar`
- Dark strip (`bg-gray-900`) above slide content
- Horizontal scroll grid of video cards
- Togglable (defaults to expanded)
- Videos are per-module (updates when navigating to different module)

### `RefsPanel`
- White background, full width
- Shows reference cards with title, URL, snippet, relevance score bar
- Score = `final_score × 100` displayed as percentage + filled bar

### `AuthModal`
- Rendered globally in `App.jsx` (always in DOM)
- Visible only when `auth.authModal !== null`
- Two tabs: 'login' / 'signup' — switch via `dispatch(openAuthModal(...))`
- Shows spinner during `auth.status === 'loading'`
- Shows error banner when `auth.error` is set (backend's `detail` field)
- Google OAuth button → `googleLogin()` → redirects browser

### `Toast`
- Fixed bottom-right
- Reads `ui.toast.visible` and `ui.toast.message`
- CSS transition handles show/hide animation
- Auto-dismisses after 2800ms (set by the `toast()` thunk)

### `StatCards`
- Pure display component, no dispatch
- Reads `dashboard.courses` and derives all numbers client-side

---

## 15. Markdown + LaTeX Rendering

**File:** `src/components/SlideView.jsx`

The core problem: `marked.js` interprets underscores inside LaTeX (e.g. `$d_i$`) as Markdown italic markers, corrupting the math before MathJax ever sees it.

### The 4-step solution

**Step 1 — Protect:** Before calling `marked.parse()`, replace every LaTeX expression with a unique sentinel:
```js
const SENTINEL = '\x00MATH\x00'    // null bytes — safe since they won't appear in content

// $$...$$  (display math) — replaced first, must come before inline
md.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
  saved.push(match)
  return `${SENTINEL}${saved.length-1}${SENTINEL}`
})

// $...$  (inline math)
// \(...\)  and  \[...\]
```

**Step 2 — Parse:** `marked.parse(safe, { breaks: true, gfm: true })` runs on the now-LaTeX-free text.

**Step 3 — Restore:** Replace every sentinel back with its original LaTeX:
```js
html.replace(new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, 'g'), (_, i) => saved[i])
```

**Step 4 — Typeset:** After React injects the HTML into the DOM:
```js
useEffect(() => {
  const t = setTimeout(() => runMathJax(bodyRef.current), 60)
  return () => clearTimeout(t)
}, [navIdx])   // re-runs on every slide change

async function runMathJax(el) {
  if (window.MathJax?.typesetClear) window.MathJax.typesetClear([el])  // clear cache
  await window.MathJax.typesetPromise([el])   // scan DOM, render all $...$ and $$...$$
}
```

### MathJax Configuration (in `index.html`)
```js
window.MathJax = {
  tex: {
    inlineMath:  [['$','$'], ['\\(','\\)']],
    displayMath: [['$$','$$'], ['\\[','\\]']],
    processEscapes: true,
  },
  startup: {
    typeset: false    // CRITICAL: don't auto-run on page load, we call manually
  }
}
```

### CSS for light theme math blocks (in `index.css`)
```css
.slide-body-light mjx-container[display="true"] {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 14px 20px;
  margin: 18px 0;
  display: block !important;
}
```

---

## 16. Vite Proxy Configuration

**File:** `vite.config.js`

Vite's dev server proxies all `/api/*` requests so the frontend never needs to know backend addresses or deal with CORS:

```js
proxy: {
  '/api/auth':         { target: 'http://localhost:8001' },  // Auth server
  '/api/courses':      { target: 'http://localhost:8000' },  // Course API
  '/api/course':       { target: 'http://localhost:8000' },
  '/api/generate':     { target: 'http://localhost:8000' },
  '/api/status':       { target: 'http://localhost:8000' },  // SSE stream
  '/api/get_syllabus': { target: 'http://localhost:8000' },
}
```

The `EventSource('/api/status/:jobId')` for SSE also goes through this proxy — Vite handles long-lived SSE connections correctly.

---

## 17. Full Redux State Shape

```js
{
  auth: {
    user:            null | { id, name, email, ... },
    token:           null | "eyJhbGci...",
    isAuthenticated: false,
    status:          'idle',      // 'idle' | 'loading'
    error:           null,        // string shown in AuthModal
    authModal:       null,        // null | 'login' | 'signup'
  },

  dashboard: {
    courses: [
      {
        course_id, course_title, subject_domain,
        skill_level, skill_label,
        total_modules, total_submodules, total_slides, total_videos,
        created_at
      }
    ],
    status:  'idle',    // 'idle' | 'loading' | 'succeeded' | 'failed'
    error:   null,
  },

  course: {
    data: null | {
      course_id, course_title,
      modules: [{
        title,
        youtube_videos: [{ title, url, snippet }],
        references:     [{ title, url, snippet, final_score }],
        submodules:     [{
          title,
          slides: [{ title, content }]
        }]
      }]
    },
    flatNav: [
      { type: 'slide', mi: 0, si: 0, sl: 0 },
      { type: 'refs',  mi: 0 },
      // ...
    ],
    navIdx:  0,
    done:    [],        // ["mi-si", ...] e.g. ["0-0", "0-1"]
    status:  'idle',
    error:   null,
  },

  generation: {
    jobId:             null,
    courseTitle:       "",
    subtitle:          "",
    logs:              [],   // [{ message: "...", type: "step|success|error|info" }]
    progress:          0,    // 0-100
    status:            'idle',  // 'idle' | 'running' | 'done' | 'error'
    completedCourseId: null,
  },

  ui: {
    toast:     { message: '', visible: false },
    modalOpen: false,
  }
}
```

---

## 18. All API Endpoints Called

| Method | Endpoint | Who calls it | Auth required |
|---|---|---|---|
| POST | `/api/auth/login` | `loginUser()` | ❌ |
| POST | `/api/auth/signup` | `signupUser()` | ❌ |
| GET | `/api/auth/google` | `googleLogin()` (redirect) | ❌ |
| POST | `/api/auth/refresh` | `refreshAccessToken()` | Refresh cookie |
| GET | `/api/auth/me` | `fetchMe()` | ✅ Bearer |
| POST | `/api/auth/logout` | `logoutUser()` | ✅ Bearer + Refresh |
| GET | `/api/courses` | `fetchCourses()` | ✅ Bearer |
| GET | `/api/course/:id` | `fetchCourse(id)` | ✅ Bearer |
| POST | `/api/generate` | `startGenerationJob()` | ✅ Bearer |
| GET | `/api/status/:jobId` | `new EventSource(...)` | ❌ (jobId is the auth) |
| POST | `/api/get_syllabus/` | `parseSyllabus()` | ✅ Bearer |

---

## 19. Data Flow Diagrams

### Login Flow
```
[AuthModal]
    |
    | dispatch(login({email, password}))
    ↓
[authSlice thunk: login]
    |
    | loginUser() → POST /api/auth/login
    ↓
[Backend response: {access_token, refresh_token, user}]
    |
    | persistSession()
    ├─→ localStorage['sg_access'] = access_token
    ├─→ Cookie['sg_refresh']       = refresh_token
    └─→ localStorage['sg_user']   = user (JSON)
    |
    | Redux update:
    ├─→ auth.user = user
    ├─→ auth.token = access_token
    ├─→ auth.isAuthenticated = true
    └─→ auth.authModal = null
    |
    ↓
[AuthModal useEffect]
    |
    | navigate('/dashboard')
    ↓
[Dashboard renders, dispatches loadCourses()]
```

### Course Generation Flow
```
[CreateCourseModal Step 1]
    |
    | parseSyllabus(text) → POST /api/get_syllabus/
    ↓
[API returns {course_title, modules[]}]
    |
    | pre-fills Step 2 form
    ↓
[CreateCourseModal Step 2 — user edits, clicks Generate]
    |
    | dispatch(beginGeneration(courseInput))
    ├─→ dispatch(startGeneration())  — Redux: status='running'
    ├─→ startGenerationJob()  → POST /api/generate
    │       returns { job_id }
    │
    ├─→ new EventSource('/api/status/' + job_id)
    │     |
    │     | 'log' events → dispatch(addLog()) + dispatch(setProgress())
    │     |                GeneratingView re-renders log lines + progress bar
    │     |
    │     | 'complete' event → dispatch(generationComplete(course_id))
    │     |                    → navigate('/course/' + course_id)
    │     |
    │     | 'error' event → dispatch(generationError(msg))
    │                       → shows error banner
    │
    ↓
[GeneratingView]
    |
    | watches generation.status, generation.logs, generation.progress
    | auto-scrolls log terminal
    | shows animated progress bar
    |
    | when status='done': setTimeout(1400ms) → navigate('/course/:id')
```

### Course Viewer Navigation
```
[CourseViewer mounts]
    |
    | dispatch(loadCourse(courseId))
    | → GET /api/course/:courseId
    | → buildFlatNav(modules) → creates flat navigation array
    ↓
[CourseSidebar + SlideView render]
    |
    | User clicks "Next →" in SlideView:
    |   dispatch(markDone('0-0'))       ← marks current lesson done
    |   dispatch(setNavIdx(navIdx+1))   ← advances to next item
    |
    | course.navIdx changes
    | → SlideView re-renders with new slide content
    | → useEffect fires → MathJax.typesetPromise([el]) after 60ms
    | → CourseSidebar highlights new active lesson
    | → ViewerTopBar updates progress %
```

---

*Generated from source code of StudyGuru AI v0.2.0*
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import {
  fetchStudentCourses,
  fetchCourseStructure,
  fetchMyCustomCourses,
  fetchMyCustomCourse,
  startCustomization,
  fetchStudentCourse,
} from '../api/student'

// ── Thunks ──────────────────────────────────────────────────────────────────

export const loadStudentCourses = createAsyncThunk(
  'student/loadCourses',
  async () => fetchStudentCourses()
)

export const loadCourseStructure = createAsyncThunk(
  'student/loadStructure',
  async (courseId) => {
    const data = await fetchCourseStructure(courseId)
    return data
  }
)

export const loadMyCustomCourses = createAsyncThunk(
  'student/loadMyCustomCourses',
  async (userId) => fetchMyCustomCourses(userId)
)

export const loadCustomCourseData = createAsyncThunk(
  'student/loadCustomCourseData',
  async ({ customCourseId, userId }) => fetchMyCustomCourse(customCourseId, userId)
)

export const loadBaseCourseForViewing = createAsyncThunk(
  'student/loadBaseCourseForViewing',
  async (courseId) => fetchStudentCourse(courseId)
)

// ── Slice ───────────────────────────────────────────────────────────────────

const studentSlice = createSlice({
  name: 'student',
  initialState: {
    // Browse courses
    courses: [],
    coursesStatus: 'idle',

    // Course structure for module selection
    structure: null,
    structureStatus: 'idle',

    // Selected modules (checkboxes)
    selectedModules: {},  // { "M1": { checked: true, submodules: { "M1.1": true, "M1.2": false } } }

    // Customization preferences
    customPrefs: {
      courseMode: 'custom',  // 'base' or 'custom'
      tone: 'friendly',
      easinessLevel: 3,
      useAnalogies: 'no',
      analogyStyle: 'everyday',
    },

    // Customization job
    customJobId: null,
    customLogs: [],
    customProgress: 0,
    customStatus: 'idle',  // idle | running | done | error
    customResult: null,

    // My custom courses
    myCourses: [],
    myCoursesStatus: 'idle',

    // Viewing a custom course
    viewingCourse: null,
    viewingStatus: 'idle',

    // Current step in student flow
    step: 'browse', // browse | select | customize | generating | view
  },
  reducers: {
    setStep(state, action) {
      state.step = action.payload
    },
    setSelectedModules(state, action) {
      state.selectedModules = action.payload
    },
    toggleModule(state, action) {
      const { moduleId, checked } = action.payload
      if (!state.selectedModules[moduleId]) {
        state.selectedModules[moduleId] = { checked: false, submodules: {} }
      }
      state.selectedModules[moduleId].checked = checked
      // Toggle all submodules too
      if (state.structure) {
        const mod = state.structure.modules.find((m) => m.module_id === moduleId)
        if (mod) {
          for (const sub of mod.submodules) {
            state.selectedModules[moduleId].submodules[sub.submodule_id] = checked
          }
        }
      }
    },
    toggleSubmodule(state, action) {
      const { moduleId, submoduleId, checked } = action.payload
      if (!state.selectedModules[moduleId]) {
        state.selectedModules[moduleId] = { checked: false, submodules: {} }
      }
      state.selectedModules[moduleId].submodules[submoduleId] = checked
      // Auto-check module if any sub is checked
      const anyChecked = Object.values(state.selectedModules[moduleId].submodules).some(Boolean)
      state.selectedModules[moduleId].checked = anyChecked
    },
    setCustomPref(state, action) {
      const { key, value } = action.payload
      state.customPrefs[key] = value
    },
    resetCustomFlow(state) {
      state.structure = null
      state.structureStatus = 'idle'
      state.selectedModules = {}
      state.customPrefs = {
        courseMode: 'custom',
        tone: 'friendly',
        easinessLevel: 3,
        useAnalogies: 'no',
        analogyStyle: 'everyday',
      }
      state.customJobId = null
      state.customLogs = []
      state.customProgress = 0
      state.customStatus = 'idle'
      state.customResult = null
      state.step = 'browse'
    },

    // SSE log reducers
    startCustomJob(state, action) {
      state.customJobId = action.payload
      state.customLogs = []
      state.customProgress = 0
      state.customStatus = 'running'
      state.customResult = null
      state.step = 'generating'
    },
    addCustomLog(state, action) {
      state.customLogs.push(action.payload)
    },
    setCustomProgress(state, action) {
      state.customProgress = action.payload
    },
    customJobComplete(state, action) {
      state.customStatus = 'done'
      state.customProgress = 100
      state.customResult = action.payload
    },
    customJobError(state, action) {
      state.customStatus = 'error'
      state.customLogs.push({ message: `❌ Error: ${action.payload}`, type: 'error' })
    },

    // For viewing course data
    setViewingCourse(state, action) {
      state.viewingCourse = action.payload
      state.viewingStatus = 'succeeded'
    },
    clearViewingCourse(state) {
      state.viewingCourse = null
      state.viewingStatus = 'idle'
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadStudentCourses.pending, (s) => { s.coursesStatus = 'loading' })
      .addCase(loadStudentCourses.fulfilled, (s, a) => { s.coursesStatus = 'succeeded'; s.courses = a.payload })
      .addCase(loadStudentCourses.rejected, (s) => { s.coursesStatus = 'failed' })

    builder
      .addCase(loadCourseStructure.pending, (s) => { s.structureStatus = 'loading' })
      .addCase(loadCourseStructure.fulfilled, (s, a) => {
        s.structureStatus = 'succeeded'
        s.structure = a.payload
        s.selectedModules = {}
        s.step = 'select'
      })
      .addCase(loadCourseStructure.rejected, (s) => { s.structureStatus = 'failed' })

    builder
      .addCase(loadMyCustomCourses.pending, (s) => { s.myCoursesStatus = 'loading' })
      .addCase(loadMyCustomCourses.fulfilled, (s, a) => { s.myCoursesStatus = 'succeeded'; s.myCourses = a.payload })
      .addCase(loadMyCustomCourses.rejected, (s) => { s.myCoursesStatus = 'failed' })

    builder
      .addCase(loadCustomCourseData.pending, (s) => { s.viewingStatus = 'loading' })
      .addCase(loadCustomCourseData.fulfilled, (s, a) => { s.viewingStatus = 'succeeded'; s.viewingCourse = a.payload })
      .addCase(loadCustomCourseData.rejected, (s) => { s.viewingStatus = 'failed' })

    builder
      .addCase(loadBaseCourseForViewing.pending, (s) => { s.viewingStatus = 'loading' })
      .addCase(loadBaseCourseForViewing.fulfilled, (s, a) => { s.viewingStatus = 'succeeded'; s.viewingCourse = a.payload })
      .addCase(loadBaseCourseForViewing.rejected, (s) => { s.viewingStatus = 'failed' })
  },
})

export const {
  setStep,
  setSelectedModules,
  toggleModule,
  toggleSubmodule,
  setCustomPref,
  resetCustomFlow,
  startCustomJob,
  addCustomLog,
  setCustomProgress,
  customJobComplete,
  customJobError,
  setViewingCourse,
  clearViewingCourse,
} = studentSlice.actions

export default studentSlice.reducer


// ── Thunk: begin customization + SSE ────────────────────────────────────────

export function beginCustomization({ baseCourseId, userId, selectedModules, prefs }) {
  return async (dispatch) => {
    // Build selected_modules array
    const selMods = []
    for (const [moduleId, modData] of Object.entries(selectedModules)) {
      const subIds = Object.entries(modData.submodules || {})
        .filter(([_, checked]) => checked)
        .map(([id]) => id)
      if (subIds.length > 0) {
        selMods.push({ module_id: moduleId, submodule_ids: subIds })
      }
    }

    if (selMods.length === 0) return

    const params = {
      base_course_id: baseCourseId,
      user_id: userId,
      selected_modules: selMods,
      course_mode: prefs.courseMode,
      tone: prefs.tone,
      easiness_level: prefs.easinessLevel,
      use_analogies: prefs.useAnalogies,
      analogy_style: prefs.analogyStyle,
    }

    let jobId
    try {
      const data = await startCustomization(params)
      jobId = data.job_id
      dispatch(startCustomJob(jobId))
    } catch (e) {
      dispatch(customJobError(e.message))
      return
    }

    const totalSubs = selMods.reduce((a, m) => a + m.submodule_ids.length, 0)
    const totalSteps = totalSubs + 5
    let stepsDone = 0

    const evtSrc = new EventSource(`/api/student/customize/status/${jobId}`)

    evtSrc.addEventListener('log', (e) => {
      const msg = JSON.parse(e.data).message
      stepsDone++
      const progress = Math.min(95, (stepsDone / totalSteps) * 100)
      dispatch(setCustomProgress(progress))
      const type = msg.includes('✅') ? 'success'
        : msg.includes('❌') || msg.includes('⚠') ? 'error'
        : msg.includes('✍') || msg.includes('✨') ? 'step'
        : 'info'
      dispatch(addCustomLog({ message: msg, type }))
    })

    evtSrc.addEventListener('complete', (e) => {
      evtSrc.close()
      const result = JSON.parse(e.data)
      dispatch(customJobComplete(result))
    })

    evtSrc.addEventListener('error', (e) => {
      evtSrc.close()
      try {
        const err = JSON.parse(e.data).error
        dispatch(customJobError(err))
      } catch {
        dispatch(customJobError('Connection lost'))
      }
    })
  }
}

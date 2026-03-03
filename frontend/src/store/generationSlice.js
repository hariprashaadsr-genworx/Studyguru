import { createSlice } from '@reduxjs/toolkit'
import { startGenerationJob } from '../api/generate'

const generationSlice = createSlice({
  name: 'generation',
  initialState: {
    jobId: null,
    courseTitle: '',
    subtitle: '',
    logs: [],
    progress: 0,
    status: 'idle', // idle | running | done | error
    completedCourseId: null,
  },
  reducers: {
    startGeneration(state, action) {
      state.courseTitle = action.payload.courseTitle
      state.subtitle = action.payload.subtitle
      state.logs = []
      state.progress = 0
      state.status = 'running'
      state.jobId = null
      state.completedCourseId = null
    },
    setJobId(state, action) {
      state.jobId = action.payload
    },
    addLog(state, action) {
      state.logs.push(action.payload)
    },
    setProgress(state, action) {
      state.progress = action.payload
    },
    generationComplete(state, action) {
      state.status = 'done'
      state.progress = 100
      state.completedCourseId = action.payload
    },
    generationError(state, action) {
      state.status = 'error'
      state.logs.push({ message: `❌ Error: ${action.payload}`, type: 'error' })
    },
  },
})

export const {
  startGeneration,
  setJobId,
  addLog,
  setProgress,
  generationComplete,
  generationError,
} = generationSlice.actions

export default generationSlice.reducer

// Thunk to kick off generation + SSE
export function beginGeneration(courseInput) {
  return async (dispatch) => {
    const totalSubs = courseInput.modules.reduce((a, m) => a + m.submodules.length, 0)
    const totalSteps = totalSubs * 9 + courseInput.modules.length * 3 + 5
    let stepsDone = 0

    dispatch(
      startGeneration({
        courseTitle: courseInput.course_title,
        subtitle: `Level ${courseInput.skill_level} · ${courseInput.modules.length} modules`,
      })
    )

    let jobId
    try {
      const data = await startGenerationJob(courseInput)
      jobId = data.job_id
      dispatch(setJobId(jobId))
    } catch (e) {
      dispatch(generationError(e.message))
      return
    }

    const evtSrc = new EventSource(`/api/status/${jobId}`)

    evtSrc.addEventListener('log', (e) => {
      const msg = JSON.parse(e.data).message
      stepsDone++
      const progress = Math.min(95, (stepsDone / totalSteps) * 100)
      dispatch(setProgress(progress))
      const type = msg.includes('✅')
        ? 'success'
        : msg.includes('❌')
        ? 'error'
        : msg.startsWith('🧠') || msg.startsWith('✍') || msg.startsWith('📋')
        ? 'step'
        : 'info'
      dispatch(addLog({ message: msg, type }))
    })

    evtSrc.addEventListener('complete', (e) => {
      evtSrc.close()
      const { course_id } = JSON.parse(e.data)
      dispatch(generationComplete(course_id))
    })

    evtSrc.addEventListener('error', (e) => {
      evtSrc.close()
      try {
        const err = JSON.parse(e.data).error
        dispatch(generationError(err))
      } catch {
        dispatch(generationError('Connection lost'))
      }
    })
  }
}

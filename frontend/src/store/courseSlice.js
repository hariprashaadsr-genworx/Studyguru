import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { fetchCourse } from '../api/courses'

export const loadCourse = createAsyncThunk('course/loadCourse', async (courseId) => {
  return await fetchCourse(courseId)
})

function buildFlatNav(modules = []) {
  const flatNav = []
  for (let mi = 0; mi < modules.length; mi++) {
    const mod = modules[mi]
    for (let si = 0; si < mod.submodules.length; si++) {
      const sub = mod.submodules[si]
      const slides = sub.slides || []
      for (let sl = 0; sl < slides.length; sl++) {
        flatNav.push({ type: 'slide', mi, si, sl })
      }
    }
    if ((mod.references || []).length) {
      flatNav.push({ type: 'refs', mi })
    }
  }
  return flatNav
}

const courseSlice = createSlice({
  name: 'course',
  initialState: {
    data: null,
    flatNav: [],
    navIdx: 0,
    done: [],
    status: 'idle',
    error: null,
  },
  reducers: {
    setNavIdx(state, action) {
      state.navIdx = action.payload
    },
    markDone(state, action) {
      const key = action.payload
      if (!state.done.includes(key)) state.done.push(key)
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadCourse.pending, (state) => {
        state.status = 'loading'
        state.error = null
        state.data = null
        state.flatNav = []
        state.navIdx = 0
        state.done = []
      })
      .addCase(loadCourse.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.data = action.payload
        state.flatNav = buildFlatNav(action.payload.modules)
      })
      .addCase(loadCourse.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.error.message
      })
  },
})

export const { setNavIdx, markDone } = courseSlice.actions
export default courseSlice.reducer

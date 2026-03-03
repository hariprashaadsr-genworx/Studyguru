import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { fetchCourses } from '../api/courses'

export const loadCourses = createAsyncThunk('dashboard/loadCourses', async () => {
  return await fetchCourses()
})

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState: {
    courses: [],
    status: 'idle', // idle | loading | succeeded | failed
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadCourses.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(loadCourses.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.courses = action.payload
      })
      .addCase(loadCourses.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.error.message
      })
  },
})

export default dashboardSlice.reducer

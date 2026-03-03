import { configureStore } from '@reduxjs/toolkit'
import dashboardReducer from './dashboardSlice'
import courseReducer from './courseSlice'
import generationReducer from './generationSlice'
import uiReducer from './uiSlice'
import authReducer from './authSlice'

export const store = configureStore({
  reducer: {
    dashboard: dashboardReducer,
    course: courseReducer,
    generation: generationReducer,
    ui: uiReducer,
    auth: authReducer,
  },
})

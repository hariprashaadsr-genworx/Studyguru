import { createSlice } from '@reduxjs/toolkit'

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    toast: { message: '', visible: false },
    modalOpen: false,
  },
  reducers: {
    showToast(state, action) {
      state.toast = { message: action.payload, visible: true }
    },
    hideToast(state) {
      state.toast.visible = false
    },
    openModal(state) {
      state.modalOpen = true
    },
    closeModal(state) {
      state.modalOpen = false
    },
  },
})

export const { showToast, hideToast, openModal, closeModal } = uiSlice.actions
export default uiSlice.reducer

// Thunk with auto-dismiss
export function toast(message, duration = 2800) {
  return (dispatch) => {
    dispatch(showToast(message))
    setTimeout(() => dispatch(hideToast()), duration)
  }
}

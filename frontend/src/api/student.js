/**
 * Student API — endpoints for the student workflow
 */
import { apiFetch } from './http'

/** List all available base courses */
export async function fetchStudentCourses() {
  const res = await apiFetch('/api/student/courses')
  if (!res.ok) throw new Error(`Failed to load courses (${res.status})`)
  return res.json()
}

/** Get a single base course */
export async function fetchStudentCourse(courseId) {
  const res = await apiFetch(`/api/student/course/${courseId}`)
  if (res.status === 404) throw new Error('Course not found')
  if (!res.ok) throw new Error(`Failed to load course (${res.status})`)
  return res.json()
}

/** Get module/submodule tree for checkbox selection */
export async function fetchCourseStructure(courseId) {
  const res = await apiFetch(`/api/student/course/${courseId}/structure`)
  if (!res.ok) throw new Error(`Failed to load structure (${res.status})`)
  return res.json()
}

/** Start a customization job */
export async function startCustomization(params) {
  const res = await apiFetch('/api/student/customize', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || `Customization failed (${res.status})`)
  return data
}

/** Get custom courses for a user */
export async function fetchMyCustomCourses(userId) {
  const res = await apiFetch(`/api/student/my-courses/${userId}`)
  if (!res.ok) throw new Error(`Failed to load custom courses (${res.status})`)
  return res.json()
}

/** Get a single custom course */
export async function fetchMyCustomCourse(customCourseId, userId) {
  const res = await apiFetch(`/api/student/my-course/${customCourseId}/${userId}`)
  if (res.status === 404) throw new Error('Custom course not found')
  if (!res.ok) throw new Error(`Failed to load custom course (${res.status})`)
  return res.json()
}

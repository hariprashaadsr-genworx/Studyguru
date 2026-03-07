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


// ══════════════════════════════════════════════════════════════════════════════
// Enrollment API
// ══════════════════════════════════════════════════════════════════════════════

/** Enroll student in a course with selected modules */
export async function enrollInCourse(userId, courseId, selectedModules) {
  const res = await apiFetch('/api/student/enroll', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      course_id: courseId,
      selected_modules: selectedModules,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || `Enrollment failed (${res.status})`)
  return data
}

/** List all enrollments for a user */
export async function fetchEnrollments(userId) {
  const res = await apiFetch(`/api/student/enrollments/${userId}`)
  if (!res.ok) throw new Error(`Failed to load enrollments (${res.status})`)
  return res.json()
}

/** Get enrollment with course data and progress */
export async function fetchEnrollment(enrollmentId) {
  const res = await apiFetch(`/api/student/enrollment/${enrollmentId}`)
  if (res.status === 404) throw new Error('Enrollment not found')
  if (!res.ok) throw new Error(`Failed to load enrollment (${res.status})`)
  return res.json()
}

/** Mark a submodule as visited */
export async function markSubmoduleVisited(enrollmentId, submoduleKey) {
  const res = await apiFetch(`/api/student/enrollment/${enrollmentId}/visit`, {
    method: 'PATCH',
    body: JSON.stringify({ submodule_key: submoduleKey }),
  })
  const data = await res.json().catch(() => ({}))
  return data
}

/** Get or generate module quiz questions */
export async function fetchModuleQuestions(enrollmentId, moduleId) {
  const res = await apiFetch(`/api/student/enrollment/${enrollmentId}/questions/${moduleId}`)
  if (!res.ok) throw new Error(`Failed to load questions (${res.status})`)
  return res.json()
}

/** Get or generate final assessment questions */
export async function fetchFinalQuestions(enrollmentId) {
  const res = await apiFetch(`/api/student/enrollment/${enrollmentId}/final-questions`)
  if (!res.ok) throw new Error(`Failed to load final questions (${res.status})`)
  return res.json()
}

/** Submit module test results */
export async function submitModuleTest(enrollmentId, moduleId, score, total, answers = {}) {
  const res = await apiFetch(`/api/student/enrollment/${enrollmentId}/submit-module-test`, {
    method: 'POST',
    body: JSON.stringify({ module_id: moduleId, score, total, answers }),
  })
  const data = await res.json().catch(() => ({}))
  return data
}

/** Submit final test results */
export async function submitFinalTest(enrollmentId, score, total, answers = {}) {
  const res = await apiFetch(`/api/student/enrollment/${enrollmentId}/submit-final-test`, {
    method: 'POST',
    body: JSON.stringify({ score, total, answers }),
  })
  const data = await res.json().catch(() => ({}))
  return data
}

/** Mark enrollment as completed */
export async function completeCourse(enrollmentId) {
  const res = await apiFetch(`/api/student/enrollment/${enrollmentId}/complete`, {
    method: 'POST',
  })
  const data = await res.json().catch(() => ({}))
  return data
}

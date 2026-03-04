import { apiFetch } from './http'

export async function fetchCourses() {
  const res = await apiFetch('/api/courses')
  if (!res.ok) throw new Error(`Failed to load courses (${res.status})`)
  return res.json()
}

export async function fetchCourse(courseId) {
  const res = await apiFetch(`/api/course/${courseId}`)
  if (res.status === 404) throw new Error('Course not found')
  if (!res.ok) throw new Error(`Failed to load course (${res.status})`)
  return res.json()
}

import { apiFetch } from './http'

export async function startGenerationJob(courseInput) {
  const res = await apiFetch('/api/generate', {
    method: 'POST',
    body: JSON.stringify({ course_input: courseInput }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.message || `Generation failed (${res.status})`)
  return data
}

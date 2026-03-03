import { apiFetch } from './http'

export async function parseSyllabus(syllabusText) {
  const res = await apiFetch('/api/get_syllabus', {
    method: 'POST',
    body: JSON.stringify({ syllabus: syllabusText }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.message || `Failed to parse syllabus (${res.status})`)
  return data
}

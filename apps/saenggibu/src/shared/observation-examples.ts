import { statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseObservation, type ObservationExample } from './observation-turn'

export function loadObservationExamples(userData: string): ObservationExample[] {
  const file = join(userData, 'school-record-observation-examples.json')
  try {
    if (statSync(file).size > 2_000_000) return []
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(raw)) return []
    return raw.slice(0, 1500).flatMap((row) => {
      const observation = parseObservation({ category: row?.category, note: row?.memo })
      return observation && typeof row?.answer === 'string' && row.answer.length <= 750
        ? [{ category: observation.category, memo: observation.note, answer: row.answer }]
        : []
    })
  } catch {
    return []
  }
}

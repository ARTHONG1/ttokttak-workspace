/**
 * 나이스에서 가져오기 → the student list: the class read from NEIS (shared/neis-class.ts) put
 * into the list the teacher already has, in the NEIS order (the order [나이스로 보내기] fills).
 * A student already listed is matched by name and keeps what was written for them; one NEIS
 * does not list stays at the end, never dropped. Their 누가기록 can go into the observation
 * notes: as they are into empty notes, after notes already written, and a record already in
 * the notes (taken before, or written by hand) not again. The dialog shows the outcome before
 * anything is put in: a list longer than one list holds is not put in at all, since the rest
 * would be dropped unsaid when the work is saved.
 */
import { recordsToNotes, type NeisClassStudent } from '../../../shared/neis-class'
import { MAX_STUDENTS, hasContent, type Student, type StudentFields } from './record-core'

/**
 * notes this long leave little room in the built-in AI's input (main/ai-turn.ts: about 1,500
 * characters with the task and the 성취기준), so the teacher is told before writing
 */
export const LONG_NOTES = 1200

export interface NeisApplied {
  students: Student[]
  /** NEIS students already in the list */
  matched: number
  /** NEIS students new to the list */
  added: number
  /** listed students NEIS does not have, kept at the end */
  kept: number
  /** the names of those kept students */
  keptNames: string[]
  /** students whose notes got their 누가기록 */
  notesFilled: number
  /** of them, those whose notes are now longer than LONG_NOTES */
  longNotes: number
  /** names NEIS lists more than once that the list already has: matched in the list's order */
  sameNames: string[]
  /** more students than one list holds (MAX_STUDENTS): not to be put in */
  tooMany: boolean
}

const key = (name: string): string => name.replace(/\s+/g, '')
const flat = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** the notes with each record not yet in them added, one a line */
function withRecords(notes: string, records: string): string {
  const had = flat(notes)
  const fresh = records.split('\n').filter((line) => line && !had.includes(flat(line)))
  if (!fresh.length) return notes
  const before = notes.trim()
  return before ? before + '\n' + fresh.join('\n') : fresh.join('\n')
}

export function applyNeisClass(
  current: readonly Student[],
  neis: readonly NeisClassStudent[],
  options: { withRecords: boolean },
  make: (fields?: Partial<StudentFields>) => Student,
): NeisApplied {
  const left = current.filter(hasContent)
  const used = new Set<Student>()
  let matched = 0
  let added = 0
  let notesFilled = 0
  let longNotes = 0
  const counts = new Map<string, number>()
  for (const n of neis) counts.set(key(n.name), (counts.get(key(n.name)) ?? 0) + 1)
  const sameNames = new Set<string>()
  const students = neis.map((n) => {
    const had = left.find((s) => !used.has(s) && key(s.name) === key(n.name))
    let student: Student
    if (had) {
      used.add(had)
      matched++
      if ((counts.get(key(n.name)) ?? 0) > 1) sameNames.add(n.name)
      student = { ...had, name: n.name }
    } else {
      added++
      student = make({ name: n.name })
    }
    if (options.withRecords) {
      const notes = withRecords(student.notes, recordsToNotes(n.records))
      if (notes !== student.notes) {
        student = { ...student, notes }
        notesFilled++
        if (notes.length > LONG_NOTES) longNotes++
      }
    }
    return student
  })
  const rest = left.filter((s) => !used.has(s))
  return {
    students: [...students, ...rest],
    matched,
    added,
    kept: rest.length,
    keptNames: rest.map((s) => s.name.trim()).filter(Boolean),
    notesFilled,
    longNotes,
    sameNames: [...sameNames],
    tooMany: students.length + rest.length > MAX_STUDENTS,
  }
}

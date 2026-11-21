/**
 * 나이스에서 가져오기: the class list and its 누가기록 read from an open NEIS screen in the app's
 * own browser window (main/neis-driver.ts). NEIS's 4th generation runs on the eXBuilder6
 * runtime: each open screen is an app instance, and its grids are bound to data controls that
 * hold every row, drawn or not. The class list is the data with a student's number and name
 * (stuInvlNo, stuFlnm, and clsNo for the class); a 누가기록 is a row with its date and text
 * (ghvrDevEnfcYmd, ghvrDevCn). Those ids are the ones of the 누가기록 screen (학급담임 →
 * 행동특성및종합의견 → 누가기록); other screens and offices are to be confirmed in a real NEIS.
 * Nothing is clicked, typed or saved there. When the open screens hold the lists of different
 * classes, or one list mixes classes, nothing is guessed: the teacher is told which screen to
 * keep.
 */

export interface NeisStudent {
  /** 반 (may be empty) */
  cls: string
  /** 번호 */
  no: string
  name: string
}

export interface NeisRecord {
  /** the student's 번호 */
  no: string
  /** YYYYMMDD as NEIS keeps it (may be empty) */
  date: string
  text: string
}

/** whose 누가기록 the screen held: the whole class's, the selected student's, or none */
export type RecordsFor = 'all' | 'selected' | 'none'

export type PageClass =
  | {
      ok: true
      students: NeisStudent[]
      records: NeisRecord[]
      recordsFor: RecordsFor
      /** records on the screen that could not be given to a student */
      unplaced: number
    }
  | { ok: false; kind: 'no-platform' | 'no-class' | 'many-lists' | 'many-classes' }

/**
 * Serialized into the NEIS page (frame.evaluate): keep it free of anything outside itself.
 * It only reads the screens' data.
 */
export function readClassInPage(): PageClass {
  interface Data {
    getRowCount(): number
    getValue(row: number, column: string): unknown
    getColumnNames?(): string[]
  }
  interface Control {
    dataSet?: unknown
    getSelectedRowIndex?(): number
  }
  interface App {
    lookup?(id: string): unknown
    getContainer?(): { getAllRecursiveChildren?(): unknown[] } | null
    getAllDataControls?(): unknown[]
  }
  const runtime = (
    window as unknown as {
      cpr?: { core?: { Platform?: { INSTANCE?: { getAllRunningAppInstances?(): App[] } } } }
    }
  ).cpr?.core?.Platform?.INSTANCE
  if (!runtime || typeof runtime.getAllRunningAppInstances !== 'function')
    return { ok: false, kind: 'no-platform' }

  const isData = (x: unknown): x is Data =>
    !!x &&
    typeof (x as Data).getRowCount === 'function' &&
    typeof (x as Data).getValue === 'function'
  const found: Data[] = []
  // the data the screens call dsStu (the 누가기록 screen's class list) is the list to read
  const named: Data[] = []
  const grids: { control: Control; data: Data }[] = []
  const add = (x: unknown): void => {
    if (isData(x) && !found.includes(x)) found.push(x)
  }
  let apps: App[]
  try {
    apps = runtime.getAllRunningAppInstances() ?? []
  } catch {
    apps = []
  }
  for (const app of apps) {
    try {
      for (const d of app.getAllDataControls?.() ?? []) add(d)
    } catch {
      // an app without the call: its grids and ids below
    }
    for (const id of ['dsStu', 'dsGicRecStu']) {
      try {
        const d = app.lookup?.(id)
        add(d)
        if (id === 'dsStu' && isData(d) && !named.includes(d)) named.push(d)
      } catch {
        // not on this screen
      }
    }
    try {
      for (const c of app.getContainer?.()?.getAllRecursiveChildren?.() ?? []) {
        const control = c as Control
        if (control && isData(control.dataSet)) {
          add(control.dataSet)
          grids.push({ control, data: control.dataSet })
        }
      }
    } catch {
      // a screen still building its controls
    }
  }

  const has = (d: Data, column: string): boolean => {
    try {
      const names = d.getColumnNames?.()
      if (Array.isArray(names)) return names.includes(column)
      return d.getRowCount() > 0 && d.getValue(0, column) !== undefined
    } catch {
      return false
    }
  }
  const text = (d: Data, row: number, column: string): string => {
    try {
      const v = d.getValue(row, column)
      return v === null || v === undefined ? '' : String(v).trim()
    } catch {
      return ''
    }
  }
  const rows = (d: Data): number => {
    try {
      return Math.max(0, Math.min(50_000, Math.floor(Number(d.getRowCount()) || 0)))
    } catch {
      return 0
    }
  }

  // the class lists: data with numbers and names, each of one class
  const lists: { data: Data; students: NeisStudent[] }[] = []
  let mixed = false
  for (const d of found) {
    if (!has(d, 'stuFlnm') || !has(d, 'stuInvlNo')) continue
    const read: NeisStudent[] = []
    const seen = new Set<string>()
    const withClass = has(d, 'clsNo')
    for (let r = 0; r < rows(d); r++) {
      const name = text(d, r, 'stuFlnm')
      const no = text(d, r, 'stuInvlNo')
      const cls = withClass ? text(d, r, 'clsNo') : ''
      if (!name || !no || seen.has(cls + '|' + no)) continue
      seen.add(cls + '|' + no)
      read.push({ cls, no, name })
    }
    if (!read.length) continue
    if (new Set(read.map((s) => s.cls).filter(Boolean)).size > 1) mixed = true
    else lists.push({ data: d, students: read })
  }
  if (!lists.length) return { ok: false, kind: mixed ? 'many-classes' : 'no-class' }

  // one class only: the dsStu lists when there are any; one of them must hold all the others
  // (the same list twice, or a part of it), else the screens are of different classes
  const pool = lists.some((l) => named.includes(l.data))
    ? lists.filter((l) => named.includes(l.data))
    : lists
  const classOf = (l: { students: NeisStudent[] }): string =>
    l.students.find((s) => s.cls)?.cls ?? ''
  if (new Set(pool.map(classOf).filter(Boolean)).size > 1) return { ok: false, kind: 'many-lists' }
  const ids = pool.map((l) => new Set(l.students.map((s) => s.no + '|' + s.name)))
  const whole = ids.findIndex((mine) => ids.every((other) => [...other].every((x) => mine.has(x))))
  if (whole < 0) return { ok: false, kind: 'many-lists' }
  const list = pool[whole].data
  const students = pool[whole].students
  const cls = pool.map(classOf).find(Boolean) ?? ''

  // 누가기록: a record names its student, or belongs to the one selected in the class list;
  // one that names another class is not this class's
  const records: NeisRecord[] = []
  let recordsFor: RecordsFor = 'none'
  let unplaced = 0
  let selected: string | null = null
  const selectedNo = (): string => {
    if (selected !== null) return selected
    selected = ''
    for (const g of grids) {
      if (g.data !== list || typeof g.control.getSelectedRowIndex !== 'function') continue
      try {
        const index = Number(g.control.getSelectedRowIndex())
        if (Number.isInteger(index) && index >= 0) selected = text(list, index, 'stuInvlNo')
      } catch {
        // no selection
      }
      if (selected) break
    }
    return selected
  }
  for (const d of found) {
    if (!has(d, 'ghvrDevCn')) continue
    const numbered = has(d, 'stuInvlNo')
    const dated = has(d, 'ghvrDevEnfcYmd')
    const classed = has(d, 'clsNo')
    for (let r = 0; r < rows(d); r++) {
      const content = text(d, r, 'ghvrDevCn')
      if (!content) continue
      const recordCls = classed ? text(d, r, 'clsNo') : ''
      const no = numbered ? text(d, r, 'stuInvlNo') : selectedNo()
      if (!no || (cls && recordCls && recordCls !== cls)) {
        unplaced++
        continue
      }
      records.push({ no, date: dated ? text(d, r, 'ghvrDevEnfcYmd') : '', text: content })
      recordsFor = numbered ? 'all' : recordsFor === 'all' ? 'all' : 'selected'
    }
  }
  return { ok: true, students, records, recordsFor, unplaced }
}

/** a student of the class with their 누가기록, oldest first */
export interface NeisClassStudent extends NeisStudent {
  records: { date: string; text: string }[]
}

export type NeisClassResult =
  | {
      ok: true
      students: NeisClassStudent[]
      recordsRead: number
      recordsFor: RecordsFor
      unplaced: number
    }
  | { ok: false; message: string }

/** the class with each student's records; a record of a number not in the class is left out
 * and counted with the other records that could not be placed */
export function classResult(page: PageClass): NeisClassResult {
  if (!page.ok) return { ok: false, message: FAILED[page.kind] }
  const byNo = new Map<string, NeisClassStudent>()
  const students = page.students.map((s) => {
    const student: NeisClassStudent = { ...s, records: [] }
    byNo.set(s.no, student)
    return student
  })
  let recordsRead = 0
  let unplaced = page.unplaced
  for (const r of page.records) {
    const student = byNo.get(r.no)
    if (!student) {
      unplaced++
      continue
    }
    student.records.push({ date: r.date, text: r.text })
    recordsRead++
  }
  for (const s of students) s.records.sort((a, b) => a.date.localeCompare(b.date))
  return {
    ok: true,
    students,
    recordsRead,
    recordsFor: recordsRead > 0 ? page.recordsFor : 'none',
    unplaced,
  }
}

const FAILED: Record<Extract<PageClass, { ok: false }>['kind'], string> = {
  'no-platform': '나이스 화면을 찾지 못했어요. 전용 브라우저에서 나이스에 로그인해 주세요.',
  'no-class':
    '학급 명단이 있는 화면을 찾지 못했어요. 나이스에서 [학급담임 → 행동특성및종합의견 → 누가기록] 화면을 연 뒤 다시 눌러 주세요.',
  'many-lists':
    '서로 다른 학급 명단이 있는 나이스 화면이 함께 열려 있어요. 누가기록 화면 하나만 남기고 다른 화면은 닫은 뒤 다시 눌러 주세요.',
  'many-classes':
    '명단에 여러 반 학생이 섞여 있어요. 담임 학급의 [행동특성및종합의견 → 누가기록] 화면에서 다시 읽어 주세요.',
}

/** a student's 누가기록 as observation notes: oldest first, one a line, each text once */
export function recordsToNotes(records: readonly { date: string; text: string }[]): string {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const r of [...records].sort((a, b) => a.date.localeCompare(b.date))) {
    const line = r.text.replace(/\s+/g, ' ').trim()
    if (!line || seen.has(line)) continue
    seen.add(line)
    lines.push(line)
  }
  return lines.join('\n')
}

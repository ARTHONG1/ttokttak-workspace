/**
 * A stand-in for the data side of a NEIS 4th-generation screen (the eXBuilder6 runtime), for
 * the class-list tests: cpr.core.Platform.INSTANCE.getAllRunningAppInstances() gives the open
 * screens, an app's lookup(id) gives a data control (getRowCount, getValue, getColumnNames), and
 * its controls (a grid with a dataSet and a selected row) come from
 * getContainer().getAllRecursiveChildren(). Column ids are those of the 누가기록 screen:
 * clsNo, stuInvlNo, stuFlnm for a student; ghvrDevEnfcYmd, ghvrDevCn for a record.
 */
export interface FakeStudent {
  cls?: string
  no: string
  name: string
}

export interface FakeRecord {
  /** the student's number, when the record data carries one */
  no?: string
  /** the class, when the record data carries one */
  cls?: string
  date: string
  text: string
}

export interface FakeNeisDataOptions {
  students: FakeStudent[]
  records?: FakeRecord[]
  /** the record data has a stuInvlNo column (records of the whole class) */
  numbered?: boolean
  /** the class list's selected row (the student whose records the screen shows) */
  selected?: number
  /** the data is reached only through the grids (no lookup by id) */
  gridsOnly?: boolean
  /** other open screens, each with a class list of its own (as dsStu unless said) */
  otherScreens?: { students: FakeStudent[]; id?: string }[]
}

function data(columns: string[], rows: Record<string, string>[]) {
  return {
    getColumnNames: () => [...columns],
    getRowCount: () => rows.length,
    getValue: (row: number, column: string) =>
      columns.includes(column) ? (rows[row]?.[column] ?? '') : undefined,
  }
}

const studentData = (students: FakeStudent[]) =>
  data(
    ['clsNo', 'stuInvlNo', 'stuFlnm'],
    students.map((s) => ({ clsNo: s.cls ?? '3', stuInvlNo: s.no, stuFlnm: s.name })),
  )

export function fakeNeisData(options: FakeNeisDataOptions) {
  const students = studentData(options.students)
  const classed = (options.records ?? []).some((r) => r.cls !== undefined)
  const records = data(
    [
      ...(classed ? ['clsNo'] : []),
      ...(options.numbered ? ['stuInvlNo'] : []),
      'ghvrDevEnfcYmd',
      'ghvrDevCn',
    ],
    (options.records ?? []).map((r) => ({
      clsNo: r.cls ?? '',
      stuInvlNo: r.no ?? '',
      ghvrDevEnfcYmd: r.date,
      ghvrDevCn: r.text,
    })),
  )
  const grids = [
    { dataSet: students, getSelectedRowIndex: () => options.selected ?? -1 },
    { dataSet: records },
  ]
  const app = {
    lookup: (id: string) =>
      options.gridsOnly ? null : id === 'dsStu' ? students : id === 'dsGicRecStu' ? records : null,
    getContainer: () => ({ getAllRecursiveChildren: () => grids }),
  }
  const others = (options.otherScreens ?? []).map((screen) => {
    const list = studentData(screen.students)
    return {
      lookup: (id: string) => (id === (screen.id ?? 'dsStu') ? list : null),
      getContainer: () => ({ getAllRecursiveChildren: () => [{ dataSet: list }] }),
    }
  })
  return {
    core: { Platform: { INSTANCE: { getAllRunningAppInstances: () => [app, ...others] } } },
  }
}

/** put the fake runtime on a page (the browser test) */
export function installFakeNeisData(win: Window, options: FakeNeisDataOptions): void {
  ;(win as unknown as { cpr: unknown }).cpr = fakeNeisData(options)
}

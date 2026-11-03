/**
 * Self-check and the diagnostic file. The extension runs the checks from its popup and
 * from the page; when one fails the teacher saves a diagnostic file and sends it. The
 * file holds the work screen's structure (object paths and kinds, dataset column names
 * and row counts), the public unit table, the screen's function names and the source of
 * the functions about adding rows, uploads, files and Excel — never a dataset value, so
 * no amount, name or item leaves the school PC. specFromDiagnostic turns the file back
 * into a fake screen so the fill is tested against the real structure.
 */
import type { FakeObject, FakeSpec } from './fake-spec'
import { isDataset, type FrameInfo } from './nexacro'
import {
  detectScreen,
  findUnitTable,
  findWorkForm,
  type NexacroLike,
  type ScreenKind,
} from './screen'
import type { ScreenMap } from './screen-map'
import type { UnitTable } from './units'

export type DesktopState = 'ok' | 'off' | 'missing' | 'unknown'
export type WebState = 'ok' | 'none' | 'unknown'

export interface CheckEnv {
  hostPermission: boolean
  pageScript: boolean
  nx: NexacroLike | undefined
  map: ScreenMap
  desktop: DesktopState
  web: WebState
}

export interface CheckResult {
  id: number
  label: string
  /** null: not applicable or not known yet */
  ok: boolean | null
  hint: string
}

const SEND_DIAG = '[진단 파일 저장]을 눌러 파일을 보내 주세요.'

export function runChecks(env: CheckEnv): CheckResult[] {
  const form = env.pageScript ? findWorkForm(env.nx, env.map) : null
  const screen: ScreenKind | null = form ? detectScreen(form, env.map) : null
  const units = form && screen?.kind === 'pumui' ? findUnitTable(form, env.map) : null
  const hasFrame = !!env.nx && typeof env.nx.getApplication === 'function'
  const desktop: Record<DesktopState, [boolean | null, string]> = {
    ok: [true, ''],
    unknown: [null, '프로그램 연결은 [똑딱작업실에서 받기]를 누를 때 확인해요.'],
    off: [false, '똑딱작업실을 켜 주세요.'],
    missing: [false, '똑딱작업실을 설치(또는 다시 설치)해 주세요. 웹 앱만 쓰신다면 넘어가도 돼요.'],
  }
  const web: Record<WebState, [boolean | null, string]> = {
    ok: [true, ''],
    unknown: [null, '웹 앱 연결은 웹 앱에서 품의를 보낼 때 확인해요.'],
    none: [
      false,
      '웹 앱 품의서 생성에서 [K-에듀파인으로 보내기]를 한 번 눌러 주세요. 프로그램만 쓰신다면 넘어가도 돼요.',
    ],
  }
  return [
    {
      id: 1,
      label: 'K-에듀파인 주소 권한',
      ok: env.hostPermission,
      hint: env.hostPermission ? '' : '팝업에서 K-에듀파인 주소를 넣고 [허용]을 눌러 주세요.',
    },
    {
      id: 2,
      label: 'K-에듀파인 화면 안에서 동작',
      ok: env.pageScript,
      hint: env.pageScript
        ? ''
        : 'K-에듀파인 화면을 새로 고쳐(F5) 주세요. 그래도 안 되면 ' + SEND_DIAG,
    },
    {
      id: 3,
      label: 'K-에듀파인 화면 틀 찾기',
      ok: env.pageScript && hasFrame,
      hint: env.pageScript && hasFrame ? '' : SEND_DIAG,
    },
    {
      id: 4,
      label: '품의등록 화면 인식',
      ok: screen?.kind === 'pumui',
      hint:
        screen?.kind === 'pumui'
          ? ''
          : !form
            ? '업무 화면(품의등록)을 열어 주세요.'
            : 'K-에듀파인 품의등록 화면을 열어 주세요. 열려 있는데도 이 표시가 나오면 ' +
              SEND_DIAG +
              (screen?.kind === 'other'
                ? ' (찾지 못한 이름: ' + screen.missing.join(', ') + ')'
                : ''),
    },
    {
      id: 5,
      label: '단위 목록 읽기',
      ok: screen?.kind === 'pumui' ? !!units : null,
      hint:
        screen?.kind === 'pumui' && !units
          ? '물품·용역 구분을 먼저 골라 주세요. 그래도 안 되면 ' + SEND_DIAG
          : '',
    },
    {
      id: 6,
      label: '똑딱작업실 프로그램 연결',
      ok: desktop[env.desktop][0],
      hint: desktop[env.desktop][1],
    },
    { id: 7, label: '똑딱작업실 웹 앱 연결', ok: web[env.web][0], hint: web[env.web][1] },
  ]
}

export type DiagObject =
  | { path: string; kind: 'edit' | 'object' }
  | { path: string; kind: 'grid'; bind?: string }
  | { path: string; kind: 'div'; visible?: boolean }

export interface DiagnosticFile {
  schema: 'ttokttak.edufine-diag'
  version: 1
  takenAt: string
  origin: string
  extensionVersion: string
  mapRevision: string
  checks: CheckResult[]
  screen: ScreenKind | null
  objects: DiagObject[]
  datasets: { path: string; columns: string[]; rowcount: number }[]
  functions: string[]
  functionSources: Record<string, string>
  unitTablePath: string | null
  unitTable: UnitTable
  /** the page's frames (paths only), to see where the app is when the check cannot find it */
  frames: FrameInfo[]
  log: string[]
}

const MAX_DEPTH = 6
const MAX_OBJECTS = 3000
const SOURCE_NAMES = /RowAdit|RowAdd|Upload|File|Atch|Excel|Xls/i
const MAX_SOURCES = 40
const MAX_SOURCE_CHARS = 20_000

function ownKeys(o: object): string[] {
  try {
    return Object.keys(o).filter((k) => !k.startsWith('_') && k !== 'parent' && k !== 'opener')
  } catch {
    return []
  }
}

function columnsOf(ds: unknown): string[] {
  const d = ds as { getColCount?: () => number; getColID?: (i: number) => string }
  if (typeof d.getColCount !== 'function' || typeof d.getColID !== 'function') return []
  const out: string[] = []
  try {
    const n = d.getColCount()
    for (let i = 0; i < n && i < 500; i++) out.push(String(d.getColID(i)))
  } catch {
    /* structure only; give up quietly */
  }
  return out
}

export function buildDiagnostic(input: {
  nx: NexacroLike | undefined
  map: ScreenMap
  checks: CheckResult[]
  log: string[]
  origin: string
  extensionVersion: string
  now: Date
  frames?: FrameInfo[]
}): DiagnosticFile {
  const form = findWorkForm(input.nx, input.map)
  const diag: DiagnosticFile = {
    schema: 'ttokttak.edufine-diag',
    version: 1,
    takenAt: input.now.toISOString(),
    origin: input.origin,
    extensionVersion: input.extensionVersion,
    mapRevision: input.map.revision,
    checks: input.checks,
    screen: form ? detectScreen(form, input.map) : null,
    objects: [],
    datasets: [],
    functions: [],
    functionSources: {},
    unitTablePath: null,
    unitTable: [],
    frames: input.frames ?? [],
    log: input.log.slice(-200),
  }
  if (!form) return diag
  const unit = findUnitTable(form, input.map)
  if (unit) {
    diag.unitTablePath = unit.path
    diag.unitTable = unit.table
  }
  const seen = new Map<object, string>()
  const grids: { path: string; obj: object }[] = []
  const walk = (obj: object, prefix: string, depth: number): void => {
    for (const key of ownKeys(obj)) {
      if (diag.objects.length + diag.datasets.length >= MAX_OBJECTS) return
      const path = prefix ? prefix + '.' + key : key
      let v: unknown
      try {
        v = (obj as Record<string, unknown>)[key]
      } catch {
        continue
      }
      if (typeof v === 'function') {
        diag.functions.push(path)
        if (SOURCE_NAMES.test(key) && Object.keys(diag.functionSources).length < MAX_SOURCES) {
          try {
            diag.functionSources[path] = Function.prototype.toString
              .call(v)
              .slice(0, MAX_SOURCE_CHARS)
          } catch {
            /* native or proxied */
          }
        }
        continue
      }
      if (!v || typeof v !== 'object' || seen.has(v)) continue
      seen.set(v, path)
      if (isDataset(v)) {
        diag.datasets.push({ path, columns: columnsOf(v), rowcount: v.rowcount })
        continue
      }
      const o = v as Record<string, unknown>
      if (typeof o.getBindDataset === 'function') {
        grids.push({ path, obj: o })
        continue
      }
      if (typeof o.set_value === 'function') {
        diag.objects.push({ path, kind: 'edit' })
        continue
      }
      const children = ownKeys(o).length
      if (typeof o.visible === 'boolean' || children > 1) {
        diag.objects.push({
          path,
          kind: 'div',
          ...(typeof o.visible === 'boolean' ? { visible: o.visible } : {}),
        })
      } else {
        diag.objects.push({ path, kind: 'object' })
      }
      if (depth + 1 < MAX_DEPTH) walk(o, path, depth + 1)
    }
  }
  seen.set(form, '')
  walk(form, '', 0)
  for (const g of grids) {
    let bind: string | undefined
    try {
      const ds = (g.obj as { getBindDataset(): unknown }).getBindDataset()
      bind = ds && typeof ds === 'object' ? seen.get(ds) : undefined
    } catch {
      bind = undefined
    }
    diag.objects.push({ path: g.path, kind: 'grid', ...(bind ? { bind } : {}) })
  }
  return diag
}

/** a fake screen with the structure the diagnostic file recorded (for tests) */
export function specFromDiagnostic(diag: DiagnosticFile, map: ScreenMap): FakeSpec {
  const objects: FakeObject[] = []
  let rowAddTarget: string | undefined
  for (const o of diag.objects) {
    if (o.kind === 'edit') objects.push({ path: o.path, kind: 'edit' })
    else if (o.kind === 'div') objects.push({ path: o.path, kind: 'div', visible: o.visible })
    else if (o.kind === 'grid' && o.bind) {
      objects.push({ path: o.path, kind: 'grid', bind: o.bind })
      if (o.path === map.pumui.grid) rowAddTarget = o.bind
    } else if (o.kind === 'object') objects.push({ path: o.path, kind: 'button' })
  }
  for (const d of diag.datasets) {
    const rows =
      d.path === diag.unitTablePath
        ? diag.unitTable.map((u) => ({
            [map.pumui.unitCode]: u.code,
            [map.pumui.unitName]: u.name,
          }))
        : d.path === rowAddTarget
          ? []
          : Array.from({ length: d.rowcount }, () => ({}))
    objects.push({ path: d.path, kind: 'dataset', columns: d.columns, rows })
  }
  for (const f of diag.functions) {
    objects.push({
      path: f,
      kind: 'function',
      behavior: f === map.pumui.rowAddHandler ? 'row-add' : 'forbidden',
    })
  }
  return { frame: 'active', map, objects, rowAddTarget, budgetSelected: true }
}

import { describe, expect, it } from 'vitest'
import { buildDiagnostic, runChecks, specFromDiagnostic } from '../../../src/sites/edufine/diagnose'
import { applyFill, planFill } from '../../../src/features/edufine-pumui/fill'
import { buildPumuiPackage } from '../../../src/features/edufine-pumui/package'
import { findWorkForm } from '../../../src/sites/edufine/screen'
import { DEFAULT_SCREEN_MAP as map } from '../../../src/sites/edufine/screen-map'
import { causeScreen, makeFakeEdufine, pumuiScreen } from '../../fixtures/fake-nexacro'

const env = (nx: unknown, extra: Partial<Parameters<typeof runChecks>[0]> = {}) => ({
  hostPermission: true,
  pageScript: true,
  nx: nx as never,
  map,
  desktop: 'unknown' as const,
  web: 'unknown' as const,
  ...extra,
})

describe('self-check', () => {
  it('passes items 1 to 5 on the 품의등록 screen', () => {
    const fake = makeFakeEdufine(pumuiScreen(map))
    const checks = runChecks(env(fake.nx))
    expect(checks.map((c) => [c.id, c.ok])).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [4, true],
      [5, true],
      [6, null],
      [7, null],
    ])
    expect(fake.writes).toEqual([])
  })

  it('explains what to do for each failure', () => {
    const fake = makeFakeEdufine(causeScreen(map))
    const checks = runChecks(env(fake.nx, { hostPermission: false, desktop: 'off', web: 'none' }))
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]))
    expect(byId[1]).toMatchObject({
      ok: false,
      hint: '「똑딱 에듀파인 연결」 확장 프로그램을 다시 설치해 주세요.',
    })
    expect(byId[4].ok).toBe(false)
    expect(byId[4].hint).toContain('품의등록 화면을 열어 주세요')
    expect(byId[6]).toMatchObject({ ok: false, hint: '똑딱작업실을 켜 주세요.' })
    expect(byId[7]).toMatchObject({ ok: false })
    const none = runChecks(env(undefined))
    expect(none.find((c) => c.id === 3)).toMatchObject({ ok: false })
  })
})

describe('diagnostic file', () => {
  const spec = pumuiScreen(map)
  // values that must never reach the file
  const budget = spec.objects.find((o) => o.path === map.pumui.budget)
  if (budget && budget.kind === 'dataset')
    budget.rows = [{ detlBsnsNm: '홍길동 연구', dmndAmt: 123456 }]

  it('records structure, the unit table and selected function sources, never values', () => {
    const fake = makeFakeEdufine(spec)
    const diag = buildDiagnostic({
      nx: fake.nx,
      map,
      checks: runChecks(env(fake.nx)),
      log: ['점검 실행'],
      origin: 'https://klef.example.go.kr',
      extensionVersion: '0.1.0',
      now: new Date('2026-11-03T03:00:00Z'),
    })
    const text = JSON.stringify(diag)
    expect(diag.schema).toBe('ttokttak.edufine-diag')
    expect(text).not.toContain('123456')
    expect(text).not.toContain('홍길동')
    expect(diag.datasets).toContainEqual({
      path: map.pumui.budget,
      columns: ['detlBsnsNm', 'detlIem', 'cptDtl', 'dmndAmt'],
      rowcount: 1,
    })
    expect(diag.unitTable).toContainEqual({ code: '017', name: 'SET' })
    expect(Object.keys(diag.functionSources)).toEqual([map.pumui.rowAddHandler])
    expect(diag.functions).toContain('fnSave')
    expect(diag.screen).toEqual({ kind: 'pumui' })
    expect(fake.writes).toEqual([])
  })

  it('stops at cycles and the depth limit', () => {
    const fake = makeFakeEdufine(pumuiScreen(map))
    const form = findWorkForm(fake.nx, map)! as Record<string, unknown>
    form.self = form
    const diag = buildDiagnostic({
      nx: fake.nx,
      map,
      checks: [],
      log: [],
      origin: '',
      extensionVersion: '',
      now: new Date(),
    })
    expect(diag.objects.filter((o) => o.path.startsWith('self')).length).toBe(0)
    expect(diag.objects.every((o) => o.path.split('.').length <= 6)).toBe(true)
  })

  it('rebuilds a fake screen on which the fill still works', () => {
    const fake = makeFakeEdufine(pumuiScreen(map))
    const diag = buildDiagnostic({
      nx: fake.nx,
      map,
      checks: [],
      log: [],
      origin: '',
      extensionVersion: '',
      now: new Date(),
    })
    const again = makeFakeEdufine(specFromDiagnostic(diag, map))
    const form = findWorkForm(again.nx, map)!
    const pkg = buildPumuiPackage({
      title: '과학실 실험 도구 구입',
      summary: '요약',
      items: [
        {
          description: '비커',
          specification: '',
          unit: '개',
          quantity: 2,
          unitPrice: 1000,
          amount: 2000,
        },
      ],
    })
    expect(applyFill(form, map, planFill(form, map, pkg))).toEqual({
      ok: true,
      added: 1,
      gridTotal: 2000,
    })
    expect(again.forbiddenCalls()).toBe(0)
  })

  it('records the page frames, also when the app was not found', () => {
    const frames = [
      { depth: 0, path: '/portal/main.do', nexacro: false },
      { depth: 1, path: '(다른 주소)', nexacro: false },
    ]
    const diag = buildDiagnostic({
      nx: undefined,
      map,
      checks: [],
      log: [],
      origin: '',
      extensionVersion: '',
      now: new Date(),
      frames,
    })
    expect(diag.frames).toEqual(frames)
    expect(diag.objects).toEqual([])
    const without = buildDiagnostic({
      nx: undefined,
      map,
      checks: [],
      log: [],
      origin: '',
      extensionVersion: '',
      now: new Date(),
    })
    expect(without.frames).toEqual([])
  })
})

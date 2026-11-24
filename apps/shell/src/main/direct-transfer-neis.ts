import type { Frame } from 'playwright-core'
import type { RecordPackage } from '@genoffice/ttokttak-extension/record'

const rowSelector = '.cl-grid-row.cl-selected'
const cellSelector = 'div[role="gridcell"]'
const editorSelector = 'textarea.cl-text, .cl-grid-row.cl-selected textarea'
const compact = (value: string): string => value.replace(/\s+/g, '')
const normSpace = (value: string): string => value.replace(/\s+/g, ' ').trim()

export type SelectionSnapshot =
  | { ok: true; identity: string; nameCells: string[]; existingText: string }
  | { ok: false; kind: 'none' | 'ambiguous-grid' | 'multi-row' | 'malformed'; hasGrid?: boolean }

/** Serialized into the page; keep this function independent of module state. */
export function readSelection(): SelectionSnapshot {
  const visible = (el: Element): boolean => (el as HTMLElement).getClientRects().length > 0
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>('.cl-grid-row.cl-selected'),
  ).filter(visible)
  if (rows.length === 0) {
    const hasGrid = Array.from(document.querySelectorAll<HTMLElement>('.cl-grid-row')).some(visible)
    return { ok: false, kind: 'none', hasGrid }
  }
  const grids = new Set(rows.map((row) => row.closest('.cl-grid') ?? document.body))
  if (grids.size > 1) return { ok: false, kind: 'ambiguous-grid' }
  const rowIndexes = new Set(
    rows
      .map((row) => row.getAttribute('aria-rowindex') ?? row.getAttribute('data-rowindex'))
      .filter((v): v is string => Boolean(v)),
  )
  if (rowIndexes.size > 1) return { ok: false, kind: 'multi-row' }
  // eXBuilder6 draws a row with frozen columns as two .cl-grid-row.cl-selected parts in one .cl-grid:
  // the first part's right-most cell holds the editable text, while fixed columns carry the student name.
  // Note: an empty text cell can have 0px height before F2 opens its editor, so do not filter cells by rect height.
  const primaryCells = Array.from(rows[0].querySelectorAll<HTMLElement>('div[role="gridcell"]'))
  const textCell = primaryCells[primaryCells.length - 1]
  if (!textCell) return { ok: false, kind: 'malformed' }
  const allCells = rows.flatMap((row) =>
    Array.from(row.querySelectorAll<HTMLElement>('div[role="gridcell"]')),
  )
  const otherCells = allCells.filter((cell) => cell !== textCell)
  if (otherCells.length === 0) return { ok: false, kind: 'malformed' }
  const nameCells = otherCells
    .map((cell) => (cell.textContent ?? '').replace(/\s+/g, ''))
    .filter(Boolean)
  const identity = JSON.stringify([
    rows[0].getAttribute('aria-rowindex'),
    rows[0].getAttribute('data-rowindex'),
    ...otherCells.map((cell) => (cell.textContent ?? '').replace(/\s+/g, '')),
  ])
  return {
    ok: true,
    identity,
    nameCells,
    existingText: (textCell.textContent ?? '').trim(),
  }
}

export async function fillNeis(
  frame: Frame,
  pkg: RecordPackage,
  options: { signal?: AbortSignal; onVerifying?: () => void } = {},
): Promise<
  { ok: true; written: number; next: number; startedFrom?: number } | { ok: false; reason: string }
> {
  let written = 0
  let nextIndex = 0
  const checkActive = (): void => {
    if (options.signal?.aborted) throw new Error('direct-transfer-cancelled')
  }
  const fail = (reason: string, resumeAt?: number) => ({
    ok: false as const,
    reason:
      resumeAt !== undefined && resumeAt < pkg.students.length
        ? `${reason} ${written}명 입력 확인. 이어서 보내려면 ${resumeAt + 1}번째 학생(${pkg.students[resumeAt].name}) 줄을 선택해 주세요.`
        : `${reason} ${written}명 입력 확인. 다시 보내려면 첫 학생 줄부터 선택해 주세요.`,
  })
  try {
    checkActive()
    const initial = await frame.evaluate(readSelection)
    checkActive()
    if (!initial.ok) {
      if (initial.kind === 'multi-row')
        return fail('나이스 표에서 여러 학생 줄이 한꺼번에 선택돼 있어요. 한 줄만 선택해 주세요.')
      if (initial.kind === 'ambiguous-grid')
        return fail('선택된 표가 여러 개예요. 입력할 나이스 표 한 곳만 선택해 주세요.')
      return fail('나이스 입력 화면에서 선택된 학생 줄을 찾지 못했어요.')
    }
    const startIndex = pkg.students.findIndex(
      (s) => Boolean(s.name) && initial.nameCells.includes(compact(s.name)),
    )
    if (startIndex < 0) {
      return fail('1번째 학생의 이름과 선택된 나이스 줄이 달라 입력을 멈췄어요.')
    }

    for (let index = startIndex; index < pkg.students.length; index++) {
      nextIndex = index
      checkActive()
      const student = pkg.students[index]
      const sel = index === startIndex ? initial : await frame.evaluate(readSelection)
      checkActive()
      if (!sel.ok) return fail('선택된 학생 줄을 하나로 확인하지 못했어요.', index)
      const identity = sel.identity
      if (!student.name || !sel.nameCells.includes(compact(student.name))) {
        return fail(
          `${index + 1}번째 학생(${student.name})의 이름과 선택된 나이스 줄이 달라 입력을 멈췄어요.`,
          index,
        )
      }
      const primaryRow = frame.locator(rowSelector + ':visible').first()
      const primaryCells = primaryRow.locator(cellSelector)
      const cellCount = await primaryCells.count()
      checkActive()
      if (cellCount < 1) return fail('나이스 학생 줄의 입력 칸을 찾지 못했어요.', index)
      const cell = primaryCells.nth(cellCount - 1)
      const existing = sel.existingText
      if (student.text) {
        if (existing && normSpace(existing) !== normSpace(student.text))
          return fail(
            `${index + 1}번째 학생(${student.name}) 칸에 다른 글이 있어요. 기존 글을 확인해 주세요.`,
            index,
          )
        if (normSpace(existing) === normSpace(student.text)) {
          written++
        } else {
          checkActive()
          await cell.focus()
          checkActive()
          await frame.page().keyboard.press('F2')
          checkActive()
          const editor = frame.locator(editorSelector).first()
          try {
            await editor.waitFor({ state: 'visible', timeout: 2_000 })
            checkActive()
          } catch {
            checkActive()
            return fail(`${index + 1}번째 학생의 입력 칸을 열지 못했어요.`, index)
          }
          const during = await frame.evaluate(readSelection)
          checkActive()
          if (!during.ok || during.identity !== identity)
            return fail('입력할 학생 선택이 바뀌었어요.', index)
          await editor.fill(student.text)
          checkActive()
          if (normSpace(await editor.inputValue()) !== normSpace(student.text))
            return fail('편집기에 들어간 글이 보낼 글과 달라요.', index)
          checkActive()
          await editor.press('Enter')
          checkActive()
          try {
            // Some textarea editors commit on blur rather than closing on physical Enter.
            const closedOnEnter = await editor
              .waitFor({ state: 'hidden', timeout: 400 })
              .then(() => true)
              .catch(() => false)
            if (!closedOnEnter) {
              checkActive()
              await editor.evaluate((el, val) => {
                const area = el as HTMLTextAreaElement
                if (area.value !== val) {
                  area.value = val
                  area.dispatchEvent(new Event('input', { bubbles: true }))
                }
                area.dispatchEvent(new Event('blur', { bubbles: true }))
              }, student.text)
              checkActive()
            }
            await editor.waitFor({ state: 'hidden', timeout: 2_000 })
            checkActive()
            options.onVerifying?.()
            await frame.waitForFunction(
              (text) => {
                const row = document.querySelector('.cl-grid-row.cl-selected')
                if (!row) return false
                const cells = Array.from(row.querySelectorAll<HTMLElement>('div[role="gridcell"]'))
                const got = (cells[cells.length - 1]?.textContent ?? '').replace(/\s+/g, ' ').trim()
                const want = text.replace(/\s+/g, ' ').trim()
                return got === want
              },
              student.text,
              { timeout: 2_000 },
            )
            checkActive()
          } catch {
            checkActive()
            return fail(`${index + 1}번째 학생의 입력값을 화면에서 다시 확인하지 못했어요.`, index)
          }
          const after = await frame.evaluate(readSelection)
          checkActive()
          if (!after.ok || after.identity !== identity)
            return fail('입력 후 학생 선택이 바뀌었어요. 내용을 확인해 주세요.', index)
          written++
        }
      }
      if (index < pkg.students.length - 1) {
        checkActive()
        await cell.focus()
        checkActive()
        await frame.page().keyboard.press('Tab')
        checkActive()
        try {
          // Poll a fresh identity: disappearing rows or changed text are not row movement.
          const deadline = Date.now() + 2_000
          let moved = false
          let retriedViaEditor = Boolean(
            student.text && normSpace(existing) !== normSpace(student.text),
          )
          while (Date.now() < deadline) {
            checkActive()
            const next = await frame.evaluate(readSelection)
            checkActive()
            if (next.ok && next.identity !== identity) {
              moved = true
              break
            }
            if (!retriedViaEditor && deadline - Date.now() <= 1_750) {
              retriedViaEditor = true
              checkActive()
              await cell.focus()
              checkActive()
              await frame.page().keyboard.press('F2')
              checkActive()
              const passEditor = frame.locator(editorSelector).first()
              const opened = await passEditor
                .waitFor({ state: 'visible', timeout: 250 })
                .then(() => true)
                .catch(() => false)
              if (opened) {
                checkActive()
                await passEditor.press('Enter')
                checkActive()
                await passEditor.waitFor({ state: 'hidden', timeout: 500 }).catch(() => undefined)
              }
              checkActive()
              await cell.focus()
              checkActive()
              await frame.page().keyboard.press('Tab')
            }
            await frame.page().waitForTimeout(50)
          }
          if (!moved)
            return fail(`${index + 1}번째 학생 뒤에 다음 나이스 줄로 이동하지 못했어요.`, index + 1)
        } catch {
          checkActive()
          return fail(`${index + 1}번째 학생 뒤에 다음 나이스 줄로 이동하지 못했어요.`, index + 1)
        }
      }
    }
    checkActive()
    return {
      ok: true,
      written,
      next: pkg.students.length,
      ...(startIndex > 0 ? { startedFrom: startIndex } : {}),
    }
  } catch {
    if (options.signal?.aborted) return fail('전송을 취소했어요.', nextIndex)
    return fail(
      '브라우저 연결이나 입력 화면이 바뀌어 멈췄어요. 화면에 들어간 내용을 확인해 주세요.',
    )
  }
}

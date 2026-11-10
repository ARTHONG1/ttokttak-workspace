// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  gridSurvey,
  isNeisHost,
  selectedRow,
  selectedRowHasName,
  selectionMark,
  textCell,
} from '../../../src/sites/neis/grid'
import { mountFakeNeis } from '../../fixtures/fake-neis-grid'

beforeEach(() => {
  document.body.replaceChildren()
})

describe('the NEIS grid', () => {
  it('knows a NEIS work page by its address', () => {
    expect(isNeisHost('ice.neis.go.kr')).toBe(true)
    expect(isNeisHost('neis.go.kr')).toBe(true)
    expect(isNeisHost('open.neis.go.kr')).toBe(false)
    expect(isNeisHost('klef.ice.go.kr')).toBe(false)
    expect(isNeisHost('neis.go.kr.example.com')).toBe(false)
  })

  it('finds the selected row and its text cell', () => {
    const fake = mountFakeNeis(document, [{ name: '김하늘' }, { name: '이바다', text: '성실함.' }])
    expect(selectedRow(document)).toBeNull()
    fake.select(1)
    const row = selectedRow(document)!
    expect(textCell(row)?.textContent).toBe('성실함.')
  })

  it('tells whose row it is by the cells before the text, not by the text', () => {
    const fake = mountFakeNeis(document, [
      { name: '김 하늘', text: '이바다와 함께 발표함.' },
      { name: '이바다' },
    ])
    fake.select(0)
    const first = selectionMark(document)
    expect(selectedRowHasName(document, '김하늘')).toBe(true)
    expect(selectedRowHasName(document, '이바다')).toBe(false)
    expect(selectedRowHasName(document, '')).toBe(true)
    fake.select(1)
    expect(selectionMark(document)).not.toBe(first)
  })

  it('finds the name when the grid draws a row in two parts', () => {
    const part = (cells: string[]): HTMLElement => {
      const row = document.createElement('div')
      row.className = 'cl-grid-row cl-selected'
      for (const value of cells) {
        const cell = document.createElement('div')
        cell.setAttribute('role', 'gridcell')
        cell.textContent = value
        row.append(cell)
      }
      return row
    }
    // the part with the text cell comes first in the page, the fixed columns after it
    document.body.append(part(['과학', '']), part(['3', '김하늘']))
    expect(selectedRowHasName(document, '김하늘')).toBe(true)
    expect(selectedRowHasName(document, '이바다')).toBe(false)
  })

  it('surveys the shape of the grid without a name or a text', () => {
    const fake = mountFakeNeis(document, [{ name: '김하늘', text: '성실함.' }])
    fake.select(0)
    const survey = JSON.stringify(gridSurvey(document))
    expect(survey).not.toContain('김하늘')
    expect(survey).not.toContain('성실함')
    expect(JSON.parse(survey)).toMatchObject({ rows: 1, selectedRows: 1, selectedRowCells: 3 })
  })
})

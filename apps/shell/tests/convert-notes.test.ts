import { describe, expect, it } from 'vitest'
import {
  odtReportNote,
  pdfConversionNotes,
  pdfToWordNotes,
} from '../src/main/document-convert/node-steps'

describe('the notes a conversion shows', () => {
  it("says a scanned PDF once, in the user's words", () => {
    expect(
      pdfConversionNotes({ scannedDocument: true, warnings: ['page 1: scanned page'] }),
    ).toEqual(['스캔한 문서라 글자를 고칠 수 없을 수 있어요.'])
  })

  it('names the pages drawn as pictures, at most five', () => {
    const warnings = [1, 2, 2, 3, 4, 5, 6].map((p) => 'page ' + p + ': fallback render')
    expect(pdfConversionNotes({ scannedDocument: false, warnings })).toEqual([
      '1, 2, 3, 4, 5쪽 외 1쪽은 모양을 그대로 옮기지 못해 그림으로 넣은 부분이 있어요.',
    ])
    expect(
      pdfConversionNotes({ scannedDocument: false, warnings: ['page 3: image', 'page 7: image'] }),
    ).toEqual(['3, 7쪽은 모양을 그대로 옮기지 못해 그림으로 넣은 부분이 있어요.'])
    expect(pdfConversionNotes({ scannedDocument: false, warnings: [] })).toEqual([])
  })

  it('counts what the ODT engine could not carry over', () => {
    expect(odtReportNote([{ count: 2 }, { count: 1 }], 'ODT')).toEqual([
      '서식 3곳이 ODT에서 조금 달라질 수 있어요.',
    ])
    expect(odtReportNote([], 'Word')).toEqual([])
  })

  it('keeps the page notes of PDF → Word for a Word result only', () => {
    const result = { scannedDocument: false, warnings: ['page 1: 4 stray vector path(s) ignored'] }
    expect(pdfToWordNotes('docx', result)).toEqual(pdfConversionNotes(result))
    // a Hangul result says its own note (the layout is the plain one) instead
    expect(pdfToWordNotes('hwp', result)).toEqual([])
    expect(pdfToWordNotes('hwpx', result)).toEqual([])
    expect(pdfToWordNotes('hwp', { scannedDocument: true, warnings: [] })).toEqual([
      '스캔한 문서라 글자를 고칠 수 없을 수 있어요.',
    ])
  })
})

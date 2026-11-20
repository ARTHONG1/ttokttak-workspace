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

  // the engine's notes differ a lot: a whole page as a picture or a page left out must not
  // read like "a part became a picture", and a stray line it skipped is not worth a word
  // (2026-11-21: a Word handout became slides of pictures under the mild note)
  it('says which pages became whole pictures, which lost content and which only parts', () => {
    const notes = pdfConversionNotes({
      scannedDocument: false,
      warnings: [
        'page 1: graphics too complex, exported as full-page image',
        'page 2: graphics too complex, exported as full-page image',
        'page 3: 2 vector illustration region(s) rendered as image',
        'page 4: scanned page, exported as full-page image',
        'page 4: fallback render failed, page content dropped',
        'page 5: 3 rotated char(s) dropped (not representable in cells)',
        'page 6: scanned page, text recovered via local OCR (confidence 0.91)',
        'page 7: 12 stray vector path(s) ignored (curves/diagonals outside illustration regions)',
        'page 7: 2 decorative line(s) ignored (vertical or over the per-page cap)',
      ],
    })
    expect(notes).toEqual([
      '4쪽은 내용을 옮기지 못했어요. 원본과 비교해 주세요.',
      '1, 2쪽은 쪽 전체를 그림으로 넣었어요. 이 쪽의 글자는 고칠 수 없어요.',
      '5쪽은 기울어진 글자 일부를 옮기지 못했어요.',
      '6쪽은 스캔한 글자를 읽어 넣었어요. 틀린 글자가 있을 수 있어요.',
      '3쪽은 모양을 그대로 옮기지 못해 그림으로 넣은 부분이 있어요.',
    ])
  })

  it('says nothing for lines it only skipped', () => {
    expect(
      pdfConversionNotes({
        scannedDocument: false,
        warnings: [
          'page 1: 4 stray vector path(s) ignored',
          'page 2: 1 decorative line(s) ignored',
        ],
      }),
    ).toEqual([])
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

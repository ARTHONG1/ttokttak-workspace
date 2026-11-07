import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import type { AgentMessage, AgentToolDef } from '@genoffice/agent-core'
import {
  localExactEditFollowup,
  localExactPdfStep,
  localExactSlideStep,
  localExactWorkbookStep,
  planLocalExactEdit,
  planLocalExactFormat,
  planLocalHwpContextualEdit,
} from '../src/main/local-ai-exact-edit'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { executeTool } from '../src/renderer/ai/tools'

const hwp: AgentToolDef = {
  name: 'replace_text',
  description: 'One exact occurrence',
  inputSchema: {
    type: 'object',
    properties: { find: { type: 'string' }, replace: { type: 'string' } },
  },
}

const liveHwp = (instruction: string, text: string): Extract<AgentMessage, { role: 'user' }> => ({
  role: 'user',
  text: `${instruction}\n\n## Open document\nLength: ${text.length} characters.\nForm fields: none.\nTables: none.\nText (complete):\n${text}`,
})

describe('natural Korean editing of populated Hangul files', () => {
  const original = '새빛초등학교 공문\n행사일: 2026년 12월 3일\n예산: 350,000원\n협조 부탁드립니다.'

  it('changes a labelled field from the live HWP document without quotation marks', () => {
    const planned = planLocalHwpContextualEdit(
      [liveHwp('예산을 450,000원으로 바꿔 주세요.', original)],
      [hwp],
    )
    expect(planned?.name).toBe('replace_text')
    expect(planned?.input).toEqual({ find: '예산: 350,000원', replace: '예산: 450,000원' })
    expect(
      planLocalHwpContextualEdit(
        [liveHwp('제목을 새빛초 체험학습 안내로 수정해 줘', original)],
        [hwp],
      )?.input,
    ).toEqual({ find: '새빛초등학교 공문', replace: '새빛초 체험학습 안내' })
  })

  it('ignores a selected-text or form appendix after the authoritative complete document', () => {
    const request = liveHwp('예산을 450,000원으로 바꿔 주세요.', original)
    const editedSelection = {
      ...request,
      text:
        request.text +
        '\n\n## Selected text\nThe user selected 1 paragraph(s) in the editor. The request is about this part:\n1. 협조 부탁드립니다.',
    }
    expect(planLocalHwpContextualEdit([editedSelection], [hwp])?.input).toEqual({
      find: '예산: 350,000원',
      replace: '예산: 450,000원',
    })
    const withForm = {
      ...request,
      text:
        request.text +
        '\n\n## The form of this document\nKeep paragraph styles.\n\n## Selected text\n1. 협조 부탁드립니다.',
    }
    expect(planLocalHwpContextualEdit([withForm], [hwp])?.input).toEqual({
      find: '예산: 350,000원',
      replace: '예산: 450,000원',
    })
    expect(
      planLocalHwpContextualEdit(
        [{ ...request, text: request.text + '\n\nUnexpected extra user instruction' }],
        [hwp],
      ),
    ).toBeNull()
  })

  it('allows an explicit correction of an earlier question only if the content still matches', () => {
    const history: AgentMessage[] = [
      liveHwp('예산을 450,000원으로 바꿀 수 있어?', original),
      { role: 'assistant', text: '수정할 위치를 알려주세요.' },
      liveHwp('아니 바꾸라고', original),
    ]
    expect(planLocalHwpContextualEdit(history, [hwp])?.input).toEqual({
      find: '예산: 350,000원',
      replace: '예산: 450,000원',
    })
    expect(planLocalHwpContextualEdit([liveHwp('아니 바꾸라고', original)], [hwp])).toBeNull()
    expect(
      planLocalHwpContextualEdit(
        [...history.slice(0, -1), liveHwp('아니 바꾸라고', original.replace('350,000', '450,000'))],
        [hwp],
      ),
    ).toBeNull()
  })

  it('never infers targets from partial snapshots, repeated labels, negation or questions', () => {
    const edit = '예산을 450,000원으로 바꿔 주세요.'
    expect(planLocalHwpContextualEdit([liveHwp(edit, original + '\n예산: 20원')], [hwp])).toBeNull()
    expect(
      planLocalHwpContextualEdit([liveHwp('예산을 450,000원으로 바꾸지 마', original)], [hwp]),
    ).toBeNull()
    expect(
      planLocalHwpContextualEdit([liveHwp('예산을 450,000원으로 바꿀까?', original)], [hwp]),
    ).toBeNull()
    expect(
      planLocalHwpContextualEdit(
        [
          {
            role: 'user',
            text: `${edit}\n\n## Open document\nLength: 999 characters.\nText (the first 100 characters; read_document returns the rest):\n${original}`,
          },
        ],
        [hwp],
      ),
    ).toBeNull()
    expect(planLocalHwpContextualEdit([liveHwp(edit, original)], [docs])).toBeNull()
  })

  it('uses the actual tool receipt rather than claiming success from model text', () => {
    const request = liveHwp('예산을 450,000원으로 바꿔줘', original)
    const call = planLocalHwpContextualEdit([request], [hwp])!
    expect(
      localExactEditFollowup([
        request,
        { role: 'assistant', text: '', toolCalls: [call] },
        {
          role: 'tool',
          results: [{ id: call.id, name: call.name, output: 'Replaced 1 occurrence.' }],
        },
      ]),
    ).toBe('요청하신 문구를 변경했습니다.')
  })
})
const docs: AgentToolDef = { name: 'apply_ops', description: '', inputSchema: {} }
const workbookTools: AgentToolDef[] = [
  'get_workbook_context',
  'read_cells',
  'propose_operations',
].map((name) => ({
  name,
  description: '',
  inputSchema: {},
}))
const slideTools: AgentToolDef[] = ['read_slide', 'execute_slide_script'].map((name) => ({
  name,
  description: '',
  inputSchema: {},
}))
const pdfTools: AgentToolDef[] = ['search_text', 'edit_text'].map((name) => ({
  name,
  description: '',
  inputSchema: {},
}))

function nextPdfStep(messages: AgentMessage[], output: string, isError = false): AgentMessage[] {
  const next = localExactPdfStep(messages, pdfTools)
  if (!next || !('call' in next)) throw new Error(`Expected PDF tool call: ${JSON.stringify(next)}`)
  return [
    ...messages,
    { role: 'assistant', text: '', toolCalls: [next.call] },
    { role: 'tool', results: [{ id: next.call.id, name: next.call.name, output, isError }] },
  ]
}

describe('local PDF exact page text replacement', () => {
  const user: AgentMessage = {
    role: 'user',
    text: '1페이지의 Old를 New로 바꿔 줘. Keep은 그대로 둬.',
  }

  it('accepts PDF editor context appended by AgentLoop and completes the verified tool sequence', () => {
    const withContext: AgentMessage = {
      ...user,
      text: `${user.text}\n\nCurrent document: "edit.pdf", 1 pages; the user is viewing page 1.\nDocument properties: title "example"`,
    }
    const target = nextPdfStep([withContext], 'Page 1: …Old Keep…')
    const preserved = nextPdfStep(target, 'Page 1: …Old Keep…')
    const written = nextPdfStep(
      preserved,
      'Replaced occurrence 1 of "Old" on page 1 (unsaved; the user saves with ⌘S).',
    )
    expect(localExactPdfStep(written, pdfTools)).toMatchObject({
      text: expect.stringContaining('New로 변경했습니다'),
    })
  })

  it('searches the actual target and protected text, then uses only the verified PDF edit tool', () => {
    expect(localExactPdfStep([user], pdfTools)).toMatchObject({
      call: { name: 'search_text', input: { query: 'Old' } },
    })
    const target = nextPdfStep([user], 'Page 1: …Old Keep…')
    expect(localExactPdfStep(target, pdfTools)).toMatchObject({
      call: { name: 'search_text', input: { query: 'Keep' } },
    })
    const preserved = nextPdfStep(target, 'Page 1: …Old Keep…')
    expect(localExactPdfStep(preserved, pdfTools)).toMatchObject({
      call: {
        name: 'edit_text',
        input: { page: 1, old_text: 'Old', new_text: 'New', occurrence: 1 },
      },
    })
    const written = nextPdfStep(
      preserved,
      'Replaced occurrence 1 of "Old" on page 1 (unsaved; the user saves with ⌘S).',
    )
    expect(localExactPdfStep(written, pdfTools)).toEqual({
      text: '1페이지의 Old를 New로 변경했습니다. 파일에 반영하려면 저장해 주세요.',
    })
  })

  it('rejects missing, ambiguous, truncated, or wrong-page indexed matches', () => {
    for (const output of [
      'No matches found',
      'Page 2: …Old Keep…',
      'Page 1: …Old Keep…\nPage 1: …Old again…',
      'Page 1: …old Keep…',
      'Page 1: …Old Keep…\n(41 matches total; only the first 40 listed)',
    ]) {
      expect(localExactPdfStep(nextPdfStep([user], output), pdfTools)).toMatchObject({
        text: expect.stringContaining('변경하지 않았습니다'),
      })
    }
    const target = nextPdfStep([user], 'Page 1: …Old Keep…')
    expect(localExactPdfStep(nextPdfStep(target, 'Page 2: …Keep…'), pdfTools)).toMatchObject({
      text: expect.stringContaining('보존할 문구를 확인하지 못해'),
    })
  })

  it('stops after edit failure and refuses unverified receipts', () => {
    const target = nextPdfStep([user], 'Page 1: …Old Keep…')
    const preserved = nextPdfStep(target, 'Page 1: …Old Keep…')
    expect(
      localExactPdfStep(nextPdfStep(preserved, 'Document is read-only', true), pdfTools),
    ).toMatchObject({ text: expect.stringContaining('완료하지 못했습니다') })
    expect(localExactPdfStep(nextPdfStep(preserved, 'Changed edit.pdf'), pdfTools)).toMatchObject({
      text: expect.stringContaining('확인하지 못했습니다'),
    })
  })

  it('ignores requests that could include another operation or an unavailable tool', () => {
    for (const instruction of [
      '1페이지의 Old를 New로 바꾸지 마.',
      '1페이지의 Old를 New로 바꿔 줘. Keep도 바꿔.',
      '1페이지의 Old를 New로 바꿔 줘.\n2페이지도 수정해.',
      '1페이지의 Old를 New로 바꿔 줘.\n\n2페이지도 수정해.',
      '1페이지의 Old를 New로 바꿔 줄래?',
    ]) {
      expect(localExactPdfStep([{ role: 'user', text: instruction }], pdfTools)).toBeNull()
    }
    expect(localExactPdfStep([user], pdfTools.slice(0, 1))).toBeNull()
    expect(
      localExactPdfStep([{ ...user, images: [{ base64: '', mime: 'image/png' }] }], pdfTools),
    ).toBeNull()
  })
})

const slideBefore =
  'Canvas 1280×720px (1 px = 9525 EMU)\n' +
  'e_1 | shape | pos(10,20) size 200×100\nOld\n---\n' +
  'e_2 | shape | pos(10,140) size 200×100\nKeep'
const slideAfter = slideBefore.replace('\nOld\n---', '\nReady\n---')

function nextSlideStep(messages: AgentMessage[], output: string, isError = false): AgentMessage[] {
  const next = localExactSlideStep(messages, slideTools)
  if (!next || !('call' in next)) throw new Error(`Expected slide call: ${JSON.stringify(next)}`)
  return [
    ...messages,
    { role: 'assistant', text: '', toolCalls: [next.call] },
    { role: 'tool', results: [{ id: next.call.id, name: next.call.name, output, isError }] },
  ]
}

describe('local PPTX exact single-slide text replacement', () => {
  const user: AgentMessage = {
    role: 'user',
    text: '첫 번째 슬라이드의 Old를 Ready로 바꿔 줘. Keep은 그대로 둬.\n\n<deck outline>\nPage 1: Old, Keep\n</deck outline>',
  }

  it('reads page, edits an observed unique editable shape atomically, then verifies all texts', () => {
    expect(localExactSlideStep([user], slideTools)).toMatchObject({
      call: { name: 'read_slide', input: { slideIndex: 0 } },
    })
    const before = nextSlideStep([user], slideBefore)
    expect(localExactSlideStep(before, slideTools)).toMatchObject({
      call: {
        name: 'execute_slide_script',
        input: { slideIndex: 0, code: expect.stringContaining('setText(matches[0].id, "Ready")') },
      },
    })
    const written = nextSlideStep(before, 'Applied the edit script to page 1: text 1 item(s).')
    expect(localExactSlideStep(written, slideTools)).toMatchObject({
      call: { name: 'read_slide', input: { slideIndex: 0 } },
    })
    const verified = nextSlideStep(written, slideAfter)
    expect(localExactSlideStep(verified, slideTools)).toEqual({
      text: '1번 슬라이드의 Old를 Ready로 변경하고 다른 문구를 확인했습니다.',
    })
    const olderTurn: AgentMessage[] = [
      { role: 'user', text: '첫 번째 슬라이드의 Old를 New로 바꿔 줘.' },
      {
        role: 'tool',
        results: [
          {
            id: 'local-exact-slide-before-earlier',
            name: 'read_slide',
            output: slideBefore.replace('Keep', 'Another'),
          },
        ],
      },
    ]
    expect(localExactSlideStep([...olderTurn, ...verified], slideTools)).toMatchObject({
      text: expect.stringContaining('변경하고 다른 문구를 확인했습니다'),
    })
  })

  it('refuses ambiguous/missing/incomplete/locked content before mutation', () => {
    const changed = slideBefore.replace('\nOld\n---', '\nOther\n---')
    const duplicate = slideBefore + '\n---\ne_3 | shape | pos(300,100) size 100×100\nOld'
    const locked = slideBefore.replace(
      'e_1 | shape |',
      'e_1 | shape | layout decoration (read-only) |',
    )
    for (const inventory of [
      changed,
      duplicate,
      locked,
      slideBefore.slice(0, 30),
      slideBefore.replace('\nKeep', '\nChanged'),
      slideBefore + '\n---\ntruncated',
    ]) {
      expect(localExactSlideStep(nextSlideStep([user], inventory), slideTools)).toMatchObject({
        text: expect.stringContaining('변경하지 않았습니다'),
      })
    }
  })

  it('does not accept unsafe edits, unrelated tool results, or unchecked outcomes', () => {
    const invalid = [
      '첫 번째 슬라이드의 Old를 Ready로 바꾸지 마.',
      '첫 번째 슬라이드의 Old를 Ready로 바꿔 줘. Keep도 바꿔.',
      '첫 번째 슬라이드의 Old를 Ready로 바꿔 줄래?',
      '첫 번째 슬라이드의 Old를 Ready로 바꿔 줘.\n두 번째 슬라이드도 바꿔.',
    ]
    for (const text of invalid) {
      expect(localExactSlideStep([{ role: 'user', text }], slideTools)).toBeNull()
    }
    expect(
      localExactSlideStep(
        [{ role: 'user', text: '첫 번째 슬라이드의 Old를 Ready로 바꿔 줘.\n\n그 외도 바꿔.' }],
        slideTools,
      ),
    ).toBeNull()
    expect(localExactSlideStep([user], slideTools.slice(1))).toBeNull()
    const before = nextSlideStep([user], slideBefore)
    const writeFailure = nextSlideStep(before, 'The page is unchanged', true)
    expect(localExactSlideStep(writeFailure, slideTools)).toMatchObject({
      text: expect.stringContaining('완료하지 못했습니다'),
    })
    const noop = nextSlideStep(before, 'Script finished but called no edit primitives')
    expect(localExactSlideStep(noop, slideTools)).toMatchObject({
      text: expect.stringContaining('적용을 확인하지 못했습니다'),
    })
    const written = nextSlideStep(before, 'Applied the edit script to page 1: text 1 item(s).')
    const wrongFinal = nextSlideStep(written, slideBefore.replace('\nKeep', '\nBroken'))
    expect(localExactSlideStep(wrongFinal, slideTools)).toMatchObject({
      text: expect.stringContaining('예상과 달라'),
    })
  })
})

function nextWorkbookStep(
  messages: AgentMessage[],
  output: string,
  isError = false,
): AgentMessage[] {
  const next = localExactWorkbookStep(messages, workbookTools)
  if (!next || !('call' in next))
    throw new Error(`Expected a workbook tool call: ${JSON.stringify(next)}`)
  return [
    ...messages,
    { role: 'assistant', text: '', toolCalls: [next.call] },
    { role: 'tool', results: [{ id: next.call.id, name: next.call.name, output, isError }] },
  ]
}

describe('local XLSX exact single-cell edit', () => {
  const request = 'Sheet1의 A1 셀에 있는 Old를 Ready로 바꿔 줘. B1 셀 값 10은 그대로 둬.'
  const user: AgentMessage = {
    role: 'user',
    text: `${request}\n\nActive sheet: Sheet1 (id=sheet-7, data extent about 1 rows × 2 columns)`,
  }

  it('checks the real sheet ID, old/preserved cells, apply receipt and read-back', () => {
    let messages = nextWorkbookStep(
      [user],
      'Active sheet: Sheet1 (id=sheet-7, data extent about 1 rows × 2 columns)',
    )
    expect(localExactWorkbookStep(messages, workbookTools)).toMatchObject({
      call: { name: 'read_cells', input: { sheetId: 'sheet-7', addresses: ['A1', 'B1'] } },
    })
    messages = nextWorkbookStep(messages, 'A1: Old\nB1: 10')
    expect(localExactWorkbookStep(messages, workbookTools)).toMatchObject({
      call: {
        name: 'propose_operations',
        input: {
          operations: [{ op: 'set_cell', sheetId: 'sheet-7', address: 'A1', value: 'Ready' }],
        },
      },
    })
    messages = nextWorkbookStep(messages, 'Auto-applied 1 change(s)')
    expect(localExactWorkbookStep(messages, workbookTools)).toMatchObject({
      call: { name: 'read_cells', input: { sheetId: 'sheet-7', addresses: ['A1', 'B1'] } },
    })
    messages = nextWorkbookStep(messages, 'A1: Ready\nB1: 10')
    expect(localExactWorkbookStep(messages, workbookTools)).toEqual({
      text: 'Sheet1!A1 값을 Ready로 변경하고 확인했습니다.',
    })
  })

  it('refuses to write on mismatched values, missing sheets, or failed tools', () => {
    const context = nextWorkbookStep([user], 'Active sheet: Sheet2 (id=sheet-8)')
    expect(localExactWorkbookStep(context, workbookTools)).toEqual({
      text: '시트 Sheet1을(를) 확인하지 못해 변경하지 않았습니다.',
    })
    const reads = nextWorkbookStep([user], 'Active sheet: Sheet1 (id=sheet-7)')
    expect(
      localExactWorkbookStep(nextWorkbookStep(reads, 'A1: Changed\nB1: 10'), workbookTools),
    ).toMatchObject({
      text: expect.stringContaining('일치하지 않아 변경하지 않았습니다'),
    })
    expect(
      localExactWorkbookStep(nextWorkbookStep(reads, 'A1: Old\nB1: 11'), workbookTools),
    ).toMatchObject({
      text: expect.stringContaining('보존 조건을 확인하지 못해'),
    })
    const write = nextWorkbookStep(reads, 'A1: Old\nB1: 10')
    const failed = nextWorkbookStep(write, 'Apply failed — the workbook is UNCHANGED', true)
    expect(localExactWorkbookStep(failed, workbookTools)).toEqual({
      text: '셀 변경을 완료하지 못했습니다. Apply failed — the workbook is UNCHANGED',
    })
    const applied = nextWorkbookStep(write, 'Auto-applied 1 change(s)')
    expect(
      localExactWorkbookStep(nextWorkbookStep(applied, 'A1: Old\nB1: 10'), workbookTools),
    ).toMatchObject({
      text: expect.stringContaining('변경 후 값을 확인하지 못했습니다'),
    })
  })

  it('handles other named sheets from the real workbook context', () => {
    const other: AgentMessage = {
      role: 'user',
      text: '검토의 C3 셀에 있는 Old를 New로 바꿔 줘.\n\nActive sheet: Sheet1 (id=s1)\nAll sheets: Sheet1 (id=s1), 검토 (id=s2)',
    }
    const history = nextWorkbookStep(
      [other],
      'Active sheet: Sheet1 (id=s1)\nAll sheets: Sheet1 (id=s1), 검토 (id=s2)',
    )
    expect(localExactWorkbookStep(history, workbookTools)).toMatchObject({
      call: { input: { sheetId: 's2', addresses: ['C3'] } },
    })
  })

  it('leaves ambiguous, negative, compound, or unsupported instructions to the model', () => {
    for (const instruction of [
      'Sheet1의 A1 셀에 있는 Old를 Ready로 바꾸지 마.',
      `${request} C1도 변경해 줘.`,
      'Sheet1의 A1 셀에 있는 Old를 Ready로 바꿔 줄래?',
      'Sheet1의 A1 셀에 있는 Old를 Ready로 바꿔 줘. B1 값도 바꿔.',
    ]) {
      expect(
        localExactWorkbookStep(
          [{ ...user, text: `${instruction}\n\nActive sheet: Sheet1 (id=s1)` }],
          workbookTools,
        ),
      ).toBeNull()
    }
    expect(localExactWorkbookStep([user], workbookTools.slice(1))).toBeNull()
    expect(localExactWorkbookStep([{ role: 'user', text: request }], workbookTools)).toBeNull()
  })
})

function plan(text: string, tools: AgentToolDef[] = [hwp], history: AgentMessage[] = []) {
  return planLocalExactEdit([...history, { role: 'user', text }], tools)
}

describe('local Korean exact edit optimization', () => {
  it('finishes the tool-result turn only for a matching deterministic edit', () => {
    const call = plan('"가"를 "나"로 바꿔 줘.')!
    const history: AgentMessage[] = [
      { role: 'user', text: '"가"를 "나"로 바꿔 줘.' },
      { role: 'assistant', text: '', toolCalls: [call] },
      { role: 'tool', results: [{ id: call.id, name: call.name, output: '1 occurrence changed' }] },
    ]
    expect(localExactEditFollowup(history)).toBe('요청하신 문구를 변경했습니다.')
    const failed: AgentMessage[] = [
      ...history.slice(0, -1),
      {
        role: 'tool',
        results: [{ id: call.id, name: call.name, output: 'Ambiguous match', isError: true }],
      },
    ]
    expect(localExactEditFollowup(failed)).toContain('Ambiguous match')
    expect(localExactEditFollowup(history.slice(0, -1))).toBeNull()
    expect(
      localExactEditFollowup([
        ...history.slice(0, -1),
        { role: 'tool', results: [{ id: 'other', name: call.name, output: 'updated' }] },
      ]),
    ).toBeNull()
    expect(
      localExactEditFollowup([
        history[0],
        { role: 'assistant', text: '', toolCalls: [{ ...call, id: 'ordinary-model-tool' }] },
        {
          role: 'tool',
          results: [{ id: 'ordinary-model-tool', name: call.name, output: 'updated' }],
        },
      ]),
    ).toBeNull()
  })

  it('generates one validated HWP edit with exact punctuation and spacing', () => {
    const call = plan(
      '문서의 "검토 부탁드립니다."를 "검토하여 주시기 바랍니다."로 정확히 한 번 바꿔 줘.',
    )
    expect(call?.name).toBe('replace_text')
    expect(call?.id).toEqual(expect.any(String))
    expect(call?.input).toEqual({
      find: '검토 부탁드립니다.',
      replace: '검토하여 주시기 바랍니다.',
    })
  })

  it('supports Korean quotation marks, only this phrase, and previous unrelated history', () => {
    const call = plan(
      '날짜는 그대로 두고 “참석 부탁드립니다.”만 “참석하여 주시기 바랍니다.”로 교체해.',
      [hwp],
      [{ role: 'assistant', text: '완료했습니다.' }],
    )
    expect(call?.input).toEqual({
      find: '참석 부탁드립니다.',
      replace: '참석하여 주시기 바랍니다.',
    })
  })

  it('routes exact quoted DOCX edits through one-match guarded ops', () => {
    expect(
      plan('예산 숫자는 바꾸지 말고 "협조 부탁드립니다."를 "협조하여 주시기 바랍니다."로 바꿔.', [
        docs,
      ])?.input,
    ).toEqual({
      ops: [
        {
          op: 'findReplace',
          find: '협조 부탁드립니다.',
          replace: '협조하여 주시기 바랍니다.',
          matchCase: true,
          exactlyOnce: true,
        },
      ],
    })
  })

  it('extracts a short edit from the DOCX snapshot AgentLoop appends', () => {
    const message =
      '날짜와 예산은 그대로 두고 "협조 부탁드립니다."를 "협조하여 주시기 바랍니다."로 바꿔 줘.\n\n' +
      'Document block list:\nThe document has 4 blocks, listed below (index|type|content preview):\n' +
      '3|p|협조 부탁드립니다.'
    expect(planLocalExactEdit([{ role: 'user', text: message }], [docs])?.name).toBe('apply_ops')
    expect(
      planLocalExactEdit(
        [{ role: 'user', text: '"가"를 "나"로 바꿔 줘.\n\n그리고 날짜도 변경해.' }],
        [docs],
      ),
    ).toBeNull()
  })

  it('uses one exact document block for a short Korean color change', async () => {
    const snapshot =
      'Document block list:\nThe document has 2 blocks, listed below (index|type|content preview):\n' +
      '0|p|행사일은 12월 3일입니다.\n1|p|중요 공지\n' +
      'Full-text stats: words 6, characters (no spaces) 23, characters (with spaces) 25\n' +
      'No selection; cursor is in block 0'
    const request = `문서에서 중요 공지 문단의 글자색을 빨간색으로 변경해 주세요.\n\n${snapshot}`
    const call = planLocalExactFormat([{ role: 'user', text: request }], [docs])!
    expect(call?.name).toBe('apply_ops')
    expect(call.input).toEqual({
      ops: [{ op: 'setFont', target: { blockIndexes: [1] }, color: '#FF0000' }],
    })
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: {
        type: 'doc',
        content: [
          { type: 'docParagraph', content: [{ type: 'text', text: '행사일은 12월 3일입니다.' }] },
          { type: 'docParagraph', content: [{ type: 'text', text: '중요 공지' }] },
        ],
      },
    })
    try {
      const outcome = await executeTool(editor, call, { bullet: null, ordered: null })
      expect(outcome.isError).not.toBe(true)
      const first = editor.state.doc.child(0)
      const second = editor.state.doc.child(1)
      expect(first.firstChild?.marks).toHaveLength(0)
      expect(first.textContent).toBe('행사일은 12월 3일입니다.')
      expect(
        second.firstChild?.marks.find((mark) => mark.type.name === 'docTextStyle')?.attrs.color,
      ).toBe('FF0000')
      expect(second.textContent).toBe('중요 공지')
      const history: AgentMessage[] = [
        { role: 'user', text: request },
        { role: 'assistant', text: '', toolCalls: [call] },
        { role: 'tool', results: [{ id: call.id, name: call.name, output: 'changed' }] },
      ]
      expect(localExactEditFollowup(history)).toBe('요청하신 글자색을 적용했습니다.')
    } finally {
      editor.destroy()
    }
  })

  it('does not style ambiguous, unverified, or compound color requests', () => {
    const beginning =
      'Document block list:\nThe document has 2 blocks, listed below (index|type|content preview):\n'
    const request = '문서에서 중요 공지 문단의 글자색을 빨간색으로 변경해 주세요.'
    const tryPlan = (instruction: string, snapshot: string) =>
      planLocalExactFormat([{ role: 'user', text: `${instruction}\n\n${snapshot}` }], [docs])
    expect(tryPlan(request, `${beginning}0|p|중요 공지\n1|p|중요 공지`)).toBeNull()
    expect(tryPlan(request, `${beginning}0|p|일정\n…(1 blocks elided)…`)).toBeNull()
    expect(tryPlan(request, `${beginning}0|p|중요 공지\n1|p|중요 공지 문구`)).not.toBeNull()
    expect(
      tryPlan(request + ' 그리고 날짜도 변경해 주세요.', `${beginning}0|p|일정\n1|p|중요 공지`),
    ).toBeNull()
    expect(
      tryPlan('중요 공지 문단의 글자색을 바꾸지 마세요.', `${beginning}0|p|일정\n1|p|중요 공지`),
    ).toBeNull()
    expect(planLocalExactFormat([{ role: 'user', text: request }], [docs])).toBeNull()
  })

  it('executes the planned tool in the real DOCX editor, preserving unrelated values', async () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'docParagraph',
            content: [{ type: 'text', text: '2026년 12월 3일 / 350,000원 / 협조 부탁드립니다.' }],
          },
          {
            type: 'docParagraph',
            content: [{ type: 'text', text: '새빛초등학교 / 이 문장은 유지합니다.' }],
          },
        ],
      },
    })
    try {
      const call = plan(
        '날짜와 금액은 그대로 두고 "협조 부탁드립니다."를 "협조하여 주시기 바랍니다."로 바꿔 줘.',
        [docs],
      )
      expect(call?.name).toBe('apply_ops')
      const result = await executeTool(editor, call!, { bullet: null, ordered: null })
      expect(result.isError).not.toBe(true)
      expect(result.mutated).toBe(true)
      expect(editor.state.doc.child(0).textContent).toBe(
        '2026년 12월 3일 / 350,000원 / 협조하여 주시기 바랍니다.',
      )
      expect(editor.state.doc.child(1).textContent).toBe('새빛초등학교 / 이 문장은 유지합니다.')
    } finally {
      editor.destroy()
    }
  })

  it('does not force edits on ambiguous, negative, compound, or context requests', () => {
    const rejected = [
      '"가"를 "나"로 바꿔도 돼?',
      '"가"를 "나"로 바꾸지 마.',
      '"가"를 "나"로 바꾸면 안 돼.',
      '"가"를 "나"로 바꿔 줘, 그리고 날짜도 바꿔.',
      '"가"를 "나"로 교체하지 마세요.',
      '"가"를 "나"로 모두 바꿔 줘.',
      '"가"를 "나"로 바꿔, "다"는 유지해.',
      '"가"를 "나"로 바꿔.\n# 다른 지침',
      '"가"를 "나"로 교체하지 말아 줘.',
      '"가"를 "가"로 바꿔 줘.',
      '"가"를 "나"로 바꿔 줘. "다"도 바꿔 줘.',
    ]
    for (const text of rejected) expect(plan(text), text).toBeNull()
    expect(plan('"가"를 "나"로 바꿔 줘.', [docs])?.name).toBe('apply_ops')
    expect(
      planLocalExactEdit(
        [
          { role: 'user', text: '"가"를 "나"로 바꿔 줘.' },
          { role: 'tool', results: [{ id: 'x', name: 'replace_text', output: 'updated' }] },
        ],
        [hwp],
      ),
    ).toBeNull()
    expect(
      planLocalExactEdit(
        [
          {
            role: 'user',
            text: '"가"를 "나"로 바꿔 줘.',
            images: [{ mime: 'image/png', base64: 'a' }],
          },
        ],
        [hwp],
      ),
    ).toBeNull()
  })
})

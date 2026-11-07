import { randomUUID } from 'node:crypto'
import type { AgentMessage, AgentToolCall, AgentToolDef } from '@genoffice/agent-core'

const EXACT_EDIT_ID_PREFIX = 'local-exact-'
const CONTEXTUAL_EDIT_ID_PREFIX = 'local-contextual-'
const EXACT_FORMAT_ID_PREFIX = 'local-exact-format-'
const EXACT_XLSX_ID_PREFIX = 'local-exact-xlsx-'
const EXACT_SLIDE_ID_PREFIX = 'local-exact-slide-'
const EXACT_PDF_ID_PREFIX = 'local-exact-pdf-'

/** A small local model often answers a natural-language change request in
 * chat instead of calling a tool. Resolve a *single, unambiguous* edit from
 * the live HWP snapshot, including an affirmative follow-up to a question.
 * Neither old chat messages nor model output are trusted as document state. */
export function planLocalHwpContextualEdit(
  messages: AgentMessage[],
  tools: AgentToolDef[],
): AgentToolCall | null {
  if (!tools.some((tool) => tool.name === 'replace_text')) return null
  const last = messages.at(-1)
  if (last?.role !== 'user' || last.images?.length) return null
  const separator = '\n\n## Open document\n'
  const splitAt = last.text.indexOf(separator)
  if (splitAt < 0) return null
  const snapshot = last.text.slice(splitAt + 2)
  const complete = snapshot.match(
    /^## Open document\nLength: (\d+) characters\.[\s\S]*?\nText \(complete\):\n/,
  )
  if (!complete) return null
  const textLength = Number(complete[1])
  if (!Number.isSafeInteger(textLength) || textLength > 120_000) return null
  // The editor appends form analysis and selection context *after* the full
  // text. Parse exactly the editor-reported number of characters: after a
  // first replacement the newly selected text may become an extra section.
  // Treat those sections as metadata, never as a part of the document text.
  const rest = snapshot.slice(complete[0].length)
  if (rest.length < textLength) return null
  const document = rest.slice(0, textLength)
  const appendix = rest.slice(textLength)
  if (appendix && !/^\n\n## (?:The form of this document|Selected text)\n/.test(appendix))
    return null

  let instruction = last.text.slice(0, splitAt).trim()
  if (
    /^(?:(?:아니|그냥|제발)\s*)*(?:바꾸라고|바꿔\s*줘|수정하라고|수정해\s*줘|고치라고|고쳐\s*줘|편집하라고)[.!\s]*$/i.test(
      instruction,
    )
  ) {
    const previous = messages
      .slice(0, -1)
      .reverse()
      .find((entry) => entry.role === 'user')
    if (previous?.role !== 'user' || previous.images?.length) return null
    const previousInstruction = previous.text.split(separator, 1)[0].trim()
    instruction = previousInstruction
      .replace(
        /(?:으?로)\s*(?:바꿀\s*수\s*있어|바꾸는\s*게\s*어때|바꿀까|수정할까)\s*\?$/u,
        '로 바꿔줘',
      )
      .replace(/(?:으?로)\s*바꾸면\s*어때\s*\?$/u, '로 바꿔줘')
  }
  if (
    !instruction ||
    instruction.length > 400 ||
    instruction.includes('\n') ||
    /(?:하지\s*마|하지\s*말|취소|제외|바꾸지|수정하지|고치지|그대로|\?|？|전체|모두|일괄)/.test(
      instruction,
    )
  )
    return null

  const end = '(?:\\s*(?:줘|주세요|주십시오|주시기\\s*바랍니다))?[.!。]?\\s*$'
  const verb = '(?:바꿔|바꾸어|변경해|수정해|고쳐|교체해)'
  const labels = [
    '운영 목적',
    '추진 목적',
    '교육 목표',
    '안전 관리',
    '운영 원칙',
    '행사일',
    '일시',
    '일정',
    '장소',
    '예산',
    '제목',
    '목적',
    '대상',
  ]
  const labelPart = labels.join('|')
  const labelled = new RegExp(
    `^(?:(?:이|현재|기존)\\s*(?:문서|계획서)(?:에서|의)?\\s*)?(${labelPart})(?:을|를|은|는)?\\s+(.{1,180}?)(?:으?로)\\s*${verb}${end}`,
    'u',
  )
  const match = instruction.match(labelled)
  let find: string | undefined
  let replace: string | undefined
  if (match) {
    const [, label, newValue] = match
    const lines = document.split('\n')
    const candidates =
      label === '제목'
        ? lines.filter((line) => line.trim()).slice(0, 1)
        : lines.filter((line) => line.includes(label))
    if (candidates.length !== 1 || !candidates[0]) return null
    find = candidates[0]
    if (label === '제목') replace = newValue.trim()
    else {
      const index = find.indexOf(label) + label.length
      const suffix = find.slice(index)
      const divider = suffix.match(/^(\s*(?::|：|=|은|는)\s*|\s+)/)
      if (!divider || !suffix.slice(divider[0].length).trim()) return null
      replace = find.slice(0, index) + divider[0] + newValue.trim()
    }
  } else {
    // For plain Korean requests like '협조 부탁드립니다.를 협조하여
    // 주시기 바랍니다.로 바꿔줘', use the current document as the sole match source.
    const plain = new RegExp(
      `^(?:이\\s*문서에서\\s*)?(.{2,140}?)(?:을|를)\\s+(.{1,180}?)(?:으?로)\\s*${verb}${end}`,
      'u',
    )
    const parts = instruction.match(plain)
    if (!parts) return null
    find = parts[1].trim()
    replace = parts[2].trim()
  }
  if (!find || !replace || find === replace || /[\r\n]/.test(replace)) return null
  // Exactly one occurrence, independently of any claim in chat history.
  const first = document.indexOf(find)
  if (first < 0 || document.indexOf(find, first + find.length) >= 0) return null
  return {
    id: `${CONTEXTUAL_EDIT_ID_PREFIX}${randomUUID()}`,
    name: 'replace_text',
    input: { find, replace },
  }
}

interface ExactPdfRequest {
  page: number
  oldText: string
  newText: string
  preservedText?: string
}

type ExactPdfStep = { call: AgentToolCall } | { text: string }

/** Only a single, explicit page-scoped substitution enters this path. */
function exactPdfRequest(message: AgentMessage): ExactPdfRequest | null {
  if (message.role !== 'user' || message.images?.length) return null
  const divider = message.text.indexOf('\n\n')
  // AgentLoop appends the PDF editor's document context after the instruction.
  // Only recognize that known context, never a second user instruction.
  if (
    divider >= 0 &&
    !/^Current document: ".+", [1-9][0-9]* pages; the user is viewing page [1-9][0-9]*\.(?:\n|$)/.test(
      message.text.slice(divider + 2),
    )
  )
    return null
  const instruction = (divider >= 0 ? message.text.slice(0, divider) : message.text).trim()
  if (instruction.length > 250 || instruction.includes('\n')) return null
  const match = instruction.match(
    /^([1-9][0-9]{0,2})\s*페이지의\s*([\p{L}\p{N}_-]{1,60})(?:를|을)\s*([\p{L}\p{N}_-]{1,60})로\s*(?:바꿔|변경해|교체해)\s*(?:줘|주세요)?[.!]?\s*(?:([\p{L}\p{N}_-]{1,60})(?:은|는)\s*그대로\s*둬[.!]?)?$/u,
  )
  if (!match || match[2] === match[3] || match[4] === match[2] || match[4] === match[3]) return null
  return {
    page: Number(match[1]),
    oldText: match[2],
    newText: match[3],
    ...(match[4] ? { preservedText: match[4] } : {}),
  }
}

function exactPdfCall(phase: string, name: string, input: Record<string, unknown>): AgentToolCall {
  return { id: `${EXACT_PDF_ID_PREFIX}${phase}-${randomUUID()}`, name, input }
}

/** search_text returns one "Page N: …excerpt…" line per indexed match.
 * Refuse truncated, unrecognized, or error-shaped results. */
function pdfSearchHits(output: string): { page: number; excerpt: string }[] | null {
  const lines = output.split('\n')
  if (lines.length < 1 || lines.length > 40) return null
  const hits: { page: number; excerpt: string }[] = []
  for (const line of lines) {
    const match = line.match(/^Page ([1-9][0-9]*): …(.+)…$/u)
    if (!match) return null
    hits.push({ page: Number(match[1]), excerpt: match[2] })
  }
  return hits
}

/** Run editor-owned PDF tools through AgentLoop, using search results from
 * this turn to locate a unique target. The PDF index is cached until save,
 * so a post-write search would show stale original content; check the real
 * edit_text receipt and leave persisted-byte verification to save/reopen. */
export function localExactPdfStep(
  messages: AgentMessage[],
  tools: AgentToolDef[],
): ExactPdfStep | null {
  if (!['search_text', 'edit_text'].every((name) => tools.some((tool) => tool.name === name)))
    return null
  const last = messages.at(-1)
  if (!last) return null
  if (last.role === 'user') {
    const request = exactPdfRequest(last)
    return request
      ? { call: exactPdfCall('target', 'search_text', { query: request.oldText }) }
      : null
  }
  const previous = messages.at(-2)
  if (last.role !== 'tool' || previous?.role !== 'assistant') return null
  const call = previous.toolCalls?.length === 1 ? previous.toolCalls[0] : null
  const result = last.results.length === 1 ? last.results[0] : null
  if (
    !call ||
    !result ||
    !call.id.startsWith(EXACT_PDF_ID_PREFIX) ||
    call.id !== result.id ||
    call.name !== result.name
  )
    return null
  const currentUser = [...messages].reverse().find((m) => m.role === 'user')
  const request = currentUser ? exactPdfRequest(currentUser) : null
  if (!request) return { text: 'PDF 편집 요청을 검증할 수 없어 중단했습니다.' }
  if (result.isError) return { text: `PDF 편집을 완료하지 못했습니다. ${result.output}` }

  if (call.name === 'search_text' && call.id.startsWith(`${EXACT_PDF_ID_PREFIX}target-`)) {
    if (call.input.query !== request.oldText)
      return { text: '검색 대상이 달라 변경하지 않았습니다.' }
    const hits = pdfSearchHits(result.output)
    if (
      !hits ||
      hits.length !== 1 ||
      hits[0].page !== request.page ||
      !hits[0].excerpt.includes(request.oldText)
    ) {
      return {
        text: '해당 페이지에서 수정할 문구를 정확히 한 곳으로 확인하지 못해 변경하지 않았습니다.',
      }
    }
    return request.preservedText
      ? { call: exactPdfCall('preserved', 'search_text', { query: request.preservedText }) }
      : {
          call: exactPdfCall('write', 'edit_text', {
            page: request.page,
            old_text: request.oldText,
            new_text: request.newText,
            occurrence: 1,
          }),
        }
  }
  if (call.name === 'search_text' && call.id.startsWith(`${EXACT_PDF_ID_PREFIX}preserved-`)) {
    if (call.input.query !== request.preservedText)
      return { text: '보존 문구 검색이 달라 변경하지 않았습니다.' }
    const hits = pdfSearchHits(result.output)
    if (
      !hits ||
      !hits.some((hit) => hit.page === request.page && hit.excerpt.includes(request.preservedText!))
    ) {
      return { text: '해당 페이지의 보존할 문구를 확인하지 못해 변경하지 않았습니다.' }
    }
    return {
      call: exactPdfCall('write', 'edit_text', {
        page: request.page,
        old_text: request.oldText,
        new_text: request.newText,
        occurrence: 1,
      }),
    }
  }
  if (call.name === 'edit_text' && call.id.startsWith(`${EXACT_PDF_ID_PREFIX}write-`)) {
    if (
      call.input.page !== request.page ||
      call.input.old_text !== request.oldText ||
      call.input.new_text !== request.newText ||
      call.input.occurrence !== 1 ||
      !result.output.startsWith(
        `Replaced occurrence 1 of "${request.oldText}" on page ${request.page} (unsaved;`,
      )
    ) {
      return { text: 'PDF 변경 결과를 확인하지 못했습니다. 저장 전에 내용을 확인해 주세요.' }
    }
    return {
      text: `${request.page}페이지의 ${request.oldText}를 ${request.newText}로 변경했습니다. 파일에 반영하려면 저장해 주세요.`,
    }
  }
  return null
}

interface ExactSlideRequest {
  slideIndex: number
  oldText: string
  newText: string
  preservedText?: string
}

type ExactSlideStep = { call: AgentToolCall } | { text: string }

/** Recognize only a complete, affirmative, single-slide text replacement. */
function exactSlideRequest(message: AgentMessage): ExactSlideRequest | null {
  if (message.role !== 'user' || message.images?.length) return null
  const divider = message.text.indexOf('\n\n')
  const context = divider >= 0 ? message.text.slice(divider + 2) : ''
  // Slides appends this verified, editor-produced outline to each instruction.
  // Reject arbitrary multi-paragraph user input instead of silently dropping it.
  if (
    divider >= 0 &&
    (!context.startsWith('<deck outline>\n') || !context.includes('\n</deck outline>'))
  )
    return null
  const instruction = (divider >= 0 ? message.text.slice(0, divider) : message.text).trim()
  if (instruction.length > 250 || instruction.includes('\n')) return null
  const match = instruction.match(
    /^(첫 번째|두 번째|세 번째|[1-9][0-9]{0,2}번(?:째)?)\s*슬라이드의\s*([\p{L}\p{N}_-]{1,60})(?:를|을)\s*([\p{L}\p{N}_-]{1,60})로\s*(?:바꿔|변경해|교체해)\s*(?:줘|주세요)?[.!]?\s*(?:([\p{L}\p{N}_-]{1,60})(?:은|는)\s*그대로\s*둬[.!]?)?$/u,
  )
  if (!match || match[2] === match[3]) return null
  const ordinal = match[1]
  const pageNumber =
    ordinal === '첫 번째'
      ? 1
      : ordinal === '두 번째'
        ? 2
        : ordinal === '세 번째'
          ? 3
          : Number.parseInt(ordinal, 10)
  if (
    !Number.isSafeInteger(pageNumber) ||
    pageNumber < 1 ||
    pageNumber > 999 ||
    match[4] === match[2]
  )
    return null
  return {
    slideIndex: pageNumber - 1,
    oldText: match[2],
    newText: match[3],
    ...(match[4] ? { preservedText: match[4] } : {}),
  }
}

interface SlideElementText {
  id: string
  type: string
  text: string
  locked: boolean
}

/** Parse the actual read_slide inventory; reject partial/unrecognized output. */
function slideElementTexts(output: string): SlideElementText[] | null {
  if (output.length > 500_000 || !/^Canvas [^\n]+ \(1 px = [^\n]+ EMU\)\n/.test(output)) return null
  const body = output.slice(output.indexOf('\n') + 1)
  if (body === '(no elements on this page)') return []
  if (
    !body ||
    /\n\([^\n]* colors not available\)$/.test(body) ||
    /\[Context abbreviated|truncat|\.\.\./i.test(body)
  )
    return null
  const elements: SlideElementText[] = []
  const ids = new Set<string>()
  for (const part of body.split('\n---\n')) {
    const breakAt = part.indexOf('\n')
    const header = breakAt < 0 ? part : part.slice(0, breakAt)
    const match = header.match(/^([A-Za-z0-9_.:-]{1,128}) \| ([a-z][a-z0-9_-]*)(?: \| (.*))?$/)
    if (!match || !header.includes(' | pos(') || ids.has(match[1])) return null
    ids.add(match[1])
    const text = breakAt < 0 ? '' : part.slice(breakAt + 1)
    if (breakAt < 0 && !header.endsWith(' | (no text)')) return null
    elements.push({
      id: match[1],
      type: match[2],
      text,
      locked: /layout decoration \(read-only\)|nested in a sub-group \(read-only/.test(header),
    })
  }
  return elements
}

function exactSlideCall(
  phase: string,
  name: string,
  input: Record<string, unknown>,
): AgentToolCall {
  return { id: `${EXACT_SLIDE_ID_PREFIX}${phase}-${randomUUID()}`, name, input }
}

/** Use the slide editor's atomic script executor and verify the saved edit in
 * a fresh read. No source element IDs or success claims come from the model. */
export function localExactSlideStep(
  messages: AgentMessage[],
  tools: AgentToolDef[],
): ExactSlideStep | null {
  if (
    !['read_slide', 'execute_slide_script'].every((name) =>
      tools.some((tool) => tool.name === name),
    )
  )
    return null
  const last = messages.at(-1)
  if (!last) return null
  if (last.role === 'user') {
    const request = exactSlideRequest(last)
    return request
      ? { call: exactSlideCall('before', 'read_slide', { slideIndex: request.slideIndex }) }
      : null
  }
  const previous = messages.at(-2)
  if (last.role !== 'tool' || previous?.role !== 'assistant') return null
  const call = previous.toolCalls?.length === 1 ? previous.toolCalls[0] : null
  const result = last.results.length === 1 ? last.results[0] : null
  if (
    !call ||
    !result ||
    !call.id.startsWith(EXACT_SLIDE_ID_PREFIX) ||
    call.id !== result.id ||
    call.name !== result.name
  )
    return null
  const currentUser = [...messages].reverse().find((m) => m.role === 'user')
  const request = currentUser ? exactSlideRequest(currentUser) : null
  if (!request) return { text: '슬라이드 편집 요청을 검증할 수 없어 중단했습니다.' }
  if (result.isError) return { text: `슬라이드 편집을 완료하지 못했습니다. ${result.output}` }
  if (call.input.slideIndex !== request.slideIndex)
    return { text: '슬라이드 번호가 일치하지 않아 중단했습니다.' }

  if (call.name === 'read_slide' && call.id.startsWith(`${EXACT_SLIDE_ID_PREFIX}before-`)) {
    const elements = slideElementTexts(result.output)
    if (!elements) return { text: '슬라이드 내용을 완전히 확인하지 못해 변경하지 않았습니다.' }
    const targets = elements.filter(
      (el) =>
        (el.type === 'text' || el.type === 'shape') && !el.locked && el.text === request.oldText,
    )
    if (
      targets.length !== 1 ||
      (request.preservedText && !elements.some((el) => el.text === request.preservedText))
    )
      return {
        text: '문구가 정확히 한 곳인지 또는 보존할 문구가 있는지 확인하지 못해 변경하지 않았습니다.',
      }
    const id = JSON.stringify(targets[0].id)
    const oldText = JSON.stringify(request.oldText)
    const newText = JSON.stringify(request.newText)
    return {
      call: exactSlideCall('write', 'execute_slide_script', {
        slideIndex: request.slideIndex,
        code: `const matches = els.filter(e => e.id === ${id} && e.text === ${oldText} && !e.locked && (!e.inGroup || e.groupId)); if (matches.length === 1) setText(matches[0].id, ${newText});`,
        explanation: `${request.slideIndex + 1}번 슬라이드 문구 변경`,
      }),
    }
  }
  if (
    call.name === 'execute_slide_script' &&
    call.id.startsWith(`${EXACT_SLIDE_ID_PREFIX}write-`)
  ) {
    if (
      !result.output.startsWith(
        `Applied the edit script to page ${request.slideIndex + 1}: text 1 item(s).`,
      )
    )
      return { text: '슬라이드 변경 적용을 확인하지 못했습니다. 내용을 직접 확인해 주세요.' }
    return { call: exactSlideCall('after', 'read_slide', { slideIndex: request.slideIndex }) }
  }
  if (call.name === 'read_slide' && call.id.startsWith(`${EXACT_SLIDE_ID_PREFIX}after-`)) {
    let userIndex = messages.length - 1
    while (userIndex >= 0 && messages[userIndex].role !== 'user') userIndex--
    const currentTurn = messages.slice(userIndex + 1)
    const before = currentTurn.find(
      (m) =>
        m.role === 'tool' &&
        m.results.length === 1 &&
        m.results[0].id.startsWith(`${EXACT_SLIDE_ID_PREFIX}before-`) &&
        m.results[0].name === 'read_slide',
    )
    const prior = before?.role === 'tool' ? slideElementTexts(before.results[0].output) : null
    const now = slideElementTexts(result.output)
    if (!prior || !now || prior.length !== now.length)
      return { text: '변경 후 슬라이드 내용을 검증하지 못했습니다.' }
    const target = prior.filter(
      (el) =>
        el.text === request.oldText && (el.type === 'text' || el.type === 'shape') && !el.locked,
    )
    if (target.length !== 1) return { text: '변경 전 문구를 확인하지 못했습니다.' }
    const current = new Map(now.map((el) => [el.id, el]))
    const verified = prior.every((el) => {
      const after = current.get(el.id)
      return (
        after?.type === el.type &&
        after.text === (el.id === target[0].id ? request.newText : el.text)
      )
    })
    return verified
      ? {
          text: `${request.slideIndex + 1}번 슬라이드의 ${request.oldText}를 ${request.newText}로 변경하고 다른 문구를 확인했습니다.`,
        }
      : { text: '슬라이드 변경 후 문구가 예상과 달라 내용을 직접 확인해 주세요.' }
  }
  return null
}

interface ExactWorkbookRequest {
  sheetName: string
  address: string
  oldValue: string
  newValue: string
  preserved?: { address: string; value: string }
}

type ExactWorkbookStep = { call: AgentToolCall } | { text: string }

/** Only accept an explicit, single-cell Korean replacement with an optional
 * read-only preservation condition. Everything else stays with the model. */
function exactWorkbookRequest(message: AgentMessage): ExactWorkbookRequest | null {
  if (message.role !== 'user' || message.images?.length) return null
  const divider = message.text.indexOf('\n\n')
  if (divider < 0 || !message.text.slice(divider + 2).startsWith('Active sheet: ')) return null
  const request = message.text.slice(0, divider).trim()
  if (request.length > 250 || request.includes('\n')) return null
  const match = request.match(
    /^([\p{L}\p{N}_ .-]{1,60})의\s+([A-Z]{1,3}[1-9][0-9]{0,6})\s*셀에\s*있는\s*([\p{L}\p{N}_-]{1,60})를\s*([\p{L}\p{N}_-]{1,60})로\s*(?:바꿔|변경해|교체해)\s*(?:줘|주세요)?[.!]?\s*(?:([A-Z]{1,3}[1-9][0-9]{0,6})\s*셀\s*값\s*([\p{L}\p{N}_-]{1,60})은\s*그대로\s*둬[.!]?)?$/u,
  )
  if (!match || match[3] === match[4]) return null
  const preserved = match[5] && match[6] ? { address: match[5], value: match[6] } : undefined
  if (preserved?.address === match[2]) return null
  return {
    sheetName: match[1],
    address: match[2],
    oldValue: match[3],
    newValue: match[4],
    ...(preserved ? { preserved } : {}),
  }
}

function exactWorkbookCall(
  phase: string,
  name: string,
  input: Record<string, unknown>,
): AgentToolCall {
  return { id: `${EXACT_XLSX_ID_PREFIX}${phase}-${randomUUID()}`, name, input }
}

function exactWorkbookSheetId(context: string, sheetName: string): string | null {
  const escaped = sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const active = context.match(
    new RegExp(`^Active sheet: ${escaped} \\(id=([^,)\\n]+)(?:,[^\\n)]*)?\\)$`, 'm'),
  )
  if (active) return active[1]
  const all = context.match(/^All sheets: (.+)$/m)?.[1]
  if (!all) return null
  const found = all.match(new RegExp(`(?:^|, )${escaped} \\(id=([^,)]+)(?:,[^)]*)?\\)(?=, |$)`))
  return found?.[1] ?? null
}

/**
 * An editor-owned tool sequence for exact XLSX writes. The sequence is derived
 * entirely from this run's messages: no guessed sheet IDs, no model-asserted
 * success, and no parallel path around AgentLoop's checks and undo handling.
 */
export function localExactWorkbookStep(
  messages: AgentMessage[],
  tools: AgentToolDef[],
): ExactWorkbookStep | null {
  if (
    !['get_workbook_context', 'read_cells', 'propose_operations'].every((name) =>
      tools.some((tool) => tool.name === name),
    )
  )
    return null
  const last = messages.at(-1)
  if (!last) return null
  if (last.role === 'user') {
    if (!exactWorkbookRequest(last)) return null
    return { call: exactWorkbookCall('context', 'get_workbook_context', {}) }
  }
  const previous = messages.at(-2)
  if (last.role !== 'tool' || previous?.role !== 'assistant') return null
  const call = previous.toolCalls?.length === 1 ? previous.toolCalls[0] : null
  const result = last.results.length === 1 ? last.results[0] : null
  if (
    !call ||
    !result ||
    !call.id.startsWith(EXACT_XLSX_ID_PREFIX) ||
    result.id !== call.id ||
    result.name !== call.name
  )
    return null
  const currentUser = [...messages].reverse().find((message) => message.role === 'user')
  const request = currentUser ? exactWorkbookRequest(currentUser) : null
  if (!request) return { text: '셀 변경을 검증할 수 없어 중단했습니다.' }
  if (result.isError) return { text: `셀 변경을 완료하지 못했습니다. ${result.output}` }

  if (
    call.id.startsWith(`${EXACT_XLSX_ID_PREFIX}context-`) &&
    call.name === 'get_workbook_context'
  ) {
    const sheetId = exactWorkbookSheetId(result.output, request.sheetName)
    if (!sheetId)
      return { text: `시트 ${request.sheetName}을(를) 확인하지 못해 변경하지 않았습니다.` }
    return {
      call: exactWorkbookCall('before', 'read_cells', {
        sheetId,
        addresses: [request.address, ...(request.preserved ? [request.preserved.address] : [])],
      }),
    }
  }
  if (call.id.startsWith(`${EXACT_XLSX_ID_PREFIX}before-`) && call.name === 'read_cells') {
    const sheetId = call.input.sheetId
    if (typeof sheetId !== 'string' || !sheetId)
      return { text: '시트 정보를 검증하지 못해 변경하지 않았습니다.' }
    const rows = result.output.split('\n')
    if (rows[0] !== `${request.address}: ${request.oldValue}`) {
      return {
        text: `${request.address}의 현재 값이 ${request.oldValue}와 일치하지 않아 변경하지 않았습니다.`,
      }
    }
    if (
      request.preserved &&
      rows[1] !== `${request.preserved.address}: ${request.preserved.value}`
    ) {
      return {
        text: `${request.preserved.address}의 보존 조건을 확인하지 못해 변경하지 않았습니다.`,
      }
    }
    if (rows.length !== (request.preserved ? 2 : 1)) {
      return { text: '셀 읽기 결과를 확인하지 못해 변경하지 않았습니다.' }
    }
    return {
      call: exactWorkbookCall('write', 'propose_operations', {
        operations: [
          { op: 'set_cell', sheetId, address: request.address, value: request.newValue },
        ],
        summary: `${request.sheetName}!${request.address} 값 변경`,
      }),
    }
  }
  if (call.id.startsWith(`${EXACT_XLSX_ID_PREFIX}write-`) && call.name === 'propose_operations') {
    const operations = call.input.operations
    const operation = Array.isArray(operations) ? operations[0] : undefined
    if (!operation || operation.op !== 'set_cell' || typeof operation.sheetId !== 'string') {
      return { text: '변경 결과를 검증하지 못했습니다.' }
    }
    return {
      call: exactWorkbookCall('after', 'read_cells', {
        sheetId: operation.sheetId,
        addresses: [request.address, ...(request.preserved ? [request.preserved.address] : [])],
      }),
    }
  }
  if (call.id.startsWith(`${EXACT_XLSX_ID_PREFIX}after-`) && call.name === 'read_cells') {
    const rows = result.output.split('\n')
    if (
      rows[0] !== `${request.address}: ${request.newValue}` ||
      (request.preserved &&
        rows[1] !== `${request.preserved.address}: ${request.preserved.value}`) ||
      rows.length !== (request.preserved ? 2 : 1)
    ) {
      return { text: '셀 변경 후 값을 확인하지 못했습니다. 문서를 직접 확인해 주세요.' }
    }
    return {
      text: `${request.sheetName}!${request.address} 값을 ${request.newValue}로 변경하고 확인했습니다.`,
    }
  }
  return null
}

/** Finish only the deterministic one-tool edit after the editor has executed it. */
export function localExactEditFollowup(messages: AgentMessage[]): string | null {
  const resultMessage = messages.at(-1)
  const callMessage = messages.at(-2)
  if (resultMessage?.role !== 'tool' || callMessage?.role !== 'assistant') return null
  if (callMessage.toolCalls?.length !== 1 || resultMessage.results.length !== 1) return null
  const call = callMessage.toolCalls[0]
  const result = resultMessage.results[0]
  if (
    !(call.id.startsWith(EXACT_EDIT_ID_PREFIX) || call.id.startsWith(CONTEXTUAL_EDIT_ID_PREFIX)) ||
    !['replace_text', 'apply_ops'].includes(call.name) ||
    result.id !== call.id ||
    result.name !== call.name
  )
    return null
  if (call.id.startsWith(EXACT_FORMAT_ID_PREFIX)) {
    return result.isError
      ? `서식을 적용하지 못했습니다. ${result.output}`
      : '요청하신 글자색을 적용했습니다.'
  }
  return result.isError
    ? `문구를 변경하지 못했습니다. ${result.output}`
    : '요청하신 문구를 변경했습니다.'
}

/**
 * Style one explicitly named DOCX paragraph only when the live editor snapshot
 * proves it is a unique, fully visible block. The tiny local model otherwise
 * tends to attempt unrelated style and text edits for simple color requests.
 */
export function planLocalExactFormat(
  messages: AgentMessage[],
  tools: AgentToolDef[],
): AgentToolCall | null {
  const last = messages.at(-1)
  if (last?.role !== 'user' || last.images?.length) return null
  const applyOps = tools.find((tool) => tool.name === 'apply_ops')
  if (!applyOps) return null
  const divider = last.text.indexOf('\n\n')
  if (divider < 0) return null
  const instruction = last.text.slice(0, divider).trim()
  const snapshot = last.text.slice(divider + 2)
  if (instruction.length > 200 || instruction.includes('\n')) return null
  const match = instruction.match(
    /^(?:문서에서\s*)?(.{1,60}?)\s*문단의\s*글자색을\s*(빨간색|파란색|초록색|검은색)으로\s*(?:변경해|바꿔|설정해)\s*(?:줘|주세요|주십시오)?[.!]?$/,
  )
  if (!match) return null
  const [, phrase, requestedColor] = match
  const color = {
    빨간색: '#FF0000',
    파란색: '#0000FF',
    초록색: '#008000',
    검은색: '#000000',
  }[requestedColor as '빨간색' | '파란색' | '초록색' | '검은색']
  if (!phrase || !color || phrase !== phrase.trim() || /["'“”‘’]/.test(phrase)) return null
  const header = snapshot.match(
    /^Document block list:\nThe document has (\d+) blocks, listed below \(index\|type\|content preview\):\n/,
  )
  if (!header) return null
  const blockCount = Number(header[1])
  if (!Number.isSafeInteger(blockCount) || blockCount < 1 || blockCount > 2000) return null
  const entries = [...snapshot.matchAll(/^(\d+)\|([^|\n]+)\|([^\n]*)$/gm)]
  // Reject elided and incomplete lists: a hidden second match would make the
  // requested target ambiguous, and index mapping may have changed.
  if (entries.length !== blockCount || entries.some((entry, index) => Number(entry[1]) !== index))
    return null
  const matches = entries.filter(
    ([, , kind, preview]) => /^(?:p|h[1-6]|li)$/.test(kind) && preview === phrase,
  )
  if (matches.length !== 1) return null
  return {
    id: `${EXACT_FORMAT_ID_PREFIX}${randomUUID()}`,
    name: applyOps.name,
    input: {
      ops: [
        {
          op: 'setFont',
          target: { blockIndexes: [Number(matches[0][1])] },
          color,
        },
      ],
    },
  }
}

/**
 * Fast, deterministic path for one unambiguous quoted substitution in Korean.
 * The existing AgentLoop still executes and validates the tool call, and owns
 * undo/rollback. All other instructions go through the model as usual.
 */
export function planLocalExactEdit(
  messages: AgentMessage[],
  tools: AgentToolDef[],
): AgentToolCall | null {
  const last = messages.at(-1)
  if (!last || last.role !== 'user' || last.images?.length) return null
  // AgentLoop appends an editor-generated document snapshot after two newlines.
  // Recognize only known snapshot headers so an arbitrary multi-step user
  // message cannot become a single edit by dropping its later instructions.
  const contextBreak = last.text.indexOf('\n\n')
  const context = contextBreak < 0 ? '' : last.text.slice(contextBreak + 2)
  const knownEditorSnapshot =
    /^(?:Document block list:\nThe document has \d+ blocks, listed below|The document is currently blank\.|## Open document\n|## Selected text\n)/.test(
      context,
    )
  const request = (
    contextBreak >= 0 && knownEditorSnapshot ? last.text.slice(0, contextBreak) : last.text
  ).trim()
  // Skill instructions, context dumps, and compound requests need the model.
  if (!request || request.length > 450 || request.includes('\n')) return null
  if (/\?|？|취소|제외|전체|모두|모든|일괄|각각|어떻게|가능할까/.test(request)) return null

  const matches = [
    ...request.matchAll(/"([^"\n]{1,200})"|“([^”\n]{1,200})”|'([^'\n]{1,200})'|‘([^’\n]{1,200})’/g),
  ]
  if (matches.length !== 2) return null
  const [from, to] = matches
  if (!from || !to || from.index === undefined || to.index === undefined) return null
  const find = (from[1] ?? from[2] ?? from[3] ?? from[4])!
  const replace = (to[1] ?? to[2] ?? to[3] ?? to[4])!
  if (!find || find === replace || find.includes('\n') || replace.includes('\n')) return null
  const between = request.slice(from.index + from[0].length, to.index)
  const after = request.slice(to.index + to[0].length)
  // Permit qualifiers such as '만' and '정확히 한 번', but only an explicit edit.
  if (!/^(?:[을를](?:만)?|만)\s*$/.test(between)) return null
  // Anchor the complete imperative: "바꾸지 마", "바꾸면 안 돼" and
  // extra trailing instructions are not affirmative single-edit requests.
  if (
    !/^로\s*(?:(?:정확히|딱)\s*한\s*번\s*)?(?:바꿔|바꾸어|교체해|치환해|변경해)(?:\s*(?:줘|주세요|주십시오|주시기\s*바랍니다|부탁(?:해|합니다|해요)))?[.!。]?\s*$/.test(
      after,
    )
  )
    return null
  if (
    /(?:바꾸|교체|치환|변경)\s*지\s*마(?:세요|[.\s]|$)|바꾸면\s*안\s*돼/.test(
      request.slice(0, from.index),
    )
  )
    return null

  const hwp = tools.find((tool) => tool.name === 'replace_text')
  if (hwp)
    return {
      id: `${EXACT_EDIT_ID_PREFIX}${randomUUID()}`,
      name: hwp.name,
      input: { find, replace },
    }
  // DOCX requires exactly one *editable* match before the atomic operation
  // commits. If missing or ambiguous, the renderer refuses without changes.
  const docs = tools.find((tool) => tool.name === 'apply_ops')
  if (docs) {
    return {
      id: `${EXACT_EDIT_ID_PREFIX}${randomUUID()}`,
      name: docs.name,
      input: { ops: [{ op: 'findReplace', find, replace, matchCase: true, exactlyOnce: true }] },
    }
  }
  return null
}

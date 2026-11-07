import { randomUUID } from 'node:crypto'
import type { AgentMessage, AgentToolCall, AgentToolDef } from '@genoffice/agent-core'

const DRAFT_ID = 'local-document-draft-'
const DOCUMENT_NOUN =
  /(?:계획서|보고서|안내문|공문|기안문|제안서|기사|글|문서|일지|수업안|대본|원고|편지|write|draft|document|report|plan)/i
const WRITING_REQUEST =
  /(?:작성|만들어|만들어줘|만들\s*수|써줘|써 줘|초안|채워|생성|write|draft|compose)/i
const DOCUMENT_DISCUSSION = /(?:예시|항목|구성|내용|양식|목적|어떻게|무엇|뭐가|필요|포함)/
const CANCELLED_REQUEST =
  /(?:취소|중단|하지\s*마|하지\s*말|쓰지\s*마|넣지\s*마|작성하지|만들지\s*마|don't|do not)/i
// A brief, explicit instruction to put the previously discussed draft into
// the editor. Anchor the entire utterance so unrelated turns aren't treated
// as permission to write a document.
const WRITE_FOLLOWUP =
  /^(?:(?:그냥|그럼|그러면|이제|응|그래|네|예|부탁해)[\s,!]*)*(?:(?:네가|너가|니가|알아서|직접|적당히|그거|그걸|위\s*내용|방금\s*말한\s*내용|문서에|본문에)[\s,!]*)*(?:넣(?:어|으라구|으라고|으라니까)(?:줘|주세요)?|작성해(?:줘|주세요)?|만들어(?:줘|주세요)?|써(?:줘|주세요)?|채워(?:줘|주세요)?|반영해(?:줘|주세요)?)[\s.!?]*$/i

function userInstruction(text: string): string {
  const divider = text.indexOf('\n\n## Open document\n')
  return (divider >= 0 ? text.slice(0, divider) : text).trim()
}

/**
 * A small offline model reliably writes short prose but can answer in chat
 * instead of invoking a large JSON tool. For an explicitly requested draft in
 * an *empty* Hangul document, generate plain text and let the actual editor
 * insert it through its normal, undoable tool (with its normal receipt).
 */
export function planLocalDocumentDraft(
  messages: AgentMessage[],
  tools: AgentToolDef[],
): { instruction: string } | null {
  const last = messages.at(-1)
  if (last?.role !== 'user' || last.images?.length) return null
  if (!tools.some((tool) => tool.name === 'insert_paragraphs')) return null
  const divider = last.text.indexOf('\n\n## Open document\n')
  if (divider < 0) return null
  const context = last.text.slice(divider + 2)
  // The editor's freshly read snapshot is the only evidence that insertion at
  // the end is safe. Do not fall back to this route for existing files/forms.
  if (!/^## Open document\nLength: 0 characters\.(?:\n|$)/.test(context)) return null
  if (context.includes('## Selected text')) return null
  const instruction = last.text.slice(0, divider).trim()
  if (!instruction || instruction.length > 1500) return null
  if (CANCELLED_REQUEST.test(instruction)) return null
  if (WRITING_REQUEST.test(instruction) && DOCUMENT_NOUN.test(instruction)) {
    return { instruction }
  }
  if (!WRITE_FOLLOWUP.test(instruction)) return null

  // AgentLoop sends past user turns as well as the freshly read document
  // snapshot. A reply such as "그냥 네가 알아서 넣으라구" must retain the topic of
  // the preceding request, but assistant text and document contents can never
  // authorize an edit. Stop at a new unrelated user request.
  const previousUsers = messages
    .slice(0, -1)
    .filter((message) => message.role === 'user')
    .slice(-3)
  for (const previous of previousUsers.reverse()) {
    if (previous.role !== 'user' || previous.images?.length) return null
    const topic = userInstruction(previous.text)
    if (!topic || topic.length > 1500 || CANCELLED_REQUEST.test(topic)) return null
    if (WRITE_FOLLOWUP.test(topic)) continue
    if (!DOCUMENT_NOUN.test(topic)) return null
    if (!WRITING_REQUEST.test(topic) && !DOCUMENT_DISCUSSION.test(topic)) return null
    return { instruction: `${topic}\n이 주제로 한글 문서의 내용을 작성해 주세요. ${instruction}` }
  }
  return null
}

export const LOCAL_DRAFT_SYSTEM = [
  'You write the text that will be inserted into an empty Korean Hangul document.',
  'Follow the user request exactly. Write meaningful, relevant Korean document content; never discuss how to write it.',
  'Produce 8 to 12 short complete paragraphs: title, appropriate section headings and concrete explanations. Limit each paragraph to 90 Korean characters.',
  'If the request mentions 현장체험학습 or 체험학습, write a school field-trip plan, not industrial job training. Never assume the school grade.',
  'Use a newline between paragraphs. Plain text ONLY. No HTML, code fences, JSON, introductions or afterword.',
  'Never invent a date, place, personal name, amount or confirmed fact not given by the user. Use "추후 확정" for unknown logistics.',
  'Do not merely repeat the request or explain that you cannot edit a document. Write the actual document text now.',
].join('\n')

// A narrower second request handles occasional long or off-format answers from
// the small offline model without asking the user to resend the same message.
export const LOCAL_DRAFT_RETRY_SYSTEM = [
  'Write the finished Korean document requested by the user as plain text.',
  'Exactly 7 to 9 short nonempty lines. First line is the document title; the other lines are meaningful, complete sentences with section labels.',
  'Every line must be shorter than 100 characters. Do not use Markdown or explain your answer.',
  'For 현장체험학습/체험학습, write a school field-trip plan with purpose, participants, schedule, preparation, activities, safety and review. No industrial job training.',
  'Use 추후 확정 where a date, place, grade, budget or other specific fact was not supplied.',
].join('\n')

export function localFieldTripDraftFallback(instruction: string): AgentToolCall | null {
  if (!/(?:현장)?체험학습/.test(instruction) || !/계획서|계획/.test(instruction)) return null
  const paragraphs = [
    '현장체험학습 계획서',
    '1. 추진 목적: 교과 학습을 실제 환경과 연결하고, 직접 관찰하고 탐구하는 경험을 제공합니다.',
    '2. 운영 대상: 참여 학년 및 학생 수는 학교 교육과정과 참가 신청 결과에 따라 추후 확정합니다.',
    '3. 일시 및 장소: 체험 활동의 학습 목표, 이동 여건, 안전성을 검토한 뒤 추후 확정합니다.',
    '4. 사전 준비: 교육과정 연계 주제를 정하고 현장 조사, 참가 안내, 보호자 동의 및 비상 연락망을 준비합니다.',
    '5. 사전 교육: 방문 장소의 특징을 조사하고 관찰 질문을 작성하며 안전 수칙을 익힙니다.',
    '6. 현장 활동: 인원 확인 후 모둠별 관찰, 기록, 질문 및 체험 활동을 실시합니다.',
    '7. 안전 관리: 인솔 인원과 이동 동선을 점검하고, 출발·도착·이동 시마다 인원을 확인합니다.',
    '8. 비상 대응: 비상 연락 체계와 응급 대응 절차를 공유하고, 상황 발생 시 학교 지침에 따라 조치합니다.',
    '9. 사후 활동: 관찰 결과를 발표하고 체험 내용과 교과 학습의 연결점을 정리합니다.',
    '10. 평가 및 환류: 학생 소감과 활동 결과를 검토해 다음 현장체험학습 계획에 반영합니다.',
  ]
  return {
    id: `${DRAFT_ID}${randomUUID()}`,
    name: 'insert_paragraphs',
    input: { where: 'end', paragraphs },
  }
}

export function documentDraftToolCall(
  instruction: string,
  raw: string,
  stopReason?: string,
): AgentToolCall | null {
  const visible = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[^\n]*\n?/g, '')
  const paragraphs = visible
    .replace(/\r/g, '')
    .split('\n')
    .map((line) =>
      line
        .replace(/<[^>]*>/g, '')
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s*\*\*(.*?)\*\*\s*$/, '$1')
        .trim(),
    )
    .filter((line) => line.length > 0)
  // If the token budget cut off a good draft, discard its unfinished tail;
  // completed paragraphs are still safe to insert into the blank document.
  if (stopReason === 'max_tokens') {
    while (paragraphs.length > 0 && !/[.!?。！？]$/.test(paragraphs.at(-1)!)) paragraphs.pop()
  }
  const content = paragraphs.join('')
  if (paragraphs.length < 4 || content.length < 90 || content.length > 8000) return null
  if (paragraphs.some((line) => line.length > 500 || /[<>]/.test(line))) return null
  // Guard against an unrelated model reply. A document noun from the explicit
  // request must appear in the actual draft, not just the model's explanation.
  const topic = instruction.match(
    /[가-힣A-Za-z]{2,}(?:체험학습|계획서|보고서|안내문|공문|수업안)/,
  )?.[0]
  if (
    topic &&
    !content.includes(topic) &&
    !content.includes(topic.replace(/(?:계획서|보고서|안내문|공문|수업안)$/, ''))
  )
    return null
  if (/^(?:알겠습니다|네,?\s*작성|작성해\s*드리겠습니다|다음과\s*같이)/.test(paragraphs[0]!))
    return null
  return {
    id: `${DRAFT_ID}${randomUUID()}`,
    name: 'insert_paragraphs',
    input: { where: 'end', paragraphs },
  }
}

/** The success message is emitted only after the editor returns its receipt. */
export function localDocumentDraftFollowup(messages: AgentMessage[]): string | null {
  const last = messages.at(-1)
  const previous = messages.at(-2)
  if (last?.role !== 'tool' || previous?.role !== 'assistant') return null
  const call = previous.toolCalls?.length === 1 ? previous.toolCalls[0] : null
  if (!call?.id.startsWith(DRAFT_ID) || call.name !== 'insert_paragraphs') return null
  const result = last.results.length === 1 ? last.results[0] : null
  if (!result || result.id !== call.id || result.name !== call.name) return null
  if (result.isError) return `문서 본문에 내용을 넣지 못했습니다. ${result.output}`
  const receipt = result.output.match(/^Added ([1-9]\d*) paragraph\(s\)(?: in the table cell)?\./)
  if (!receipt || Number(receipt[1]) !== (call.input.paragraphs as unknown[])?.length)
    return '문서 편집 결과를 확인하지 못했습니다. 오른쪽 본문을 확인해 주세요.'
  return `오른쪽 한글 문서에 ${receipt[1]}개 문단을 작성했습니다. 내용을 확인한 뒤 저장해 주세요.`
}

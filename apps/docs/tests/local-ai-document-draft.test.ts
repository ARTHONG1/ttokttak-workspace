import { describe, expect, it } from 'vitest'
import type { AgentMessage, AgentToolDef } from '@genoffice/agent-core'
import {
  documentDraftToolCall,
  localDocumentDraftFollowup,
  localFieldTripDraftFallback,
  planLocalDocumentDraft,
} from '../src/main/local-ai-document-draft'

const insertTool: AgentToolDef = {
  name: 'insert_paragraphs',
  description: 'Insert paragraphs',
  inputSchema: { type: 'object' },
}
const user = (instruction: string, textLength = 0): AgentMessage[] => [
  {
    role: 'user',
    text: `${instruction}\n\n## Open document\nLength: ${textLength} characters.\nForm fields: none.\nText (complete):\n`,
  },
]

describe('offline Hangul document drafting', () => {
  it('only creates in an editor-verified empty HWP document on an explicit writing request', () => {
    expect(planLocalDocumentDraft(user('현장체험학습 계획서 작성해줘'), [insertTool])).toEqual({
      instruction: '현장체험학습 계획서 작성해줘',
    })
    expect(
      planLocalDocumentDraft(user('현장체험학습 계획서 작성해줘', 10), [insertTool]),
    ).toBeNull()
    expect(planLocalDocumentDraft(user('현장체험학습 계획서 설명해줘'), [insertTool])).toBeNull()
    expect(planLocalDocumentDraft(user('현장체험학습 계획서 작성해줘'), [])).toBeNull()
    expect(
      planLocalDocumentDraft(
        [{ role: 'user', text: '현장체험학습 계획서 작성해줘\n\n문서가 비어 있습니다.' }],
        [insertTool],
      ),
    ).toBeNull()
  })

  it('uses the earlier user topic for a clear instruction to fill the blank HWPX', () => {
    const topic = user('현장체험학습 계획서에는 어떤 항목이 들어가?')
    const reply: AgentMessage = {
      role: 'assistant',
      text: '목적, 일정, 활동, 안전 관리가 필요합니다.',
    }
    expect(
      planLocalDocumentDraft([...topic, reply, ...user('너가 알아서 넣어')], [insertTool]),
    ).toEqual({
      instruction:
        '현장체험학습 계획서에는 어떤 항목이 들어가?\n이 주제로 한글 문서의 내용을 작성해 주세요. 너가 알아서 넣어',
    })
    expect(
      planLocalDocumentDraft(
        [
          ...user('체험학습 계획서 예시로 하나 만들어'),
          { role: 'assistant', text: '편집 도구가 없습니다.' },
          ...user('너가 알아서 넣어'),
          { role: 'assistant', text: '수정할 수 없습니다.' },
          ...user('그냥 네가 알아서 넣으라구'),
        ],
        [insertTool],
      )?.instruction,
    ).toContain('체험학습 계획서 예시로 하나 만들어')
  })

  it('rejects follow-ups without a safe current snapshot, suitable topic or insertion tool', () => {
    const previous: AgentMessage[] = [
      ...user('현장체험학습 계획서 예시가 어떤 내용인지 알려줘'),
      { role: 'assistant', text: '설명' },
    ]
    expect(
      planLocalDocumentDraft([...previous, ...user('네가 알아서 넣어', 5)], [insertTool]),
    ).toBeNull()
    expect(planLocalDocumentDraft([...previous, ...user('너가 알아서 넣어')], [])).toBeNull()
    expect(planLocalDocumentDraft([...previous, ...user('넣지 마')], [insertTool])).toBeNull()
    expect(
      planLocalDocumentDraft([...previous, ...user('누가 알아서 넣어?')], [insertTool]),
    ).toBeNull()
    expect(
      planLocalDocumentDraft(
        [
          ...previous,
          ...user('오늘 날씨 어때?'),
          { role: 'assistant', text: '날씨 설명' },
          ...user('너가 알아서 넣어'),
        ],
        [insertTool],
      ),
    ).toBeNull()
    expect(
      planLocalDocumentDraft(
        [
          ...user('학교 행사 일정이 궁금해'),
          { role: 'assistant', text: '일정 설명' },
          ...user('네가 알아서 넣어'),
        ],
        [insertTool],
      ),
    ).toBeNull()
    expect(
      planLocalDocumentDraft(
        [
          { role: 'assistant', text: '체험학습 계획서 예시로 만들어 보세요.' },
          ...user('너가 알아서 넣어'),
        ],
        [insertTool],
      ),
    ).toBeNull()
    expect(planLocalDocumentDraft(user('현장체험학습 계획서 작성하지 마'), [insertTool])).toBeNull()
  })

  it('provides a safe, editable school plan if two local model attempts fail', () => {
    const call = localFieldTripDraftFallback('체험학습계획서 만들어')
    expect(call?.name).toBe('insert_paragraphs')
    expect(call?.input.where).toBe('end')
    expect(call?.input.paragraphs).toHaveLength(11)
    expect(JSON.stringify(call?.input.paragraphs)).toContain('추후 확정')
    expect(localFieldTripDraftFallback('일반 보고서 작성해줘')).toBeNull()
  })

  it('converts complete plain prose into an actual editor tool and waits for its receipt', () => {
    const text = [
      '# 현장체험학습 계획서',
      '1. 목적: 교실 학습 내용을 생활 속 체험과 연계하여 탐구합니다.',
      '2. 대상: 학교 교육과정에 참여하는 학생을 대상으로 합니다.',
      '3. 일정: 장소와 방문 일시는 학교 및 보호자 협의 후 확정합니다.',
      '4. 활동: 관찰 질문 만들기, 모둠별 탐구 및 성찰 기록을 진행합니다.',
      '5. 안전: 사전 안전 교육과 인원 확인 절차를 마련합니다.',
    ].join('\n')
    const call = documentDraftToolCall('현장체험학습 계획서 작성해줘', text)
    expect(call?.name).toBe('insert_paragraphs')
    expect(call?.input.where).toBe('end')
    expect(call?.input.paragraphs).toHaveLength(6)
    const truncated = documentDraftToolCall(
      '현장체험학습 계획서 작성해줘',
      text + '\n7. incomplete tail',
      'max_tokens',
    )
    expect(truncated?.input.paragraphs).toHaveLength(6)
    expect(truncated?.input.paragraphs).not.toContain('7. incomplete tail')
    expect(
      documentDraftToolCall('현장체험학습 계획서 작성해줘', '제목\nunfinished', 'max_tokens'),
    ).toBeNull()
    expect(
      documentDraftToolCall(
        '현장체험학습 계획서 작성해줘',
        text.replaceAll('현장체험학습', '영문법'),
      ),
    ).toBeNull()
    expect(documentDraftToolCall('현장체험학습 계획서 작성해줘', '작성을 완료했습니다.')).toBeNull()

    const exchange: AgentMessage[] = [
      ...user('현장체험학습 계획서 작성해줘'),
      { role: 'assistant', text: '', toolCalls: [call!] },
      {
        role: 'tool',
        results: [{ id: call!.id, name: call!.name, output: 'Added 6 paragraph(s).' }],
      },
    ]
    expect(localDocumentDraftFollowup(exchange)).toContain('6개 문단')
    exchange[2] = {
      role: 'tool',
      results: [
        {
          id: call!.id,
          name: call!.name,
          output: 'the editor did not accept the change',
          isError: true,
        },
      ],
    }
    expect(localDocumentDraftFollowup(exchange)).toContain('넣지 못했습니다')
  })
})

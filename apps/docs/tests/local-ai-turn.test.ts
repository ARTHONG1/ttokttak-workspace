import { describe, expect, it } from 'vitest'
import type { AgentMessage, AgentToolDef } from '@genoffice/agent-core'
import { prepareLocalAiTurn } from '../src/main/local-ai-turn'

const tools: AgentToolDef[] = [
  {
    name: 'get_document_context',
    description: 'Get document context',
    inputSchema: { type: 'object' },
  },
  {
    name: 'read_blocks',
    description: 'Read complete block content',
    inputSchema: { type: 'object' },
  },
  {
    name: 'apply_ops',
    description: 'Edit paragraph and formatting',
    inputSchema: { type: 'object', properties: { ops: { type: 'array' } }, required: ['ops'] },
  },
  {
    name: 'insert_content',
    description: 'Insert restricted HTML',
    inputSchema: { type: 'object' },
  },
  { name: 'write_document', description: 'Write a long document', inputSchema: { type: 'object' } },
  { name: 'replace_blocks', description: 'Replace block range', inputSchema: { type: 'object' } },
]

const user = (text: string): AgentMessage[] => [{ role: 'user', text }]

describe('small offline model context', () => {
  it('keeps the caller instructions of a plain writing request (똑딱업무)', () => {
    const system = '나이스 입력용 행동특성 및 종합의견을 한 문단, 개조식 종결 어미로 쓰십시오.'
    const request =
      '[생성 정보]\n- 학생 관찰 및 특성 기록: 모둠 실험에서 기록을 맡아 꼼꼼히 정리함.'
    const turn = prepareLocalAiTurn(system, user(request), [])
    expect(turn.error).toBeUndefined()
    expect(turn.system).toBe(system)
    expect(turn.messages).toEqual(user(request))
    expect(turn.tools).toEqual([])
    const clipped = prepareLocalAiTurn(system, user('가'.repeat(3000)), [])
    expect(clipped.error).toBeUndefined()
    expect(
      Buffer.byteLength(clipped.system, 'utf8') +
        Buffer.byteLength(
          clipped.messages[0]?.role === 'user' ? clipped.messages[0].text : '',
          'utf8',
        ),
    ).toBeLessThanOrEqual(7000)
    const hugeSystem = prepareLocalAiTurn('가'.repeat(1000), user(request), [])
    expect(hugeSystem.error).toContain('입력 한도')
  })

  it('keeps the HWP document reader available for modifications and retains short follow-ups', () => {
    const docTools: AgentToolDef[] = [
      { name: 'replace_text', description: 'Edit text', inputSchema: { type: 'object' } },
      { name: 'replace_all', description: 'Edit all', inputSchema: { type: 'object' } },
      { name: 'find_text', description: 'Search', inputSchema: { type: 'object' } },
      {
        name: 'read_document',
        description: 'Read every paragraph',
        inputSchema: { type: 'object' },
      },
    ]
    const result = prepareLocalAiTurn(
      '',
      [
        { role: 'user', text: '현장체험학습 계획서의 안전 관리 부분을 수정해줘' },
        { role: 'assistant', text: '어떤 내용을 수정하시나요?' },
        {
          role: 'user',
          text: '아니 바꾸라고\n\n## Open document\nLength: 8 characters.\nText (complete):\n안전 관리 계획서',
        },
      ],
      docTools,
    )
    expect(result.tools.some((tool) => tool.name === 'read_document')).toBe(true)
    expect((result.messages[0] as { text: string }).text).toContain('안전 관리 부분을 수정해줘')
  })
  it('omits the giant editor prompt and does not offer mutation tools for questions', () => {
    const result = prepareLocalAiTurn(
      'x'.repeat(80000),
      user('이 문서의 제목을 알려 줘.\n\nDocument block list:\n0|heading|새빛초등학교 공문'),
      tools,
    )
    expect(result.error).toBeUndefined()
    expect(result.system.length).toBeLessThan(1200)
    expect(result.messages[0]).toEqual({
      role: 'user',
      text: '이 문서의 제목을 알려 줘.\n\nDocument block list:\n0|heading|새빛초등학교 공문',
    })
    expect(result.tools.length).toBeGreaterThan(0)
    expect(result.tools.every((tool) => /^(get_|read_|search_|find_|list_)/.test(tool.name))).toBe(
      true,
    )
  })

  it('keeps a short edit, selects an editing tool and caps document/tool context', () => {
    const result = prepareLocalAiTurn(
      'long system',
      user(
        '문단의 색을 빨간색으로 바꿔 줘.\n\nDocument block list:\n' + '긴 문서 내용'.repeat(2500),
      ),
      tools.map((tool) => ({ ...tool, description: 'verbose '.repeat(2000) })),
    )
    expect(result.error).toBeUndefined()
    expect(result.tools.some((tool) => tool.name === 'apply_ops')).toBe(true)
    expect(result.tools.length).toBeLessThanOrEqual(4)
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThan(10000)
    expect((result.messages[0] as { text: string }).text).toContain('Context abbreviated')
  })

  it('separates editor-generated sheet and slide snapshots from user instructions', () => {
    for (const context of [
      'Active sheet: 예산 (id=2, data extent about 100 rows × 6 columns)',
      '<deck outline>\n1. 연구 개요\n</deck outline>',
      '## Open document\nText (complete):\n행사 안내',
    ]) {
      const result = prepareLocalAiTurn('', user('문서에 무엇이 있나요?\n\n' + context), tools)
      expect(result.error).toBeUndefined()
      expect((result.messages[0] as { text: string }).text).toContain(context)
    }
  })

  it('refuses to truncate human instructions and images silently', () => {
    expect(prepareLocalAiTurn('', user('날짜도 변경해. '.repeat(500)), tools).error).toContain(
      '입력 한도',
    )
    expect(
      prepareLocalAiTurn(
        '',
        [{ role: 'user', text: '이 사진?', images: [{ mime: 'image/png', base64: 'a' }] }],
        tools,
      ).error,
    ).toContain('이미지')
  })

  it('keeps matching tool-call and result identifiers for an ordinary follow-up', () => {
    const call = {
      id: 'model-call-1',
      name: 'read_blocks',
      input: { startBlockIndex: 0, endBlockIndex: 1 },
    }
    const result = prepareLocalAiTurn(
      '',
      [
        { role: 'user', text: '첫 문단을 읽어 줘.' },
        { role: 'assistant', text: '', toolCalls: [call] },
        { role: 'tool', results: [{ id: call.id, name: call.name, output: '문단 본문' }] },
      ],
      tools,
    )
    expect(result.messages).toHaveLength(3)
    expect(result.messages[1]).toEqual({ role: 'assistant', text: '', toolCalls: [call] })
    expect(result.messages[2]).toEqual({
      role: 'tool',
      results: [{ id: call.id, name: call.name, output: '문단 본문' }],
    })
  })
})

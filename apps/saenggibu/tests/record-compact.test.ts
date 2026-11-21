import { describe, expect, it } from 'vitest'
import {
  COMPACT_SYSTEM,
  compactRequest,
  emptyInfo,
  variantOf,
  type CommonInfo,
  type Student,
} from '../src/renderer/src/record/record-core'
import { compactRewordRequest } from '../src/renderer/src/record/record-similarity'

/**
 * 똑딱AI's short 생기부 format: what the app sends to an adapter trained without instructions.
 * These are the examples of the workspace's docs/똑딱AI-생기부-짧은-입력-규칙.md, written out as
 * the app builds them; the model project trains on the same lines, so a change here is a change
 * of that contract.
 */
const student = (fields: Partial<Student>): Student => ({
  id: 's1',
  name: '김하늘',
  level: '상',
  notes: '',
  result: '',
  ...fields,
})
const science: CommonInfo = {
  ...emptyInfo(),
  schoolLevel: 'middle',
  grade: '2',
  subject: '과학',
  unitName: '물질의 구성',
  assignmentDesc: '여러 가지 물질의 밀도를 측정하는 탐구 실험을 설계하고 결과를 보고서로 작성함.',
  achievementStandard:
    '[9과05-03] 밀도를 측정하는 실험을 설계하고 수행하여 물질의 특성으로서 밀도를 설명할 수 있다.',
}

describe("똑딱AI's short 생기부 format", () => {
  it('is a 세특 as the rules write it', () => {
    expect(
      compactRequest(
        'subject',
        science,
        'medium',
        '협업 과정을 강조해 줘.',
        student({ notes: '실험 설계를 주도하고 변인 통제를 꼼꼼히 함.' }),
        2,
      ),
    ).toBe(
      [
        '[세특]',
        '학교급: 중학교',
        '학년: 2학년',
        '과목: 과학',
        '단원: 물질의 구성',
        '과제: 여러 가지 물질의 밀도를 측정하는 탐구 실험을 설계하고 결과를 보고서로 작성함.',
        '성취기준: [9과05-03] 밀도를 측정하는 실험을 설계하고 수행하여 물질의 특성으로서 밀도를 설명할 수 있다.',
        '성취도: 상',
        '관찰:',
        '- 실험 설계를 주도하고 변인 통제를 꼼꼼히 함.',
        '분량: 보통',
        '변형: 2',
        '교사 요청: 협업 과정을 강조해 줘.',
      ].join('\n'),
    )
  })

  it('leaves out a field without a value, and keeps a one-line field on one line', () => {
    const info = {
      ...science,
      grade: '',
      unitName: '',
      assignmentDesc: '밀도를 측정함.\n보고서를 씀.',
    }
    expect(compactRequest('subject', info, 'short', '  ', student({ level: '보통' }), 1)).toBe(
      [
        '[세특]',
        '학교급: 중학교',
        '과목: 과학',
        '과제: 밀도를 측정함. 보고서를 씀.',
        '성취기준: ' + science.achievementStandard,
        '성취도: 보통',
        '분량: 짧게',
        '변형: 1',
      ].join('\n'),
    )
  })

  it('is a 행발 with its notes one a line, as the 누가기록 come', () => {
    expect(
      compactRequest(
        'behavior',
        emptyInfo(),
        'medium',
        '배려심을 중심으로 써 줘.',
        student({ notes: '질문을 자주 함.\n\n- 청소 당번을 성실히 하며 교실 화분을 돌봄.' }),
        3,
      ),
    ).toBe(
      [
        '[행발]',
        '관찰:',
        '- 질문을 자주 함.',
        '- 청소 당번을 성실히 하며 교실 화분을 돌봄.',
        '분량: 보통',
        '변형: 3',
        '교사 요청: 배려심을 중심으로 써 줘.',
      ].join('\n'),
    )
  })

  it('is a 창체 with its area', () => {
    const info: CommonInfo = {
      ...emptyInfo(),
      schoolLevel: 'middle',
      grade: '2',
      area: 'club',
      activityName: '과학탐구반',
      activityContent: '생활 속 과학 원리를 주제로 모둠별 실험을 기획하고 발표함.',
    }
    expect(
      compactRequest(
        'activity',
        info,
        'medium',
        '',
        student({ notes: '모둠장으로 실험 계획을 세우고 역할을 나눔.' }),
        1,
      ),
    ).toBe(
      [
        '[창체]',
        '학교급: 중학교',
        '학년: 2학년',
        '영역: 동아리활동',
        '활동명: 과학탐구반',
        '활동 내용: 생활 속 과학 원리를 주제로 모둠별 실험을 기획하고 발표함.',
        '학생 역할·관찰:',
        '- 모둠장으로 실험 계획을 세우고 역할을 나눔.',
        '분량: 보통',
        '변형: 1',
      ].join('\n'),
    )
  })

  it('is a rewording with the phrases it shares with the others', () => {
    const text = '수업 시간에 적극적으로 참여하며 맡은 역할을 책임감 있게 수행함.'
    const lines = compactRewordRequest(text, ['모둠에서 맡은 역할을 책임감 있게 수행함.'], 1).split(
      '\n',
    )
    expect(lines.slice(0, 3)).toEqual(['[표현 바꾸기]', '글: ' + text, '겹치는 표현:'])
    expect(lines.slice(3, -1).every((l) => l.startsWith('- '))).toBe(true)
    expect(lines.slice(3, -1).join(' ')).toContain('역할을 책임감 있게 수행함')
    expect(lines.at(-1)).toBe('변형: 1')
    expect(compactRewordRequest(text, [], 2).split('\n').slice(2)).toEqual([
      '겹치는 표현:',
      '- 글 전체의 문장 구성',
      '변형: 2',
    ])
  })

  it('carries none of the long instructions', () => {
    const all = [
      compactRequest('subject', science, 'long', '', student({}), 1),
      compactRequest('behavior', emptyInfo(), 'long', '', student({ notes: '성실함.' }), 1),
    ].join('\n')
    expect(all).not.toMatch(/지시사항|작성하십시오|대원칙|글 번호/)
    expect(COMPACT_SYSTEM).toBe('학교생활기록부 문장 작성')
  })

  it("gives a class's students the variants in turn, and [다시 생성] the next", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => variantOf(n))).toEqual([1, 2, 3, 4, 1, 2])
    expect([0, 1, 2, 3, 4].map((again) => variantOf(3, again))).toEqual([3, 4, 1, 2, 3])
    expect(variantOf(undefined)).toBe(1)
  })
})

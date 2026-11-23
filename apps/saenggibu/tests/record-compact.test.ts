import { describe, expect, it } from 'vitest'
import {
  COMPACT_SYSTEM,
  compactExamples,
  compactRequest,
  emptyInfo,
  sortedNotes,
  type CommonInfo,
  type Student,
} from '../src/renderer/src/record/record-core'
import { compactRewordRequest } from '../src/renderer/src/record/record-similarity'

/**
 * 똑딱AI's own 생기부 request: short rules, model answers sent as earlier turns, and the
 * student's facts with the teacher's notes sorted into what the student does well and what to
 * work on (measured 2026-11-24 on the V7-B adapter against the long instructions).
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

describe("똑딱AI's own 생기부 request", () => {
  it("is a 세특 with its length, its fields and the teacher's request", () => {
    expect(
      compactRequest(
        'subject',
        science,
        'medium',
        '협업 과정을 강조해 줘.',
        student({ notes: '실험 설계를 주도하고 변인 통제를 꼼꼼히 함.' }),
      ),
    ).toBe(
      [
        '[교과 세부능력 및 특기사항] 중학교 2학년 과학 · 분량: 3문장, 250자 안팎',
        '단원: 물질의 구성',
        '과제: 여러 가지 물질의 밀도를 측정하는 탐구 실험을 설계하고 결과를 보고서로 작성함.',
        '성취기준: [9과05-03] 밀도를 측정하는 실험을 설계하고 수행하여 물질의 특성으로서 밀도를 설명할 수 있다.',
        '성취도: 상',
        '관찰:',
        '잘하는 점:',
        '- 실험 설계를 주도하고 변인 통제를 꼼꼼히 함',
        '교사 요청: 협업 과정을 강조해 줘.',
      ].join('\n'),
    )
  })

  // in one line the 2B model turned "잘 찾지만 … 어려워함" into a weakness two times out of three
  it("is an elementary 평어 with a note's strength and concern apart", () => {
    const korean: CommonInfo = {
      ...emptyInfo(),
      schoolLevel: 'elementary',
      grade: '4',
      subject: '국어',
      assignmentDesc: '이야기 속 인물의 마음 짐작하기',
    }
    expect(
      compactRequest(
        'subject',
        korean,
        'short',
        '  ',
        student({ level: '보통', notes: '인물의 마음을 잘 찾지만 근거를 말하는 것을 어려워함' }),
      ),
    ).toBe(
      [
        '[교과 평어] 초등학교 4학년 국어 · 분량: 2문장, 120자 안팎',
        '과제: 이야기 속 인물의 마음 짐작하기',
        '성취도: 보통',
        '관찰:',
        '잘하는 점:',
        '- 인물의 마음을 잘 찾음',
        '보완할 점:',
        '- 근거를 말하는 것을 어려워함',
      ].join('\n'),
    )
  })

  it('is a 행발 with its notes one a line, and says when there are none', () => {
    expect(
      compactRequest(
        'behavior',
        emptyInfo(),
        'medium',
        '',
        student({ notes: '질문을 자주 함.\n\n- 청소 당번을 성실히 하며 교실 화분을 돌봄.' }),
      ),
    ).toBe(
      [
        '[행동특성 및 종합의견] 분량: 3~4문장, 300자 안팎',
        '관찰:',
        '잘하는 점:',
        '- 질문을 자주 함',
        '- 청소 당번을 성실히 하며 교실 화분을 돌봄',
      ].join('\n'),
    )
    expect(
      compactRequest('behavior', emptyInfo(), 'short', '', student({})).split('\n').slice(1),
    ).toEqual(['관찰:', '- 관찰 기록 없음'])
  })

  it('is a 창체 with its area and activity', () => {
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
      ),
    ).toBe(
      [
        '[창의적 체험활동 특기사항] 중학교 2학년 · 동아리활동 · 분량: 3문장, 250자 안팎',
        '활동: 과학탐구반 (생활 속 과학 원리를 주제로 모둠별 실험을 기획하고 발표함.)',
        '학생 역할과 관찰:',
        '잘하는 점:',
        '- 모둠장으로 실험 계획을 세우고 역할을 나눔',
      ].join('\n'),
    )
  })

  it('puts a note with the things to work on only on a plain sign of it', () => {
    expect(
      sortedNotes('책을 많이 읽지만 글씨가 바르지 않음. 친구를 잘 돕는데 가끔 수업 중 떠듦.'),
    ).toEqual({
      good: ['책을 많이 읽음', '친구를 잘 도움'],
      concern: ['글씨가 바르지 않음', '가끔 수업 중 떠듦'],
    })
    expect(sortedNotes('발표는 어려워하지만 글은 잘 씀')).toEqual({
      good: ['글은 잘 씀'],
      concern: ['발표는 어려워함'],
    })
    // a change for the better, and a negation that is praise, stay with what the student does well
    expect(sortedNotes('지각이 잦았는데 2학기에 개선됨\n어려운 문제도 포기하지 않음')).toEqual({
      good: ['지각이 잦았는데 2학기에 개선됨', '어려운 문제도 포기하지 않음'],
      concern: [],
    })
    expect(sortedNotes('발표 목소리가 작고 자신감이 부족함')).toEqual({
      good: [],
      concern: ['발표 목소리가 작고 자신감이 부족함'],
    })
  })

  it('comes with model answers asked the same way, and carries none of the long instructions', () => {
    const heads = {
      subject: '[교과',
      behavior: '[행동특성 및 종합의견]',
      activity: '[창의적 체험활동 특기사항]',
    }
    for (const mode of ['subject', 'behavior', 'activity'] as const) {
      const examples = compactExamples(mode)
      expect(examples.length).toBeGreaterThan(0)
      for (const [request, answer] of examples) {
        expect(request.startsWith(heads[mode])).toBe(true)
        expect(answer).not.toMatch(/습니다|\n/)
      }
    }
    expect(COMPACT_SYSTEM).not.toMatch(/작성하십시오|대원칙|글 번호/)
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
})

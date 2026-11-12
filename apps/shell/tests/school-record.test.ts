import { describe, expect, it } from 'vitest'
import {
  BEHAVIOR_SYSTEM,
  SUBJECT_SYSTEM,
  behaviorRequest,
  cleanReply,
  commonProblem,
  decodeCsvBytes,
  emptyInfo,
  neisBytes,
  parseCsv,
  resizeStudents,
  rosterNames,
  runPool,
  studentsFromCsv,
  studentsToCsv,
  subjectRequest,
  templateCsv,
  type Student,
} from '../src/renderer/src/record/record-core'

/**
 * 똑딱업무 > 생기부 follows the author's ACE 세특&행발: 교과 세특 from the task, the
 * achievement standard and each student's level, 행발 from the teacher's observations.
 */

const student = (over: Partial<Student> = {}): Student => ({
  id: 's1',
  name: '김하늘',
  level: '상',
  notes: '',
  result: '',
  ...over,
})

describe('NEIS byte count', () => {
  it('counts a Hangul syllable as 3, a line break as 2 and the rest as 1', () => {
    expect(neisBytes('')).toBe(0)
    expect(neisBytes('가')).toBe(3)
    expect(neisBytes('abc 12.')).toBe(7)
    expect(neisBytes('가\n나')).toBe(8)
    expect(neisBytes('적극적으로 참여함.')).toBe(3 * 8 + 2)
  })
})

describe('교과 세특 request', () => {
  const info = {
    ...emptyInfo(),
    schoolLevel: 'elementary' as const,
    grade: '4',
    subject: '과학',
    unitName: '식물의 한살이',
    assignmentDesc: '강낭콩을 기르며 관찰 일지를 썼다.',
    achievementStandard: '[4과05-01] 식물의 한살이를 관찰한다.',
  }

  it('needs the school level, subject, task and achievement standard', () => {
    expect(commonProblem(info)).toBeNull()
    expect(commonProblem({ ...info, schoolLevel: '' })).toMatch(/학교급/)
    expect(commonProblem({ ...info, subject: '' })).toMatch(/과목/)
    expect(commonProblem({ ...info, subject: 'custom', customSubject: ' ' })).toMatch(/과목/)
    expect(commonProblem({ ...info, assignmentDesc: '' })).toMatch(/과제/)
    expect(commonProblem({ ...info, achievementStandard: '' })).toMatch(/성취기준/)
  })

  it('carries the common information, the level and the length in Korean', () => {
    const text = subjectRequest(info, 'medium', '', student({ level: '최상' }))
    expect(text).toContain('학교급: 초등학교')
    expect(text).toContain('학년: 4학년')
    expect(text).toContain('과목: 과학')
    expect(text).toContain('단원: 식물의 한살이')
    expect(text).toContain('과제 설명: 강낭콩을 기르며 관찰 일지를 썼다.')
    expect(text).toContain('성취기준: [4과05-01] 식물의 한살이를 관찰한다.')
    expect(text).toContain('학생 성취도: 최상')
    expect(text).toContain('요청된 분량 수준: 보통')
    expect(text).toContain('- 없음')
    expect(text).not.toContain('개별 관찰 기록')
  })

  it('never sends the student name', () => {
    const text = subjectRequest(info, 'short', '', student({ notes: '질문이 많음' }))
    expect(text).not.toContain('김하늘')
    expect(text).toContain('개별 관찰 기록: 질문이 많음')
  })

  it("asks for a build of its own by the student's place in the list", () => {
    expect(subjectRequest(info, 'short', '', student())).not.toContain('글 번호')
    expect(subjectRequest(info, 'short', '', student(), 7)).toContain('- 글 번호: 7 (')
    expect(behaviorRequest('short', '', student({ notes: '성실함' }), 3)).toContain(
      '- 글 번호: 3 (',
    )
  })

  it("puts the teacher's own instruction first and uses a typed subject", () => {
    const text = subjectRequest(
      { ...info, subject: 'custom', customSubject: '정보', grade: '', unitName: '' },
      'very-long',
      '협동심을 꼭 넣어 줘.',
      student(),
    )
    expect(text).toContain('!!! 중요 !!!: 협동심을 꼭 넣어 줘.')
    expect(text).toContain('과목: 정보')
    expect(text).toContain('요청된 분량 수준: 매우 길게')
    expect(text).not.toContain('학년:')
    expect(text).not.toContain('단원:')
  })

  it('asks for NEIS endings and no markdown', () => {
    expect(SUBJECT_SYSTEM).toContain('~함')
    expect(SUBJECT_SYSTEM).toContain('마크다운')
    expect(BEHAVIOR_SYSTEM).toContain('행동특성 및 종합의견')
  })
})

describe('행발 request', () => {
  it("carries the observation and the length, not the student's name", () => {
    const text = behaviorRequest('long', '', student({ notes: '친구를 잘 도움' }))
    expect(text).toContain('학생 관찰 및 특성 기록: 친구를 잘 도움')
    expect(text).toContain('요청된 분량 수준: 길게')
    expect(text).not.toContain('김하늘')
  })
})

describe('AI reply clean-up', () => {
  it('drops markdown marks, headings and wrapping quotes, as one paragraph', () => {
    expect(
      cleanReply('## 과학\n**탐구 과정**에 적극적으로 참여함.\n\n- 관찰 일지를 꼼꼼히 기록함.'),
    ).toBe('탐구 과정에 적극적으로 참여함. 관찰 일지를 꼼꼼히 기록함.')
    expect(cleanReply('"자기 생각을 분명히 말함."')).toBe('자기 생각을 분명히 말함.')
    expect(
      cleanReply(
        '원하는 분량을 기준으로 작성한 행동특성 및 종합의견은 다음과 같습니다. 기록표를 꼼꼼히 정리함.\n---',
      ),
    ).toBe('기록표를 꼼꼼히 정리함.')
    expect(cleanReply('  \n ')).toBe('')
  })
})

describe('CSV', () => {
  it('reads quoted cells with commas, quotes and line breaks', () => {
    expect(parseCsv('a,"b,1","c ""d"""\r\n"x\ny",,z\n')).toEqual([
      ['a', 'b,1', 'c "d"'],
      ['x\ny', '', 'z'],
    ])
  })

  it('reads the 세특 work back by its column names', () => {
    const csv =
      '\uFEFF이름,성취 수준,개별 관찰 및 특성 기록,세특\n김하늘,최상,"질문이 많음, 호기심 강함",탐구에 적극적임.\n이바다,,,\n,,,'
    expect(studentsFromCsv(csv, 'subject')).toEqual([
      {
        name: '김하늘',
        level: '최상',
        notes: '질문이 많음, 호기심 강함',
        result: '탐구에 적극적임.',
      },
      { name: '이바다', level: '상', notes: '', result: '' },
    ])
  })

  it("reads the original site's files (no level column, 개별 관찰 기록)", () => {
    const csv = '이름,개별 관찰 기록\n김하늘,발표를 잘함'
    expect(studentsFromCsv(csv, 'subject')).toEqual([
      { name: '김하늘', level: '상', notes: '발표를 잘함', result: '' },
    ])
  })

  it('reads the 행발 work back', () => {
    const csv =
      '이름,학생 관찰 및 특성 기록,행동 특성 및 종합의견\n김하늘,친구를 잘 도움,배려심이 깊음.'
    expect(studentsFromCsv(csv, 'behavior')).toEqual([
      { name: '김하늘', level: '상', notes: '친구를 잘 도움', result: '배려심이 깊음.' },
    ])
  })

  it('refuses a file without the 이름 column', () => {
    expect(() => studentsFromCsv('번호,내용\n1,가', 'behavior')).toThrow(/이름/)
  })

  it('writes what it reads', () => {
    const students = [
      student({ notes: '질문이 많음, "왜"를 자주 물음', result: '탐구에 적극적임.' }),
      student({ id: 's2', name: '', notes: '', result: '' }),
    ]
    const csv = studentsToCsv(students, 'subject')
    expect(csv.split('\n')[0]).toBe('이름,성취 수준,개별 관찰 및 특성 기록,세특')
    expect(studentsFromCsv(csv, 'subject')).toEqual([
      {
        name: '김하늘',
        level: '상',
        notes: '질문이 많음, "왜"를 자주 물음',
        result: '탐구에 적극적임.',
      },
    ])
    expect(studentsToCsv(students, 'behavior').split('\n')[0]).toBe(
      '이름,학생 관찰 및 특성 기록,행동 특성 및 종합의견',
    )
  })

  it('offers a template with the columns to fill in', () => {
    expect(templateCsv('subject')).toBe('이름,성취 수준,개별 관찰 및 특성 기록')
    expect(templateCsv('behavior')).toBe('이름,학생 관찰 및 특성 기록')
  })

  it('decodes UTF-8 and the EUC-KR that Excel on Windows saves', () => {
    expect(decodeCsvBytes(new TextEncoder().encode('\uFEFF이름,세특'))).toBe('이름,세특')
    // "이름" in EUC-KR
    expect(decodeCsvBytes(new Uint8Array([0xc0, 0xcc, 0xb8, 0xa7]))).toBe('이름')
  })
})

describe('roster', () => {
  it('finds the 성명 column in a sheet read as text', () => {
    const text = [
      '# Sheet1',
      '2026학년도 4학년 2반 명렬표',
      '번호 | 성명 | 성별',
      '1 | 김하늘 | 여',
      '2 | 이바다 | 남',
      ' | | ',
    ].join('\n')
    expect(rosterNames(text)).toEqual(['김하늘', '이바다'])
  })

  it('reads 이름 from a CSV too', () => {
    expect(rosterNames('번호,이름\n1,김하늘\n2,이바다\n')).toEqual(['김하늘', '이바다'])
    expect(rosterNames('번호\t성 명\n1\t김하늘')).toEqual(['김하늘'])
  })

  it('finds nothing without a name column', () => {
    expect(rosterNames('번호 | 점수\n1 | 90')).toEqual([])
  })
})

describe('student rows', () => {
  let n = 0
  const make = (): Student => student({ id: 'new' + ++n, name: '' })

  it('grows with empty rows', () => {
    const out = resizeStudents([student()], 3, make)
    expect(out).toHaveLength(3)
    expect(out[0].name).toBe('김하늘')
  })

  it('shrinks only by rows that hold nothing', () => {
    const rows = [student(), student({ id: 's2', name: '', notes: '메모' }), make(), make()]
    expect(resizeStudents(rows, 1, make)).toHaveLength(2)
    expect(resizeStudents(rows, 3, make)).toHaveLength(3)
  })
})

describe('runPool', () => {
  it('runs every item with at most the given number at once', async () => {
    let running = 0
    let peak = 0
    const done: number[] = []
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 5))
      running -= 1
      done.push(item)
    })
    expect(peak).toBe(3)
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('starts nothing more once told to stop', async () => {
    const started: number[] = []
    let stop = false
    await runPool(
      [1, 2, 3, 4],
      1,
      async (item) => {
        started.push(item)
        if (item === 2) stop = true
      },
      () => stop,
    )
    expect(started).toEqual([1, 2])
  })
})

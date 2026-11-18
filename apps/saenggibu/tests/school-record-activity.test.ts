import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_SYSTEM,
  activityAreas,
  activityProblem,
  activityRequest,
  areaLabel,
  byteLimit,
  emptyInfo,
  MODES,
  sessionTitle,
  sessionsFrom,
  studentsFromCsv,
  studentsToCsv,
  workFrom,
  type CommonInfo,
  type Student,
  type Work,
} from '../src/renderer/src/record/record-core'

/**
 * 창체 (창의적 체험활동 특기사항), from the 2026 학교생활기록부 기재요령: 자율·자치활동,
 * 동아리활동, 진로활동, 500자(1,500바이트) each in 중·고; in 초등 자율·자치활동 and
 * 동아리활동 share one entry and nothing caps the length. In 2026 the 3학년 of 중·고 are
 * still on the 2015 curriculum, whose area is 자율활동.
 */
const info = (fields: Partial<CommonInfo>): CommonInfo => ({ ...emptyInfo(), ...fields })
const student = (fields: Partial<Student> = {}): Student => ({
  id: 'a',
  name: '김하늘',
  level: '상',
  notes: '',
  result: '',
  ...fields,
})

describe('창체', () => {
  it('is the third 생기부 item', () => {
    expect(MODES.map((m) => m.id)).toEqual(['subject', 'behavior', 'activity'])
  })

  it('offers the areas of the school level', () => {
    expect(activityAreas('middle').map((a) => a.id)).toEqual(['autonomy', 'club', 'career'])
    expect(activityAreas('high').map((a) => a.id)).toEqual(['autonomy', 'club', 'career'])
    expect(activityAreas('elementary').map((a) => a.id)).toEqual(['autonomy-club', 'career'])
    expect(activityAreas('')).toEqual([])
  })

  it('names 자율활동 for the 3학년 still on the 2015 curriculum', () => {
    expect(areaLabel(info({ schoolLevel: 'high', grade: '1', area: 'autonomy' }))).toBe(
      '자율·자치활동',
    )
    expect(areaLabel(info({ schoolLevel: 'high', grade: '3', area: 'autonomy' }))).toBe('자율활동')
    expect(areaLabel(info({ schoolLevel: 'middle', grade: '3학년', area: 'autonomy' }))).toBe(
      '자율활동',
    )
    expect(areaLabel(info({ schoolLevel: 'high', grade: '3', area: 'club' }))).toBe('동아리활동')
    expect(areaLabel(info({ schoolLevel: 'elementary', area: 'autonomy-club' }))).toBe(
      '자율·자치활동 및 동아리활동',
    )
  })

  it('caps 중·고 entries at 1,500 bytes and leaves 초등 창체 uncapped', () => {
    expect(byteLimit('activity', info({ schoolLevel: 'high', area: 'career' }))).toBe(1500)
    expect(byteLimit('activity', info({ schoolLevel: 'elementary', area: 'career' }))).toBeNull()
    expect(byteLimit('subject', info({ schoolLevel: 'elementary' }))).toBe(1500)
    expect(byteLimit('behavior', info({}))).toBe(1500)
  })

  it('needs the school level, an area of that level and the activity', () => {
    expect(activityProblem(info({}))).toBe('학교급을 골라 주세요.')
    expect(activityProblem(info({ schoolLevel: 'high' }))).toBe('영역을 골라 주세요.')
    expect(activityProblem(info({ schoolLevel: 'high', area: 'autonomy-club' }))).toBe(
      '영역을 골라 주세요.',
    )
    expect(activityProblem(info({ schoolLevel: 'high', area: 'club' }))).toBe(
      '활동 내용을 입력해 주세요.',
    )
    expect(
      activityProblem(info({ schoolLevel: 'high', area: 'club', activityContent: '과학 탐구' })),
    ).toBeNull()
  })

  it("asks for one student's entry without the name", () => {
    const req = activityRequest(
      info({
        schoolLevel: 'high',
        grade: '2',
        area: 'club',
        activityName: '과학탐구반',
        activityContent: '학교 하천의 수질을 조사함.',
      }),
      'medium',
      '',
      student({ notes: '측정 결과를 표로 정리해 발표함.' }),
      2,
    )
    expect(req).toContain('- 영역: 동아리활동')
    expect(req).toContain('- 활동명: 과학탐구반')
    expect(req).toContain('- 활동 내용: 학교 하천의 수질을 조사함.')
    expect(req).toContain('- 학생 역할 및 관찰 기록: 측정 결과를 표로 정리해 발표함.')
    expect(req).toContain('- 글 번호: 2')
    expect(req).not.toContain('김하늘')
    expect(ACTIVITY_SYSTEM).toContain('관찰 기록과 활동 내용에 없는 사실')
  })

  it('titles, saves and loads its work', () => {
    const work: Work = {
      length: 'medium',
      instructions: '',
      info: info({
        schoolLevel: 'middle',
        grade: '2',
        area: 'career',
        activityContent: '직업 탐색',
      }),
      students: [student({ notes: '관심 직업을 조사함.', result: '진로 탐색 활동에 참여함.' })],
    }
    expect(sessionTitle('activity', work)).toBe('진로활동 · 1명')
    const back = workFrom(JSON.parse(JSON.stringify(work)), () => 'x')
    expect(back.info).toMatchObject({ area: 'career', activityContent: '직업 탐색' })
    // an area from somewhere else is dropped, not kept
    expect(workFrom({ info: { area: 'sports' } }, () => 'x').info.area).toBe('')
    const saved = sessionsFrom(
      JSON.stringify([{ id: 's', mode: 'activity', title: 't', savedAt: '', work }]),
      () => 'x',
    )
    expect(saved.map((s) => s.mode)).toEqual(['activity'])
  })

  it('round-trips its students through CSV', () => {
    const csv = studentsToCsv(
      [{ name: '김하늘', level: '상', notes: '부원들과 실험을 설계함.', result: '탐구함.' }],
      'activity',
    )
    expect(csv.split('\n')[0]).toBe('이름,학생 역할 및 관찰 기록,창체 특기사항')
    expect(studentsFromCsv(csv, 'activity')).toEqual([
      { name: '김하늘', level: '상', notes: '부원들과 실험을 설계함.', result: '탐구함.' },
    ])
  })
})

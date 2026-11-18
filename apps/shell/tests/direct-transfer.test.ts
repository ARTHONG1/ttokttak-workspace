import { describe, expect, it } from 'vitest'
import { buildPumuiPackage } from '@genoffice/ttokttak-extension/package'
import { buildRecordPackage } from '@genoffice/ttokttak-extension/record'
import { directTransferRequest, type DirectTransferDriver } from '../src/main/direct-transfer'

describe('데스크톱 직접 전송', () => {
  it('이름 누락과 바이트 초과는 브라우저에 보내기 전에 차단한다', async () => {
    let calls = 0
    const driver: DirectTransferDriver = {
      async send() {
        calls++
        return { ok: true, written: 1, next: 1 }
      },
    }
    for (const student of [
      { name: '', text: '관찰함.' },
      { name: '김하늘', text: '가'.repeat(501) },
    ]) {
      const pkg = buildRecordPackage({ mode: 'subject', title: '과학', students: [student] })
      expect(await directTransferRequest('neis-record', JSON.stringify(pkg), driver)).toMatchObject(
        { ok: false },
      )
    }
    expect(calls).toBe(0)
  })
  it('브라우저 오류에 학생 내용이나 접속 토큰을 표시하지 않는다', async () => {
    const driver: DirectTransferDriver = {
      async send() {
        throw new Error('private-token')
      },
    }
    const pkg = buildRecordPackage({
      mode: 'subject',
      title: '과학',
      students: [{ name: '김하늘', text: '관찰함.' }],
    })
    const result = await directTransferRequest('neis-record', JSON.stringify(pkg), driver)
    expect(result.ok).toBe(false)
    expect(result.message).not.toContain('private-token')
  })
  it('생기부 패키지를 AI 호출 없이 나이스 전송 요청으로 검증한다', async () => {
    const calls: unknown[] = []
    const driver: DirectTransferDriver = {
      async send(feature, payload) {
        calls.push([feature, payload])
        return { ok: true, written: 2, next: 2 }
      },
    }
    const payload = JSON.stringify(
      buildRecordPackage({
        mode: 'subject',
        title: '과학 세특',
        students: [
          { name: '김하늘', text: '탐구에 참여함.' },
          { name: '이바다', text: '관찰함.' },
        ],
      }),
    )

    await expect(directTransferRequest('neis-record', payload, driver)).resolves.toEqual({
      ok: true,
      route: 'direct',
      written: 2,
      next: 2,
      message: '나이스 입력 화면에 2명을 채웠어요. 화면을 확인한 뒤 저장하세요.',
    })
    expect(calls[0]).toEqual(['neis-record', JSON.parse(payload)])
  })

  it('품의 패키지는 K-에듀파인 어댑터로만 보내고 AI나 확장 경로를 호출하지 않는다', async () => {
    const seen: string[] = []
    const driver: DirectTransferDriver = {
      async send(feature) {
        seen.push(feature)
        return { ok: true, written: 2, next: 2 }
      },
    }
    const payload = JSON.stringify(
      buildPumuiPackage({
        title: '교무실 사무용품 구입',
        summary: '구입합니다.',
        items: [
          {
            description: '볼펜',
            specification: '',
            unit: '개',
            quantity: 2,
            unitPrice: 1000,
            amount: 2000,
          },
        ],
      }),
    )

    await expect(directTransferRequest('edufine-pumui', payload, driver)).resolves.toMatchObject({
      ok: true,
      route: 'direct',
    })
    expect(seen).toEqual(['edufine-pumui'])
  })

  it('지원하지 않는 업무나 손상된 패키지는 브라우저를 열지 않는다', async () => {
    let called = false
    const driver: DirectTransferDriver = {
      async send() {
        called = true
        return { ok: true, written: 1, next: 1 }
      },
    }
    await expect(directTransferRequest('unknown', '{}', driver)).resolves.toMatchObject({
      ok: false,
    })
    await expect(directTransferRequest('neis-record', '{', driver)).resolves.toMatchObject({
      ok: false,
    })
    expect(called).toBe(false)
  })
})

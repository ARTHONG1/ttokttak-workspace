import { describe, expect, it } from 'vitest'
import { originFrom } from '../src/origin'

describe('originFrom', () => {
  it('accepts a K-에듀파인 host typed with or without a scheme or path', () => {
    expect(originFrom('klef.example.go.kr')).toBe('https://klef.example.go.kr')
    expect(originFrom(' https://klef.example.go.kr/ui/main.do?x=1 ')).toBe('https://klef.example.go.kr')
  })

  it('refuses other hosts, plain http and empty input', () => {
    expect(originFrom('example.com')).toBeNull()
    expect(originFrom('http://klef.example.go.kr')).toBeNull()
    expect(originFrom('evil.go.kr.example.com')).toBeNull()
    expect(originFrom('')).toBeNull()
    expect(originFrom('http://127.0.0.1:8080')).toBeNull()
  })

  it('allows the local test host only in the test build', () => {
    expect(originFrom('http://127.0.0.1:8080', true)).toBe('http://127.0.0.1')
  })
})


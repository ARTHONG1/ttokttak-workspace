import assert from 'node:assert/strict'
import test from 'node:test'
import {
  releaseSummary,
  renderChangelog,
  replaceReleaseBlock,
  syncPages,
} from './sync-release-page.mjs'

const sample = (tag, date, body = '한글 문서 AI 기능을 개선했습니다.') => ({
  tag_name: tag,
  published_at: `${date}T07:00:00Z`,
  body,
  draft: false,
  prerelease: false,
})
const stub = 'Before\n<!-- GITHUB-RELEASES:START -->\nold\n<!-- GITHUB-RELEASES:END -->\nAfter\n'

test('the latest stable release updates both READMEs and the changelog, repeatably', () => {
  const latest = sample('v0.16.2', '2026-11-07')
  const releases = [
    sample('v0.16.1', '2026-11-06'),
    latest,
    { ...sample('v0.17.0', '2026-11-08'), prerelease: true },
  ]
  const first = syncPages({ korean: stub, english: stub, changelog: stub }, latest, releases)
  assert.match(first.korean, /v0\.16\.2\]\([^)]*\) · 2026-11-07/)
  assert.match(first.english, /Read the full release notes/)
  assert.match(first.changelog, /v0\.16\.1/)
  assert.doesNotMatch(first.changelog, /v0\.17\.0/)
  assert.deepEqual(syncPages(first, latest, releases), first)
})

test('release prose is treated as plain text, not executable Markdown or HTML', () => {
  const body =
    '새 소식 [여기](https://evil.example) <img src=x onerror=alert(1)> 입니다.\n\n## 설치\n\n- 사용법'
  const result = releaseSummary(body)
  assert.equal(result, '새 소식 여기 입니다.')
  assert.doesNotMatch(result, /evil|<|onerror|\]\(/)
})

test('invalid versions and markers fail without changing a file', () => {
  assert.throws(
    () => renderChangelog([{ ...sample('v0.17.0', '2026-11-08'), draft: true }]),
    /No published/,
  )
  assert.throws(() => replaceReleaseBlock('no markers', 'text'), /Missing/)
  assert.throws(() => replaceReleaseBlock(stub + stub, 'text'), /repeated/)
})

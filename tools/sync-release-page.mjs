#!/usr/bin/env node
/**
 * Refresh the public repository's landing pages from published GitHub Releases.
 * Used by .github/workflows/release-page-sync.yml and for manual recovery.
 * The release description is also used verbatim by the desktop update window.
 * No local document, model weight, key or analysis artifact is ever read.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import prettier from 'prettier'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const REPOSITORY = 'ARTHONG1/ttokttak-workspace'
const START = '<!-- GITHUB-RELEASES:START -->'
const END = '<!-- GITHUB-RELEASES:END -->'
const VERSION = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function safeTag(release) {
  return typeof release?.tag_name === 'string' && VERSION.test(release.tag_name)
    ? release.tag_name
    : null
}

function releaseUrl(tag) {
  return `https://github.com/${REPOSITORY}/releases/tag/${encodeURIComponent(tag)}`
}

export function releaseSummary(body) {
  const paragraphs = String(body ?? '')
    .replaceAll('\r', '')
    .split(/\n\s*\n/)
  for (const paragraph of paragraphs) {
    const lines = paragraph
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (!lines.length || lines[0].startsWith('#') || lines[0].startsWith('<!--')) continue
    const sentence = lines
      .join(' ')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<[^>]*>/g, '')
      .replace(/[`*_~|]/g, '')
      .replace(/^[\s>\-+]+/, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (sentence) return sentence.replaceAll('&', '&amp;').replaceAll('<', '&lt;').slice(0, 250)
  }
  return '자세한 변경 내역은 릴리스 페이지에서 확인하세요.'
}

export function renderLatestKorean(release) {
  const tag = safeTag(release)
  if (!tag) throw new Error('Invalid latest GitHub release tag')
  const day = String(release.published_at ?? '').slice(0, 10)
  return `**[${tag}](${releaseUrl(tag)})${day ? ` · ${day}` : ''}** — ${releaseSummary(release.body)}\n\n[모든 버전의 변경 내역 보기](https://github.com/${REPOSITORY}/releases)`
}

export function renderLatestEnglish(release) {
  const tag = safeTag(release)
  if (!tag) throw new Error('Invalid latest GitHub release tag')
  const day = String(release.published_at ?? '').slice(0, 10)
  return `**[${tag}](${releaseUrl(tag)})${day ? ` · ${day}` : ''}** — Read the full release notes (in Korean).\n\n[All releases and changes](https://github.com/${REPOSITORY}/releases)`
}

export function renderChangelog(releases) {
  if (!Array.isArray(releases)) throw new Error('GitHub releases response must be a list')
  const stable = releases
    .filter((release) => !release.draft && !release.prerelease && safeTag(release))
    .sort((a, b) => String(b.published_at ?? '').localeCompare(String(a.published_at ?? '')))
    .slice(0, 30)
  if (!stable.length) throw new Error('No published stable releases found')
  return stable
    .map((release) => {
      const tag = safeTag(release)
      return `### [${tag}](${releaseUrl(tag)}) · ${String(release.published_at ?? '').slice(0, 10)}\n\n${releaseSummary(release.body)}`
    })
    .join('\n\n')
}

export function replaceReleaseBlock(contents, replacement) {
  const begin = contents.indexOf(START)
  const finish = contents.indexOf(END)
  if (
    begin < 0 ||
    finish < begin ||
    contents.indexOf(START, begin + 1) !== -1 ||
    contents.indexOf(END, finish + 1) !== -1
  ) {
    throw new Error('Missing or repeated GitHub release page markers')
  }
  return `${contents.slice(0, begin + START.length)}\n${replacement.trim()}\n${contents.slice(finish)}`
}

export function syncPages(originals, latest, releases) {
  return {
    korean: replaceReleaseBlock(originals.korean, renderLatestKorean(latest)),
    english: replaceReleaseBlock(originals.english, renderLatestEnglish(latest)),
    changelog: replaceReleaseBlock(originals.changelog, renderChangelog(releases)),
  }
}

async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'HangulAIWorkbench-release-page-sync',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`GitHub API failed: ${path} (${response.status})`)
  return response.json()
}

async function main() {
  const check = process.argv.includes('--check')
  const [latest, releases] = await Promise.all([
    github('/releases/latest'),
    github('/releases?per_page=100'),
  ])
  const paths = {
    korean: resolve(ROOT, 'README.md'),
    english: resolve(ROOT, 'README.en.md'),
    changelog: resolve(ROOT, 'CHANGELOG.md'),
  }
  const originals = Object.fromEntries(
    Object.entries(paths).map(([key, path]) => [key, readFileSync(path, 'utf8')]),
  )
  const next = syncPages(originals, latest, releases)
  let changed = 0
  for (const [key, path] of Object.entries(paths)) {
    // Release-triggered commits are checked by CI's Prettier gate. Normalize
    // the generated section before committing so every update remains green.
    const formatted = await prettier.format(next[key], {
      ...(await prettier.resolveConfig(path)),
      filepath: path,
    })
    if (originals[key] === formatted) continue
    changed++
    if (!check) writeFileSync(path, formatted)
  }
  console.log(
    `GitHub release ${latest.tag_name}: ${changed} page(s) ${check ? 'outdated' : 'refreshed'}`,
  )
  if (check && changed) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

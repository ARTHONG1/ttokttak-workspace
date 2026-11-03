import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { nonAsciiProductNames, staleOutputs } = require('../../../scripts/release-guard.cjs') as {
  nonAsciiProductNames: (bundle: string) => string[]
  staleOutputs: (
    outputs: Array<{ path: string; mtimeMs: number }>,
    sources: Array<{ path: string; mtimeMs: number }>,
  ) => Array<{ output: string; newerSource: string }>
}

// 2026-11-03: a shell bundle built from uncommitted work carried
// PRODUCT_NAME = "똑딱작업실"; it is the AI User-Agent and Codex client name,
// so every AI request failed with "Cannot convert argument to a ByteString".
describe('release guard: product name in a built bundle', () => {
  it('flags a Korean PRODUCT_NAME', () => {
    expect(nonAsciiProductNames('const PRODUCT_NAME = "똑딱작업실";\nlet x = 1')).toEqual(['똑딱작업실'])
  })

  it('accepts the Latin name, also when the bundler renamed the binding', () => {
    expect(nonAsciiProductNames('const PRODUCT_NAME = "HangulAIWorkbench";')).toEqual([])
    expect(nonAsciiProductNames('const PRODUCT_NAME$1 = "HangulAIWorkbench";')).toEqual([])
    expect(nonAsciiProductNames('const PRODUCT_NAME$2 = "똑딱";')).toEqual(['똑딱'])
  })

  it('ignores the Korean display name, which never goes into headers', () => {
    expect(nonAsciiProductNames('function productName(_lang) { return "똑딱작업실"; }')).toEqual([])
  })
})

describe('release guard: build output older than the sources', () => {
  it('reports an output built before a source change', () => {
    const outputs = [{ path: 'apps/shell/out/main/index.js', mtimeMs: 1000 }]
    const sources = [
      { path: 'packages/i18n/src/product.ts', mtimeMs: 2000 },
      { path: 'apps/shell/src/main/index.ts', mtimeMs: 500 },
    ]
    expect(staleOutputs(outputs, sources)).toEqual([
      { output: 'apps/shell/out/main/index.js', newerSource: 'packages/i18n/src/product.ts' },
    ])
  })

  it('passes outputs built after every source change', () => {
    const outputs = [{ path: 'apps/hwp/out/main/index.js', mtimeMs: 3000 }]
    const sources = [{ path: 'packages/i18n/src/product.ts', mtimeMs: 2000 }]
    expect(staleOutputs(outputs, sources)).toEqual([])
  })
})

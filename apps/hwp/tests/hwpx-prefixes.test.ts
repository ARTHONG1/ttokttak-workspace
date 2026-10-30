/**
 * The engine splices a numbering's paraHead elements verbatim from the opened HWPX, prefix
 * and all, into a header that does not declare that prefix (2026-10-30: `<ns0:paraHead>`
 * in 16 of 114 local documents; Hancom refuses them as damaged). The save binds such a
 * prefix to the one the output declares for the same namespace.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import JSZip from 'jszip'
import { bindCopiedPrefixes, hwpxNamespacesOf } from '../src/main/hwpx-prefixes'
import { validateHwpxBeforeOverwrite } from '../src/main/hwpx-save-validation'
import { applySaveFixes } from '../src/main/save-fixes'

const require = createRequire(import.meta.url)
const opened = readFileSync(join(import.meta.dirname, 'fixtures', 'header-picture-and-text.hwpx'))

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')) })
})

const header = async (bytes: Uint8Array) =>
  (await JSZip.loadAsync(bytes)).file('Contents/header.xml')!.async('string')

function edited(): Uint8Array {
  const doc = new HwpDocument(opened)
  doc.insertText(0, 0, 0, '[검토완료] ')
  return doc.exportHwpx()
}

describe('bindCopiedPrefixes', () => {
  it('reproduces the engine writing an undeclared ns0 prefix', async () => {
    const bytes = edited()
    expect(await header(bytes)).toContain('<ns0:paraHead')
    expect(await validateHwpxBeforeOverwrite(bytes)).toMatch(/prefix ns0/)
  })

  it('renames it to the prefix the output declares for the same namespace', async () => {
    const result = bindCopiedPrefixes(edited(), hwpxNamespacesOf(opened) ?? undefined)
    expect(result.renamed).toBeGreaterThan(0)
    const xml = await header(result.bytes)
    expect(xml).not.toContain('ns0:')
    expect(xml).toContain('<hh:paraHead')
    expect(await validateHwpxBeforeOverwrite(result.bytes)).toBeNull()
  })

  it('is part of every HWPX save fix, and the engine reads the result back', async () => {
    const bytes = applySaveFixes(edited(), 'hwpx', undefined, {
      namespaces: hwpxNamespacesOf(opened) ?? undefined,
    }).bytes
    expect(await validateHwpxBeforeOverwrite(bytes)).toBeNull()
    expect(new HwpDocument(bytes).pageCount()).toBe(new HwpDocument(opened).pageCount())
  })

  it('leaves a prefix alone when the opened file does not say what it meant', () => {
    const bytes = edited()
    expect(bindCopiedPrefixes(bytes, new Map([['hh', 'http://www.hancom.co.kr/hwpml/2011/head']]))).toEqual({
      bytes,
      renamed: 0,
    })
    expect(bindCopiedPrefixes(bytes, undefined)).toEqual({ bytes, renamed: 0 })
  })
})


/**
 * The engine rewrites every master page on save, renumbering its ids and dropping empty
 * text runs, so no edit of a HWPX with a master page could pass the byte-exact pre-write
 * check (2026-10-30). The save puts the original back when nothing else differs.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import JSZip from 'jszip'
import { hwpxMasterPagesOf, restoreUnchangedMasterPages } from '../src/main/hwpx-master-pages'
import { validateHwpxBeforeOverwrite } from '../src/main/hwpx-save-validation'
import { applySaveFixes } from '../src/main/save-fixes'

const require = createRequire(import.meta.url)
const opened = readFileSync(join(import.meta.dirname, 'fixtures', 'master-page-next-section.hwpx'))

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')) })
})

function edited(): Uint8Array {
  const doc = new HwpDocument(opened)
  doc.insertText(0, 0, 0, '[검토완료] ')
  return doc.exportHwpx()
}

const masterPage = async (bytes: Uint8Array) =>
  (await JSZip.loadAsync(bytes)).file('Contents/masterpage0.xml')!.async('string')

describe('restoreUnchangedMasterPages', () => {
  it('reproduces the engine rewriting an untouched master page', async () => {
    const bytes = edited()
    expect(await masterPage(bytes)).not.toBe(await masterPage(opened))
    expect(await validateHwpxBeforeOverwrite(bytes, opened)).toMatch(/master page changed/)
  })

  it('puts the original back, so the edited document can be saved', async () => {
    const result = restoreUnchangedMasterPages(edited(), hwpxMasterPagesOf(opened) ?? undefined)
    expect(result.restored).toBe(1)
    expect(await masterPage(result.bytes)).toBe(await masterPage(opened))
    expect(await validateHwpxBeforeOverwrite(result.bytes, opened)).toBeNull()
  })

  it('is part of every HWPX save fix, and the edit is still there', async () => {
    const bytes = applySaveFixes(edited(), 'hwpx', undefined, {
      masterPages: hwpxMasterPagesOf(opened) ?? undefined,
    }).bytes
    expect(await validateHwpxBeforeOverwrite(bytes, opened)).toBeNull()
    const reopened = new HwpDocument(bytes)
    expect(reopened.pageCount()).toBe(new HwpDocument(opened).pageCount())
    expect(JSON.parse(reopened.getTextFileText())).toContain('[검토완료] ')
  })

  it('keeps the engine version when the master page content really differs', async () => {
    const original = await masterPage(opened)
    const changed = new Map([['Contents/masterpage0.xml', original.replace('MASTER BAND', 'OTHER BAND')]])
    const bytes = edited()
    expect(restoreUnchangedMasterPages(bytes, changed)).toEqual({ bytes, restored: 0 })
  })
})


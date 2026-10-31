import { mkdtempSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DriveApi, DriveFile } from '@genoffice/google-drive'
import { MAX_ATTACH_FILES, downloadPicks, expandPicks } from '../src/main/drive/drive-attach'

const file = (id: string, name: string, mimeType = 'application/pdf'): DriveFile => ({
  id,
  name,
  mimeType,
  modifiedTime: '2026-10-01T00:00:00Z',
  canEdit: true,
})

/** a Drive with one folder of pages, and a few loose files */
function fakeDrive(folderPages: DriveFile[][], loose: DriveFile[] = []): DriveApi {
  const all = new Map([...folderPages.flat(), ...loose].map((f) => [f.id, f]))
  return {
    list: async (_listing: unknown, options: { pageToken?: string } = {}) => {
      const index = options.pageToken ? Number(options.pageToken) : 0
      const files = folderPages[index] ?? []
      return index + 1 < folderPages.length
        ? { ok: true, files, nextPageToken: String(index + 1) }
        : { ok: true, files }
    },
    file: async (id: string) => {
      const f = all.get(id)
      return f ? { ok: true, file: f } : { ok: false, kind: 'not-found' }
    },
    download: async (id: string) =>
      id === 'broken'
        ? { ok: false, kind: 'forbidden' }
        : { ok: true, bytes: Buffer.from(`bytes of ${id}`) },
    export: async (id: string, mime: string) => ({
      ok: true,
      bytes: Buffer.from(`${id} as ${mime}`),
    }),
  } as unknown as DriveApi
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'drive-attach-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('expandPicks', () => {
  it('opens a ticked folder one level and leaves out what no editor reads', async () => {
    const api = fakeDrive([
      [
        file('a', 'a.pdf'),
        file('sub', 'sub', 'application/vnd.google-apps.folder'),
        file('v', 'clip.mp4', 'video/mp4'),
        file('g', 'notes', 'application/vnd.google-apps.document'),
      ],
    ])
    expect(await expandPicks(api, [{ id: 'folder', folder: true }])).toEqual({
      ids: ['a', 'g'],
      skipped: 1,
      failed: 0,
    })
  })

  it('stops at the limit and counts what is left out', async () => {
    const many = Array.from({ length: MAX_ATTACH_FILES + 3 }, (_, i) => file(`f${i}`, `${i}.pdf`))
    const api = fakeDrive([many.slice(0, 10), many.slice(10)])
    const got = await expandPicks(api, [{ id: 'folder', folder: true }])
    expect(got.ids).toHaveLength(MAX_ATTACH_FILES)
    expect(got.skipped).toBe(3)
  })

  it('does not attach the same file twice', async () => {
    const api = fakeDrive([[file('a', 'a.pdf')]], [file('a', 'a.pdf')])
    const got = await expandPicks(api, [
      { id: 'a', folder: false },
      { id: 'folder', folder: true },
    ])
    expect(got.ids).toEqual(['a'])
  })
})

describe('downloadPicks', () => {
  it('downloads files and exports Google documents, each into its own folder', async () => {
    const api = fakeDrive(
      [],
      [file('p', 'report.pdf'), file('g', '회의록', 'application/vnd.google-apps.document')],
    )
    const got = await downloadPicks(
      api,
      [
        { id: 'p', folder: false },
        { id: 'g', folder: false },
      ],
      dir,
    )
    expect(got.failed).toBe(0)
    expect(got.paths).toHaveLength(2)
    expect(got.paths[0]!.endsWith('report.pdf')).toBe(true)
    expect(got.paths[1]!.endsWith('회의록.docx')).toBe(true)
    expect(readFileSync(got.paths[0]!, 'utf8')).toBe('bytes of p')
    expect(got.paths.every((p) => p.startsWith(dir))).toBe(true)
  })

  it('counts files Drive would not hand over', async () => {
    const api = fakeDrive([], [file('broken', 'x.pdf')])
    const got = await downloadPicks(
      api,
      [
        { id: 'broken', folder: false },
        { id: 'missing', folder: false },
      ],
      dir,
    )
    expect(got).toEqual({ paths: [], skipped: 0, failed: 2 })
  })
})

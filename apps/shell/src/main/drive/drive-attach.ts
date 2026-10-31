/**
 * Drive files for an AI panel's attachments (decision 0033): ticked files and
 * the files directly inside ticked folders, at most MAX_ATTACH_FILES, each
 * downloaded (a Google document exported to Office) into its own folder under
 * a temporary directory. The editor then attaches the paths as it does files
 * from this PC, so its attachment reader (and the hiding it applies) is the
 * same. Copies older than a week are removed the first time the folder is
 * used in a run.
 */
import { randomBytes } from 'node:crypto'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  FOLDER_MIME,
  MAX_READ_BYTES,
  localFileName,
  openPlan,
  type DriveApi,
  type DriveFile,
} from '@genoffice/google-drive'
import type { DrivePick } from '../../shared/drive-picker-api'

export const MAX_ATTACH_FILES = 20
const KEEP_MS = 7 * 24 * 60 * 60 * 1000

export interface AttachDownload {
  paths: string[]
  skipped: number
  failed: number
}

/** The files a set of picks stands for, folders opened one level, capped */
export async function expandPicks(
  api: DriveApi,
  picks: readonly DrivePick[],
): Promise<{ ids: string[]; skipped: number; failed: number }> {
  const ids: string[] = []
  const seen = new Set<string>()
  let skipped = 0
  let failed = 0
  const add = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    if (ids.length < MAX_ATTACH_FILES) ids.push(id)
    else skipped += 1
  }
  for (const pick of picks) {
    if (!pick.folder) {
      add(pick.id)
      continue
    }
    let pageToken: string | undefined
    do {
      const page = await api.list({ kind: 'folder', folderId: pick.id }, { pageToken })
      if (!page.ok) {
        failed += 1
        break
      }
      for (const file of page.files) {
        const target = file.shortcutTarget
          ? { name: file.name, mimeType: file.shortcutTarget.mimeType }
          : file
        if (target.mimeType === FOLDER_MIME) continue
        if (openPlan(target).kind === 'none') skipped += 1
        else add(file.shortcutTarget?.id ?? file.id)
      }
      pageToken = ids.length < MAX_ATTACH_FILES ? page.nextPageToken : undefined
    } while (pageToken)
  }
  return { ids, skipped, failed }
}

let pruned = false

async function pruneOld(dir: string, now: number): Promise<void> {
  if (pruned) return
  pruned = true
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    if (info && now - info.mtimeMs > KEEP_MS) await rm(path, { recursive: true, force: true })
  }
}

/** Download what the picks stand for into `dir`; never throws */
export async function downloadPicks(
  api: DriveApi,
  picks: readonly DrivePick[],
  dir: string,
  now: number = Date.now(),
): Promise<AttachDownload> {
  await mkdir(dir, { recursive: true })
  await pruneOld(dir, now).catch(() => {})
  const expanded = await expandPicks(api, picks)
  const out: AttachDownload = { paths: [], skipped: expanded.skipped, failed: expanded.failed }
  for (const id of expanded.ids) {
    const meta = await api.file(id)
    if (!meta.ok) {
      out.failed += 1
      continue
    }
    let file: DriveFile = meta.file
    if (file.shortcutTarget) {
      const target = await api.file(file.shortcutTarget.id)
      if (!target.ok) {
        out.failed += 1
        continue
      }
      file = target.file
    }
    const plan = openPlan(file)
    if (plan.kind === 'none') {
      out.skipped += 1
      continue
    }
    const got =
      plan.kind === 'export'
        ? await api.export(file.id, plan.mime, MAX_READ_BYTES)
        : await api.download(file.id, MAX_READ_BYTES)
    if (!got.ok) {
      out.failed += 1
      continue
    }
    try {
      const folder = join(dir, randomBytes(6).toString('hex'))
      await mkdir(folder)
      const path = join(folder, localFileName(file.name, plan.extension))
      await writeFile(path, got.bytes)
      out.paths.push(path)
    } catch {
      out.failed += 1
    }
  }
  return out
}

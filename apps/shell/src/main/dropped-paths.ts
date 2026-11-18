import { isAbsolute, relative, resolve, sep } from 'node:path'

/**
 * The paths of documents dropped on a 똑딱업무 page (똑딱정리, 문서 변환, 똑딱서명):
 * webUtils.getPathForFile on the desktop, the session's upload on the web edition. Null when
 * the page sent something else. Kinds and counts are left to each tool, which has the
 * messages for them. On the web edition only files inside this session's own folder are taken.
 */
export function droppedPaths(raw: unknown, sessionDir?: string): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) return null
  if (!raw.every((p): p is string => typeof p === 'string' && p.length < 4096 && isAbsolute(p)))
    return null
  if (sessionDir) {
    const root = resolve(sessionDir)
    const inside = (p: string) => {
      const rel = relative(root, resolve(p))
      return rel !== '' && !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel)
    }
    if (!raw.every(inside)) return null
  }
  return raw
}

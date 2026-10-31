/** Block a destructive write before making a backup or replacing the original. */
export function saveIntegrityBlocker(tailsSkipped: unknown, memosLost: number): string | null {
  if (tailsSkipped !== undefined) {
    return 'hwp: save blocked because master pages or memos could not be restored'
  }
  if (memosLost > 0) {
    return `hwp: save blocked because ${memosLost} memo(s) would be lost`
  }
  return null
}

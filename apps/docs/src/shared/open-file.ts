/** File formats the Word editor opens and saves; the extension decides which. */
export type DocFormat = 'docx' | 'odt'

/** `.docx` → docx, `.odt` → odt, anything else → null (not a Word-editor document) */
export function docFormatOfPath(filePath: string): DocFormat | null {
  if (/\.docx$/i.test(filePath)) return 'docx'
  if (/\.odt$/i.test(filePath)) return 'odt'
  return null
}

export function findDocxPath(argv: readonly string[]): string | null {
  return (
    argv.find((arg) => {
      const value = arg.trim()
      return value.length > 0 && !value.startsWith('-') && docFormatOfPath(value) !== null
    }) ?? null
  )
}

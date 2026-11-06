import { markdownToHwpx, parse } from 'kordoc'

/**
 * 문서 변환's PDF → Hangul stage: the Word document the PDF → Word stage wrote, read into
 * headings, paragraphs, tables and pictures by kordoc and written out as a new HWPX in its
 * plain layout. The words and table rows arrive as they were (the PDF → Word stage keeps
 * the spacing a direct PDF reading loses); fonts and placement are kordoc's defaults, which
 * the card and the result say. No public-document preset: it would renumber items, move a
 * total row to the top and append "끝.".
 */

export const DOCX_HWPX_NOTE = '글·표·그림을 옮겼어요. 글꼴과 배치는 한글 기본 양식으로 바뀌어요.'

export async function docxToHwpx(docx: Uint8Array): Promise<Uint8Array> {
  const parsed = await parse(Buffer.from(docx.buffer, docx.byteOffset, docx.byteLength))
  if (!parsed.success) throw new Error('could not read the Word document: ' + parsed.error)
  const markdown = parsed.markdown.trim()
  const images = Object.fromEntries((parsed.images ?? []).map((i) => [i.filename, i.data]))
  if (!markdown) throw new Error('the Word document has nothing to carry over')
  return new Uint8Array(await markdownToHwpx(markdown, { images }))
}

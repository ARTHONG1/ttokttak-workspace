import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
for (const f of process.argv.slice(2)) {
  const data = new Uint8Array(readFileSync(f))
  const sha = createHash('sha256').update(data).digest('hex')
  const doc = await getDocument({ data, verbosity: 0 }).promise
  let all = ''
  const per = []
  for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); const t = (await p.getTextContent()).items.map(x => x.str).join(''); per.push(t.length); all += t }
  console.log(JSON.stringify({ f, bytes: data.length, sha, pages: doc.numPages, marker: all.includes('IMPORTED_PDF_AI_20261029'), chars: per }))
}

import { readFile, mkdtemp, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function syntheticPdf() {
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-qa-golden-'))
  const source = join(dir, 'generated.pdf')
  const pdf = await PDFDocument.create()
  pdf.setCreationDate(new Date('2026-01-01T00:00:00Z'))
  pdf.setModificationDate(new Date('2026-01-01T00:00:00Z'))
  const page = pdf.addPage([400, 600])
  pdf.addPage([612, 792])
  const radio = pdf.getForm().createRadioGroup('answer')
  radio.addOptionToPage('yes', page, { x: 10, y: 10, width: 15, height: 15 })
  radio.addOptionToPage('no', page, { x: 30, y: 10, width: 15, height: 15 })
  await writeFile(source, await pdf.save({ useObjectStreams: false }))
  return source
}

export async function loadCases(entries) {
  entries ??= JSON.parse(
    await readFile(new URL('./fixtures-manifest.json', import.meta.url), 'utf8'),
  )
  const cases = []
  for (const entry of entries) {
    if (!['docx', 'hwp', 'hwpx', 'xlsx', 'pptx', 'pdf'].includes(entry.format)) {
      throw new Error(`Unsupported fixture format ${entry.format}`)
    }
    const generated = entry.source === 'generated:pdf-blank-two-pages' && entry.format === 'pdf'
    const source = generated ? await syntheticPdf() : resolve(ROOT, entry.source)
    const hash = sha256(await readFile(source)) // missing source raises ENOENT
    if (!generated && hash !== entry.hash) {
      throw new Error(`Fixture hash mismatch for ${entry.id}: expected ${entry.hash}, got ${hash}`)
    }
    cases.push({ ...entry, source, hash })
  }
  return cases
}

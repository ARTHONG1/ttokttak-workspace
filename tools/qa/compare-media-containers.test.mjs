import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import { compareMediaDocuments } from './compare-media-containers.mjs'

test('XLSX detects removed formula, worksheet and style part', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qa-xlsx-'))
  try {
    const a = new JSZip(),
      b = new JSZip()
    a.file('xl/worksheets/sheet1.xml', '<worksheet><c><f>A1*3</f><v>6</v></c></worksheet>')
    b.file('xl/worksheets/sheet1.xml', '<worksheet><c><v>6</v></c></worksheet>')
    a.file('xl/styles.xml', '<styleSheet/>')
    const before = join(dir, 'a.xlsx'),
      after = join(dir, 'b.xlsx')
    await writeFile(before, await a.generateAsync({ type: 'nodebuffer' }))
    await writeFile(after, await b.generateAsync({ type: 'nodebuffer' }))
    const result = await compareMediaDocuments({ before, after, format: 'xlsx' })
    assert.ok(result.unexpectedRemovals.some((v) => v.includes('styles.xml')))
    assert.ok(result.unexpectedRemovals.some((v) => v.includes('formula')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('PPTX detects removed slide and master part', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qa-pptx-'))
  try {
    const a = new JSZip(),
      b = new JSZip()
    a.file('ppt/slides/slide1.xml', '<p:sld/>')
    a.file('ppt/slideMasters/slideMaster1.xml', '<p:sldMaster/>')
    b.file('ppt/slides/slide1.xml', '<p:sld/>')
    const before = join(dir, 'a.pptx'),
      after = join(dir, 'b.pptx')
    await writeFile(before, await a.generateAsync({ type: 'nodebuffer' }))
    await writeFile(after, await b.generateAsync({ type: 'nodebuffer' }))
    const result = await compareMediaDocuments({ before, after, format: 'pptx' })
    assert.ok(result.unexpectedRemovals.some((v) => v.includes('slideMaster1.xml')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('PDF distinguishes six logical AcroForm fields from seven radio widgets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qa-pdf-'))
  try {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([612, 792]),
      form = pdf.getForm()
    const radio = form.createRadioGroup('choices')
    radio.addOptionToPage('a', page, { x: 10, y: 10, width: 15, height: 15 })
    radio.addOptionToPage('b', page, { x: 30, y: 10, width: 15, height: 15 })
    for (let i = 0; i < 5; i++)
      form
        .createTextField(`t${i}`)
        .addToPage(page, { x: 10, y: 50 + i * 20, width: 60, height: 15 })
    const before = join(dir, 'before.pdf'),
      after = join(dir, 'after.pdf')
    await writeFile(before, await pdf.save())
    await writeFile(after, await pdf.save())
    const result = await compareMediaDocuments({ before, after, format: 'pdf' })
    assert.equal(result.unreadable, false)
    assert.deepEqual(result.unexpectedRemovals, [])
    assert.equal(result.details.before.logicalFields, 6)
    assert.equal(result.details.before.widgets, 7)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('PDF detects lost radio widget and lost page', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qa-pdf-'))
  try {
    const pdf = await PDFDocument.create(),
      page = pdf.addPage([400, 600])
    pdf.addPage([500, 600])
    pdf.getForm().createCheckBox('ok').addToPage(page, { x: 10, y: 10, width: 10, height: 10 })
    const before = join(dir, 'before.pdf'),
      after = join(dir, 'after.pdf')
    await writeFile(before, await pdf.save())
    pdf.removePage(1)
    pdf.getForm().removeField(pdf.getForm().getCheckBox('ok'))
    await writeFile(after, await pdf.save())
    const result = await compareMediaDocuments({ before, after, format: 'pdf' })
    assert.ok(result.unexpectedRemovals.some((v) => v.includes('page')))
    assert.ok(result.unexpectedRemovals.some((v) => v.includes('ok')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

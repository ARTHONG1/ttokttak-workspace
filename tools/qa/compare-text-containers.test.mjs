import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { compareTextDocuments } from './compare-text-containers.mjs'

test('DOCX detects lost header parts, tables and tracked revisions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qa-docx-'))
  try {
    async function archive(name, files) {
      const zip = new JSZip()
      for (const [key, xml] of Object.entries(files)) zip.file(key, xml)
      const path = join(dir, name)
      await writeFile(path, await zip.generateAsync({ type: 'nodebuffer' }))
      return path
    }
    const before = await archive('before.docx', {
      'word/document.xml': '<w:document><w:tbl/><w:ins/><w:commentRangeStart/></w:document>',
      'word/header1.xml': '<w:hdr><w:t>Header</w:t></w:hdr>',
    })
    const after = await archive('after.docx', {
      'word/document.xml': '<w:document></w:document>',
    })
    const result = await compareTextDocuments({ before, after, format: 'docx' })
    assert.equal(result.unreadable, false)
    assert.ok(result.unexpectedRemovals.some((v) => v.includes('header1.xml')))
    assert.ok(result.unexpectedRemovals.some((v) => v.includes('tbl')))
    assert.ok(result.unexpectedRemovals.some((v) => v.includes('ins')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('HWPX flags lost section master content even if the zip still opens', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qa-hwpx-'))
  try {
    const a = new JSZip(),
      b = new JSZip()
    a.file('Contents/section0.xml', '<hp:sec><hp:tbl/><hp:footNote/></hp:sec>')
    b.file('Contents/section0.xml', '<hp:sec></hp:sec>')
    const before = join(dir, 'a.hwpx'),
      after = join(dir, 'b.hwpx')
    await writeFile(before, await a.generateAsync({ type: 'nodebuffer' }))
    await writeFile(after, await b.generateAsync({ type: 'nodebuffer' }))
    const result = await compareTextDocuments({ before, after, format: 'hwpx' })
    assert.ok(result.unexpectedRemovals.some((v) => v.includes('tbl')))
    assert.ok(result.unexpectedRemovals.some((v) => v.includes('footNote')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('malformed HWPX XML is unreadable even when its ZIP CRC is valid', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qa-malformed-'))
  try {
    const a = new JSZip(),
      b = new JSZip()
    a.file('Contents/section0.xml', '<hp:sec><hp:p/></hp:sec>')
    b.file('Contents/section0.xml', '<hp:sec><hp:p/></hp:sect>')
    const before = join(dir, 'before.hwpx'),
      after = join(dir, 'after.hwpx')
    await writeFile(before, await a.generateAsync({ type: 'nodebuffer' }))
    await writeFile(after, await b.generateAsync({ type: 'nodebuffer' }))
    const verdict = await compareTextDocuments({ before, after, format: 'hwpx' })
    assert.equal(verdict.unreadable, true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

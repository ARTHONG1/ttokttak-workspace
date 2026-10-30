import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFName } from 'pdf-lib'
import { compareArchives } from './archive-structure.mjs'

function pdfStructure(doc) {
  const fields = doc.getForm().getFields()
  const perField = Object.fromEntries(
    fields.map((field) => [field.getName(), field.acroField.getWidgets().length]),
  )
  return {
    pages: doc.getPageCount(),
    logicalFields: fields.length,
    widgets: Object.values(perField).reduce((sum, count) => sum + count, 0),
    perField,
    pageAnnotations: doc.getPages().map((page) => page.node.Annots()?.size() ?? 0),
  }
}

export async function compareMediaDocuments({ before, after, format, allowedChanges = [] }) {
  if (format === 'xlsx') {
    const result = await compareArchives({
      before,
      after,
      allowedChanges,
      protectedTags: [
        'f',
        'mergeCell',
        'conditionalFormatting',
        'dataValidation',
        'drawing',
        'tablePart',
        'pivotTable',
      ],
      protectedParts: /^xl\/(styles\.xml|theme\/|pivot|drawings\/|charts\/|externalLinks\/)/i,
    })
    // Keep the human-readable reference to formulas in release diagnostics.
    result.unexpectedRemovals = result.unexpectedRemovals.map((s) =>
      s.replace(/: f (\d+)/, ': formula $1'),
    )
    return result
  }
  if (format === 'pptx') {
    return compareArchives({
      before,
      after,
      allowedChanges,
      protectedTags: ['sp', 'pic', 'graphicFrame', 'cxnSp', 'oleObj', 'transition', 'anim'],
      protectedParts: /^ppt\/(slideMasters\/|slideLayouts\/|theme\/|media\/)/i,
    })
  }
  if (format === 'pdf') {
    const details = { validation: 'pdf-lib parser; external viewer reopen not verified' }
    try {
      const first = pdfStructure(await PDFDocument.load(await readFile(before)))
      const second = pdfStructure(await PDFDocument.load(await readFile(after)))
      details.before = first
      details.after = second
      const unexpectedRemovals = []
      if (first.pages > second.pages && !allowedChanges.includes('remove:page')) {
        unexpectedRemovals.push(`page count ${first.pages} -> ${second.pages}`)
      }
      for (const [name, count] of Object.entries(first.perField)) {
        if ((second.perField[name] ?? 0) < count && !allowedChanges.includes(`remove:${name}`)) {
          unexpectedRemovals.push(`field ${name} widgets ${count} -> ${second.perField[name] ?? 0}`)
        }
      }
      first.pageAnnotations.forEach((count, index) => {
        if (
          index < second.pageAnnotations.length &&
          count > second.pageAnnotations[index] &&
          !allowedChanges.includes(`remove:annotations:${index}`)
        ) {
          unexpectedRemovals.push(
            `page ${index + 1} annotations ${count} -> ${second.pageAnnotations[index]}`,
          )
        }
      })
      return { unexpectedRemovals, unreadable: false, details }
    } catch (error) {
      return {
        unexpectedRemovals: [],
        unreadable: true,
        details: { ...details, error: String(error) },
      }
    }
  }
  throw new Error(`Unsupported media format: ${format}`)
}

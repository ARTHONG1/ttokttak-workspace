import {
  csvToXlsxBuffer,
  decodeCsvBuffer,
  parseCsv,
  sniffDelimiter,
} from '@genoffice/xlsx-gateway/gateway/csv-import'
import { normalizeLang, type Lang } from '@genoffice/i18n'
import { cutIndex } from '../preview'

/**
 * The legacy charset Excel writes CSV in on this machine, from the same language the app
 * uses (GENOFFICE_LANG, else the system locale). Without it the CLI broke the tie between
 * GBK and the Korean code page the wrong way and read a Korean Excel CSV as Chinese.
 */
export function legacyCsvCharset(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const byLang: Partial<Record<Lang, string>> = {
    zh: 'gb18030',
    'zh-TW': 'big5',
    ja: 'shift_jis',
    ko: 'euc-kr',
  }
  const raw =
    env.GENOFFICE_LANG ||
    env.LC_ALL ||
    env.LC_MESSAGES ||
    env.LANG ||
    Intl.DateTimeFormat().resolvedOptions().locale
  return byLang[normalizeLang(raw)]
}

/** CSV bytes as text, with the machine's legacy charset breaking ties. */
export function decodeCsv(bytes: Uint8Array): string {
  return decodeCsvBuffer(bytes, legacyCsvCharset())
}

export interface CsvInfo {
  rows: number
  columns: number
  delimiter: string
}

export function csvInfo(bytes: Uint8Array): CsvInfo {
  const text = decodeCsv(bytes)
  const delimiter = sniffDelimiter(text)
  const rows = parseCsv(text, delimiter)
  return {
    rows: rows.length,
    columns: rows.reduce((max, r) => Math.max(max, r.length), 0),
    delimiter,
  }
}

export async function csvToXlsx(bytes: Uint8Array, sheetName: string): Promise<Uint8Array> {
  const buf = await csvToXlsxBuffer(decodeCsv(bytes), sheetName)
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

/** Excel sheet name from a file stem: forbidden characters become `_`, edge apostrophes go, 31 chars max. */
export function sheetNameFromStem(stem: string): string {
  const cleaned = stem.replace(/[\\/?*[\]:]/g, '_').replace(/^'+|'+$/g, '')
  // 31 UTF-16 units; the cut must not land inside an emoji or it leaves a lone surrogate
  const name = cleaned.slice(0, cutIndex(cleaned, 0, 31)).replace(/'+$/, '')
  return name || 'Sheet1'
}

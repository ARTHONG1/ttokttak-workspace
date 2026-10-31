import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import {
  ATTACHABLE_IMAGE_MAX_BYTES,
  ATTACHABLE_MAX_BYTES,
  parseFileToText,
} from '@genoffice/file-parse'
import type { CartFileKind, CartFileResult } from '../shared/home-api'

/**
 * 특화 기능 > 품의서 생성: the 장바구니 내용 read from a file, as the ACE AI 품의서 생성기
 * does with its 이미지·한글·PDF·엑셀 buttons. HWP, PDF and spreadsheets go through
 * the same text extraction the AI panels use; an image comes back as bytes for the
 * renderer to hand to the AI, which reads the text in it.
 */

export const CART_FILE_EXTENSIONS: Record<CartFileKind, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
  hwp: ['hwp', 'hwpx'],
  pdf: ['pdf'],
  excel: ['xlsx', 'xlsm', 'csv', 'tsv', 'xls'],
}

export const CART_FILE_FILTER_NAMES: Record<CartFileKind, string> = {
  image: '이미지',
  hwp: '한글 문서',
  pdf: 'PDF',
  excel: '엑셀·CSV',
}

const IMAGE_MIMES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

/** text longer than this is cut: a cart is a page or two, and the AI turn has a limit */
export const CART_TEXT_MAX_CHARS = 30_000

export function isCartFileKind(value: unknown): value is CartFileKind {
  return value === 'image' || value === 'hwp' || value === 'pdf' || value === 'excel'
}

export async function readCartFile(path: string, kind: CartFileKind): Promise<CartFileResult> {
  const name = basename(path)
  const ext = extname(path).slice(1).toLowerCase()
  if (!CART_FILE_EXTENSIONS[kind].includes(ext)) {
    return { ok: false, error: name + '은(는) 이 버튼으로 읽을 수 없는 형식이에요.' }
  }
  if (ext === 'xls') {
    return {
      ok: false,
      error: '예전 엑셀 형식(.xls)은 읽을 수 없어요. 엑셀에서 .xlsx로 저장한 뒤 다시 골라 주세요.',
    }
  }
  let size: number
  try {
    size = (await stat(path)).size
  } catch {
    return { ok: false, error: name + '을(를) 찾을 수 없어요.' }
  }
  if (kind === 'image') {
    if (size > ATTACHABLE_IMAGE_MAX_BYTES) {
      return { ok: false, error: '이미지가 너무 커요. 5MB 이하로 줄여 주세요.' }
    }
    const bytes = await readFile(path)
    return {
      ok: true,
      kind: 'image',
      name,
      mime: IMAGE_MIMES[ext],
      base64: bytes.toString('base64'),
    }
  }
  if (size > ATTACHABLE_MAX_BYTES) {
    return { ok: false, error: '파일이 너무 커요. 50MB 이하 파일을 골라 주세요.' }
  }
  const parsed = await parseFileToText(path)
  if (!parsed.ok || typeof parsed.text !== 'string') {
    return { ok: false, error: name + '에서 글을 읽지 못했어요.' }
  }
  const text = parsed.text.trim()
  if (!text) {
    return {
      ok: false,
      error:
        name +
        '에 읽을 글이 없어요.' +
        (kind === 'pdf' ? ' 사진으로 된 PDF라면 화면을 캡처해 이미지로 올려 주세요.' : ''),
    }
  }
  return {
    ok: true,
    kind: 'text',
    name,
    text: text.length > CART_TEXT_MAX_CHARS ? text.slice(0, CART_TEXT_MAX_CHARS) : text,
    truncated: text.length > CART_TEXT_MAX_CHARS,
  }
}

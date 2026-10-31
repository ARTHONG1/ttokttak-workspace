import { PDFDocument } from 'pdf-lib'
import {
  answerCells,
  cardWords,
  type Matching,
  type Puzzle,
  type SearchSettings,
} from './wordsearch-model'

/**
 * 똑딱퀴즈 > 단어 찾기's PDFs, laid out as the original prints them on A4: the sheet (a name
 * line, the words to find, the grid), the answer (the words in the grid marked), the word
 * and meaning list, the sentence sheet (two lines a word), the matching sheet (words left,
 * shuffled meanings right) and 3×3 word and meaning cards. Each page is drawn on a canvas
 * and placed in the PDF as a picture, as the original does with its page captures.
 */

export type SearchSheet = 'puzzle' | 'answer' | 'definitions' | 'sentences' | 'matching' | 'cards'

const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif'
// A4 at 96 dpi, drawn at 2× for print
const W = 794
const H = 1123
const SCALE = 2
const M = 56

interface Page {
  ctx: CanvasRenderingContext2D
  canvas: HTMLCanvasElement
}

function newPage(): Page {
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'top'
  return { ctx, canvas }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > width && line) {
      // break at the last space when there is one
      const cut = line.lastIndexOf(' ')
      if (cut > 0 && ch !== ' ') {
        lines.push(line.slice(0, cut))
        line = line.slice(cut + 1) + ch
      } else {
        lines.push(line)
        line = ch === ' ' ? '' : ch
      }
    } else line += ch
  }
  if (line) lines.push(line)
  return lines
}

function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  opts: {
    bold?: boolean
    color?: string
    width?: number
    align?: CanvasTextAlign
    lh?: number
  } = {},
): number {
  ctx.font = (opts.bold ? 'bold ' : '') + size + 'px ' + FONT
  ctx.fillStyle = opts.color ?? '#111827'
  ctx.textAlign = opts.align ?? 'left'
  const lines = opts.width ? wrap(ctx, s, opts.width) : [s]
  const lh = size * (opts.lh ?? 1.5)
  for (const l of lines) {
    ctx.fillText(l, x, y)
    y += lh
  }
  ctx.textAlign = 'left'
  return y
}

/** the sheet header: a title and the 학교·반·이름 line */
function header(ctx: CanvasRenderingContext2D, title: string, sub?: string): number {
  let y = text(ctx, title, W / 2, M, 30, { bold: true, align: 'center' }) + 4
  if (sub)
    y = text(ctx, sub, W / 2, y, 13, { color: '#6b7280', align: 'center', width: W - 2 * M }) + 4
  ctx.font = '14px ' + FONT
  ctx.fillStyle = '#374151'
  ctx.textAlign = 'right'
  ctx.fillText('학교: ______________    반: ________    이름: ______________', W - M, y + 8)
  ctx.textAlign = 'left'
  y += 34
  ctx.strokeStyle = '#d1d5db'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(M, y)
  ctx.lineTo(W - M, y)
  ctx.stroke()
  return y + 18
}

function chips(ctx: CanvasRenderingContext2D, words: string[], y: number): number {
  ctx.font = 'bold 15px ' + FONT
  let x = M
  const h = 30
  for (const w of words) {
    const wd = ctx.measureText(w).width + 24
    if (x + wd > W - M) {
      x = M
      y += h + 8
    }
    ctx.fillStyle = '#f3f0ff'
    ctx.strokeStyle = '#c4b5fd'
    ctx.beginPath()
    ctx.roundRect(x, y, wd, h, 15)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#4c1d95'
    ctx.fillText(w, x + 12, y + 7)
    x += wd + 8
  }
  return y + h + 18
}

const HUES = [262, 199, 152, 32, 340, 48, 180, 12, 290, 220]

function grid(ctx: CanvasRenderingContext2D, puzzle: Puzzle, y: number, answers: boolean): number {
  const rows = puzzle.grid.length
  const cols = puzzle.grid[0]?.length ?? 0
  const room = Math.min(W - 2 * M, H - y - M)
  const cell = Math.floor(room / Math.max(rows, cols))
  const left = (W - cell * cols) / 2
  const hits = answers ? answerCells(puzzle) : new Map<string, number>()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold ' + Math.round(cell * 0.5) + 'px ' + FONT
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = left + c * cell
      const top = y + r * cell
      const hit = hits.get(r + ',' + c)
      if (hit !== undefined) {
        ctx.fillStyle = 'hsl(' + HUES[hit % HUES.length] + ' 85% 85%)'
        ctx.fillRect(x, top, cell, cell)
      }
      ctx.strokeStyle = '#d1d5db'
      ctx.strokeRect(x, top, cell, cell)
      ctx.fillStyle = answers && hit === undefined ? '#c7cbd1' : '#111827'
      ctx.fillText(puzzle.grid[r][c], x + cell / 2, top + cell / 2 + 1)
    }
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  return y + rows * cell + 16
}

function definitionLines(
  ctx: CanvasRenderingContext2D,
  words: string[],
  defs: Record<string, string>,
  y: number,
  pages: Page[],
): number {
  for (const w of words) {
    if (y > H - M - 40) {
      const p = newPage()
      pages.push(p)
      ctx = p.ctx
      y = M
    }
    ctx.font = 'bold 15px ' + FONT
    const label = w + ':  '
    ctx.fillStyle = '#111827'
    ctx.fillText(label, M, y)
    const lw = ctx.measureText(label).width
    y = text(ctx, defs[w] ?? '', M + lw, y, 15, { width: W - 2 * M - lw, color: '#374151' }) + 6
  }
  return y
}

function sheetPages(
  sheet: SearchSheet,
  puzzle: Puzzle,
  s: SearchSettings,
  matching: Matching | null,
): Page[] {
  const pages: Page[] = []
  const first = newPage()
  pages.push(first)
  const ctx = first.ctx
  const words = puzzle.words.filter((w) => !puzzle.unplaced.includes(w))
  const withDefs = cardWords(s)
  switch (sheet) {
    case 'puzzle':
    case 'answer': {
      let y = header(ctx, sheet === 'answer' ? '단어 찾기 정답' : '단어 찾기 학습지')
      y = text(ctx, '1. 찾을 단어', M, y, 18, { bold: true }) + 6
      y = chips(ctx, words, y)
      y = text(ctx, '2. 단어 찾기', M, y, 18, { bold: true }) + 8
      grid(ctx, puzzle, y, sheet === 'answer')
      break
    }
    case 'definitions': {
      const y = header(
        ctx,
        '찾을 단어와 뜻풀이',
        '총 ' + withDefs.length + '개의 단어를 찾아보세요.',
      )
      definitionLines(ctx, withDefs, s.definitions, y, pages)
      break
    }
    case 'sentences': {
      let y = header(
        ctx,
        '나만의 문장 만들기',
        '아래 단어들을 사용해 자신만의 문장을 만들어 보세요. 단어의 뜻을 생각하며 자유롭게 쓰세요.',
      )
      let c = ctx
      for (const w of words) {
        if (y > H - M - 110) {
          const p = newPage()
          pages.push(p)
          c = p.ctx
          y = M
        }
        y = text(c, w + ':', M, y, 17, { bold: true, color: '#6d28d9' }) + 12
        c.setLineDash([4, 4])
        c.strokeStyle = '#9ca3af'
        for (let i = 0; i < 2; i++) {
          c.beginPath()
          c.moveTo(M + 16, y + 26)
          c.lineTo(W - M, y + 26)
          c.stroke()
          y += 38
        }
        c.setLineDash([])
        y += 12
      }
      break
    }
    case 'matching': {
      if (!matching) throw new Error('뜻이 있는 단어가 2개 이상 있어야 해요.')
      const y = header(
        ctx,
        '단어와 뜻 잇기',
        '다음 단어와 그에 알맞은 뜻풀이를 선으로 연결해 보세요.',
      )
      const rows = Math.max(matching.words.length, matching.meanings.length)
      const rowH = Math.min(64, Math.floor((H - y - M) / rows))
      const rightX = M + 250
      const rightW = W - M - rightX
      for (let i = 0; i < rows; i++) {
        const top = y + i * rowH
        const w = matching.words[i]
        if (w) {
          ctx.font = 'bold 16px ' + FONT
          const bw = ctx.measureText(w.text).width + 24
          ctx.strokeStyle = '#a78bfa'
          ctx.beginPath()
          ctx.roundRect(M, top + 6, bw, rowH - 16, 8)
          ctx.stroke()
          ctx.fillStyle = '#111827'
          ctx.fillText(w.text, M + 12, top + rowH / 2 - 10)
          ctx.fillStyle = '#6d28d9'
          ctx.beginPath()
          ctx.arc(M + 200, top + rowH / 2 - 2, 5, 0, Math.PI * 2)
          ctx.fill()
        }
        const m = matching.meanings[i]
        if (m) {
          ctx.fillStyle = '#6d28d9'
          ctx.beginPath()
          ctx.arc(rightX - 14, top + rowH / 2 - 2, 5, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#e5e7eb'
          ctx.beginPath()
          ctx.roundRect(rightX, top + 4, rightW, rowH - 12, 8)
          ctx.stroke()
          ctx.font = '13.5px ' + FONT
          const lines = wrap(ctx, m.text, rightW - 20).slice(0, 2)
          lines.forEach((l, k) => {
            ctx.fillStyle = '#374151'
            ctx.fillText(l, rightX + 10, top + rowH / 2 - (lines.length * 18) / 2 + k * 18 - 2)
          })
        }
      }
      break
    }
    case 'cards': {
      const drawCards = (
        first: Page,
        title: string,
        label: (w: string) => string,
        big: boolean,
      ) => {
        let c = first.ctx
        let y = header(c, title, '선을 따라 오려서 메모리 게임이나 스피드 퀴즈에 써 보세요.')
        const gap = 12
        const size = Math.floor((W - 2 * M - gap * 2) / 3)
        withDefs.forEach((w, i) => {
          const col = i % 3
          if (col === 0 && i > 0) y += size + gap
          if (y + size > H - M) {
            const p = newPage()
            pages.push(p)
            c = p.ctx
            y = M
          }
          const x = M + col * (size + gap)
          c.setLineDash([6, 5])
          c.strokeStyle = '#9ca3af'
          c.strokeRect(x, y, size, size)
          c.setLineDash([])
          c.font = (big ? 'bold 28px ' : '15px ') + FONT
          const lines = wrap(c, label(w), size - 28).slice(0, 7)
          const lh = big ? 36 : 22
          lines.forEach((l, k) => {
            c.fillStyle = '#111827'
            c.textAlign = 'center'
            c.fillText(l, x + size / 2, y + size / 2 - (lines.length * lh) / 2 + k * lh)
          })
          c.textAlign = 'left'
        })
      }
      drawCards(first, '단어 카드', (w) => w, true)
      const second = newPage()
      pages.push(second)
      drawCards(second, '뜻풀이 카드', (w) => s.definitions[w] ?? '', false)
      break
    }
  }
  return pages
}

const png = (canvas: HTMLCanvasElement): Promise<Uint8Array> =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      async (b) =>
        b
          ? resolve(new Uint8Array(await b.arrayBuffer()))
          : reject(new Error('그림을 만들지 못했어요.')),
      'image/png',
    ),
  )

export async function searchPdf(
  sheet: SearchSheet,
  puzzle: Puzzle,
  s: SearchSettings,
  matching: Matching | null,
): Promise<Uint8Array> {
  if (document.fonts?.ready) await document.fonts.ready
  const pdf = await PDFDocument.create()
  // A4 in points
  const PW = 595.28
  const PH = 841.89
  for (const p of sheetPages(sheet, puzzle, s, matching)) {
    const img = await pdf.embedPng(await png(p.canvas))
    pdf.addPage([PW, PH]).drawImage(img, { x: 0, y: 0, width: PW, height: PH })
  }
  return pdf.save()
}

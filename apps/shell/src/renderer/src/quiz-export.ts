import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import { answerText, fillQuiznSheet, type Question, type QuizData } from './quiz-model'

/**
 * The quiz generator's files, made as the ACE QUIZ LAB makes them: the 문제지·정답지 are
 * the template PDF with the questions drawn over it as one transparent picture per page
 * (4 questions a page, 2 with answers), QuizN gets its own upload sheet filled from row
 * 22, and the video is a canvas recording: a title card, then for each question 8
 * seconds of question, a 3-second countdown and 6 seconds of answer.
 */

const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif'

/** lines of text that fit in width: by word, and by character inside a word longer than a line */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue
      const next = line + word
      if (ctx.measureText(next).width <= width || !line.trim()) {
        if (ctx.measureText(next).width <= width) {
          line = next
          continue
        }
        // a single word wider than the line: break it by character
        for (const ch of word) {
          if (ctx.measureText(line + ch).width > width && line) {
            lines.push(line)
            line = ch.trim() ? ch : ''
          } else line += ch
        }
        continue
      }
      lines.push(line.trimEnd())
      line = word.trim() ? word : ''
    }
    lines.push(line.trimEnd())
  }
  return lines
}

/* ------------------------------------------------------------- worksheet */

// the original lays the page out as 794 x 1123 CSS pixels with 55mm 20mm 20mm 20mm padding
const PAGE_W = 794
const PAGE_H = 1123
const MM = 96 / 25.4
const SCALE = 3

function drawWorksheetPage(
  questions: Question[],
  startIndex: number,
  answers: boolean,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W * SCALE
  canvas.height = PAGE_H * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'top'
  const left = 20 * MM
  const width = PAGE_W - 40 * MM
  // the template prints its own title; the original keeps the space of a hidden one
  let y = 55 * MM + 28 * 1.5 + 40
  const block = (
    text: string,
    size: number,
    bold: boolean,
    color: string,
    x: number,
    w: number,
    lh = 1.5,
  ) => {
    ctx.font = (bold ? 'bold ' : '') + size + 'px ' + FONT
    ctx.fillStyle = color
    for (const line of wrap(ctx, text, w)) {
      ctx.fillText(line, x, y)
      y += size * lh
    }
  }
  const box = (draw: () => void, fill: string) => {
    const top = y
    y += 8
    const save = y
    // measure by drawing off-canvas first: draw once to find the height
    ctx.save()
    ctx.globalAlpha = 0
    draw()
    ctx.restore()
    const h = y - save + 8
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.roundRect(left + 20, top, width - 20, h, 4)
    ctx.fill()
    y = save
    draw()
    y = top + h
  }
  questions.forEach((q, i) => {
    if (i > 0) y += 32
    block(startIndex + i + 1 + '. ' + q.question, 16, true, '#000', left, width)
    y += 12 - 16 * 0.5
    const listed = q.type === 'multiple-choice' || q.type === 'ordering' || q.type === 'ox'
    if (listed && q.options) {
      q.options.forEach((o, k) => {
        block((q.type === 'ox' ? '' : k + 1 + ') ') + o, 14, false, '#000', left + 20, width - 20)
        y += 8 - 14 * 0.5
      })
    }
    if (q.type === 'initial-consonant' && q.options?.[0] && !answers) {
      y += 8
      block('(초성 힌트: ' + q.options[0] + ')', 14, false, '#555', left + 20, width - 20)
    }
    if (answers) {
      y += 12
      box(() => {
        block('정답: ' + answerText(q), 14, true, '#D32F2F', left + 28, width - 36)
      }, 'rgba(255, 230, 230, 0.7)')
      if (q.explanation) {
        y += 8
        box(() => {
          block('해설', 14, true, '#1976D2', left + 28, width - 36)
          y += 4
          block(q.explanation ?? '', 14, false, '#333', left + 28, width - 36)
        }, 'rgba(230, 240, 255, 0.7)')
      }
    } else if (!listed) {
      // room to write the answer, as the original's 2em gap
      y += 32
    }
  })
  return canvas
}

const canvasPng = (canvas: HTMLCanvasElement): Promise<Uint8Array> =>
  new Promise((resolve, reject) =>
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('학습지 그림을 만들지 못했어요.'))
      resolve(new Uint8Array(await blob.arrayBuffer()))
    }, 'image/png'),
  )

export async function buildWorksheetPdf(
  template: Uint8Array,
  questions: Question[],
  answers: boolean,
): Promise<Uint8Array> {
  if (document.fonts?.ready) await document.fonts.ready
  const per = answers ? 2 : 4
  const pages = Math.ceil(questions.length / per)
  const out = await PDFDocument.create()
  for (let p = 0; p < pages; p++) {
    const [bg] = await out.embedPdf(template, [0])
    const page = out.addPage([bg.width, bg.height])
    page.drawPage(bg)
    const png = await out.embedPng(
      await canvasPng(drawWorksheetPage(questions.slice(p * per, p * per + per), p * per, answers)),
    )
    page.drawImage(png, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() })
  }
  return out.save()
}

/* ------------------------------------------------------------------ QuizN */

export async function buildQuiznWorkbook(
  template: Uint8Array,
  data: QuizData,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(template)
  const path = 'xl/worksheets/sheet1.xml'
  const sheet = await zip.file(path)?.async('string')
  if (!sheet) throw new Error('퀴즈앤 서식에서 시트를 찾을 수 없어요.')
  zip.file(path, fillQuiznSheet(sheet, data))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

/* ------------------------------------------------------------------ video */

const VIDEO_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']

export async function recordQuizVideo(
  questions: Question[],
  subtitle: string,
  bgm?: Uint8Array | null,
): Promise<{ blob: Blob; ext: string }> {
  const mime = VIDEO_TYPES.find(
    (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t),
  )
  if (!mime) throw new Error('이 화면에서는 동영상을 만들 수 없어요.')
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 720
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('동영상 화면을 만들지 못했어요.')
  const stream = canvas.captureStream(30)
  let audio: AudioContext | null = null
  let source: AudioBufferSourceNode | null = null
  if (bgm && bgm.byteLength > 0) {
    try {
      audio = new AudioContext()
      const buffer = await audio.decodeAudioData(bgm.slice().buffer)
      source = audio.createBufferSource()
      source.buffer = buffer
      source.loop = true
      const dest = audio.createMediaStreamDestination()
      source.connect(dest)
      stream.addTrack(dest.stream.getAudioTracks()[0])
    } catch {
      // no music; the video still records
    }
  }
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()))
  source?.start(0)
  recorder.start()

  const W = canvas.width
  const H = canvas.height
  const hold = async (paint: (ms: number) => void, ms: number) => {
    const start = performance.now()
    for (;;) {
      const t = performance.now() - start
      if (t >= ms) break
      paint(t)
      await new Promise((r) => setTimeout(r, 30))
    }
  }
  const text = (
    s: string,
    x: number,
    y: number,
    width: number,
    lh: number,
    color: string,
    size: number,
    bold: boolean,
  ) => {
    ctx.fillStyle = color
    ctx.font = (bold ? 'bold ' : '') + size + 'px ' + FONT
    for (const line of wrap(ctx, s, width)) {
      ctx.fillText(line, x, y)
      y += lh
    }
    return y + lh
  }

  await hold(() => {
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 80px ' + FONT
    ctx.fillText('똑딱 퀴즈', W / 2, H / 2 - (subtitle ? 40 : 0))
    if (subtitle) {
      ctx.fillStyle = '#cbd5e1'
      ctx.font = '40px ' + FONT
      ctx.fillText(subtitle, W / 2, H / 2 + 60)
    }
  }, 4000)

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    await hold(() => {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, 0, W, H)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#2563eb'
      ctx.font = 'bold 36px ' + FONT
      ctx.fillText('문제 ' + (i + 1), 100, 100)
      let y = text(q.question, 100, 180, 1080, 60, '#0f172a', 48, true)
      if (q.type === 'ox') {
        ctx.textAlign = 'center'
        ctx.font = 'bold 220px ' + FONT
        ctx.fillStyle = '#3b82f6'
        ctx.fillText('O', W / 3, 500)
        ctx.fillStyle = '#ef4444'
        ctx.fillText('X', (W / 3) * 2, 500)
      } else if (q.type !== 'short-answer' && q.options?.length) {
        y += 20
        q.options.forEach((o, k) => {
          const label = q.type === 'initial-consonant' ? '초성 힌트: ' : k + 1 + '. '
          y = text(label + o, 130, y, 1000, 50, '#334155', 38, false) - 20
        })
      }
    }, 8000)
    await hold((t) => {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, 0, W, H)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ef4444'
      ctx.font = 'bold 240px ' + FONT
      ctx.fillText(String(Math.max(1, 3 - Math.floor(t / 1000))), W / 2, H / 2 + 60)
      ctx.font = 'bold 50px ' + FONT
      ctx.fillStyle = '#475569'
      ctx.fillText('정답 공개까지...', W / 2, H / 2 + 180)
    }, 3000)
    await hold(() => {
      ctx.fillStyle = '#f0fdf4'
      ctx.fillRect(0, 0, W, H)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#16a34a'
      ctx.font = 'bold 36px ' + FONT
      ctx.fillText('정답', 100, 100)
      const y = text(q.question, 100, 180, 1080, 50, '#64748b', 36, true) + 50
      if (q.type === 'ox') {
        ctx.textAlign = 'center'
        const o = q.answer === 'O'
        ctx.fillStyle = o ? '#3b82f6' : '#ef4444'
        ctx.font = 'bold 250px ' + FONT
        ctx.fillText(o ? 'O' : 'X', W / 2, y + 150)
      } else {
        text('정답: ' + answerText(q), 100, y, 1080, 80, '#16a34a', 70, true)
      }
    }, 6000)
  }
  await new Promise((r) => setTimeout(r, 500))
  recorder.stop()
  await stopped
  source?.stop()
  void audio?.close()
  stream.getTracks().forEach((t) => t.stop())
  if (chunks.length === 0) throw new Error('동영상을 만들지 못했어요.')
  return {
    blob: new Blob(chunks, { type: mime }),
    ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm',
  }
}

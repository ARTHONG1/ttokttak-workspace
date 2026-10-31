import { basename } from 'node:path'
import type { QuizSourceResult } from '../shared/home-api'
import { CART_TEXT_MAX_CHARS, readCartFile } from './cart-file'

/**
 * 특화 기능 > 퀴즈 생성기: the 학습 자료 a quiz is made from, as the ACE QUIZ LAB reads it.
 * A PDF or Hangul file goes through the same text extraction the 품의서 cart uses; a
 * YouTube video gives its captions (the original's extractTranscriptAction). The main
 * process does the fetching, so the page never reaches YouTube itself.
 */

/** the video id in any YouTube address the original accepts, or a bare 11-character id */
export function youtubeIdOf(input: string): string | null {
  const m = input.match(
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|live\/|shorts\/)([^#&?]*).*/,
  )
  if (m && m[2].length === 11) return m[2]
  return /^[\w-]{11}$/.test(input.trim()) ? input.trim() : null
}

interface CaptionTrack {
  baseUrl: string
  languageCode: string
  kind?: string
}

const PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'
// the Android client is answered with caption tracks the timedtext endpoint serves
const ANDROID = {
  ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
  context: {
    client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'ko' },
  },
}

const decodeEntities = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/** the spoken text of a timedtext document (format 3 <p>…</p>, or the older <text>…</text>) */
export function captionText(xml: string): string {
  const blocks = [...xml.matchAll(/<(p|text)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) =>
    decodeEntities(m[2].replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim(),
  )
  return blocks.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

/** Korean first, then a hand-made track over an automatic one */
function pickTrack(tracks: CaptionTrack[]): CaptionTrack | undefined {
  const score = (t: CaptionTrack) =>
    (t.languageCode.startsWith('ko') ? 2 : 0) + (t.kind === 'asr' ? 0 : 1)
  return [...tracks].sort((a, b) => score(b) - score(a))[0]
}

export async function readYoutubeTranscript(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<QuizSourceResult> {
  const id = youtubeIdOf(url)
  if (!id) return { ok: false, error: '유튜브 주소를 확인해 주세요.' }
  try {
    const player = await fetchImpl(PLAYER_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': ANDROID.ua },
      body: JSON.stringify({ context: ANDROID.context, videoId: id }),
    })
    if (!player.ok) return { ok: false, error: '유튜브에서 영상 정보를 받지 못했어요.' }
    const info = (await player.json()) as {
      playabilityStatus?: { status?: string }
      videoDetails?: { title?: string }
      captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } }
    }
    const tracks = info.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
    const track = pickTrack(tracks)
    if (!track) {
      return {
        ok: false,
        error:
          info.playabilityStatus?.status === 'OK'
            ? '이 영상에는 자막이 없어요. 자막이 있는 영상을 골라 주세요.'
            : '영상을 열 수 없어요. 공개된 영상인지 확인해 주세요.',
      }
    }
    const res = await fetchImpl(track.baseUrl, { headers: { 'user-agent': ANDROID.ua } })
    const text = res.ok ? captionText(await res.text()) : ''
    if (!text) return { ok: false, error: '영상 자막을 읽지 못했어요.' }
    return {
      ok: true,
      name: info.videoDetails?.title || id,
      text: text.length > CART_TEXT_MAX_CHARS ? text.slice(0, CART_TEXT_MAX_CHARS) : text,
      truncated: text.length > CART_TEXT_MAX_CHARS,
    }
  } catch {
    return { ok: false, error: '유튜브에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.' }
  }
}

/** a PDF or Hangul file the user picked, as text */
export async function readQuizFile(path: string, kind: 'pdf' | 'hwp'): Promise<QuizSourceResult> {
  const result = await readCartFile(path, kind)
  if (!result.ok) return result
  if (result.kind !== 'text')
    return { ok: false, error: basename(path) + '에서 글을 읽지 못했어요.' }
  return { ok: true, name: result.name, text: result.text, truncated: result.truncated }
}

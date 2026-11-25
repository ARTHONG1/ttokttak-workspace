import { useEffect, useRef, useState } from 'react'
import type { FocusEvent, ReactElement } from 'react'
import {
  localDay,
  type ShownNotices,
  type ShownPopup,
  type ShownPromo,
} from '../../../shared/notices'
import './home-notices.css'

/**
 * The home's part of the 알림·홍보 목록 (shared/notices.ts): the promo cards at the bottom,
 * beside who made the app, and on the desktop app the popups. The list lives outside the app,
 * so both change without a release.
 */

const NONE: ShownNotices = { popups: [], promos: [] }
/** promo cards beside the maker's */
const SLOTS = 2
const TURN_KEY = 'ttok-promo-turn'
const TURN_EVERY_MS = 8000
const HIDE_KEY = 'ttok-popup-hide:'

/** today's promos and popups: none until they come, and none if they cannot */
export function useNotices(): ShownNotices {
  const [notices, setNotices] = useState<ShownNotices>(NONE)
  useEffect(() => {
    let alive = true
    window.aiOffice
      .notices()
      .then((next) => {
        if (alive) setNotices(next)
      })
      .catch((err) => console.warn('[notices] not shown', err))
    return () => {
      alive = false
    }
  }, [])
  return notices
}

const MAKER_URL = 'https://classddok.com'

/** who made the app, as one row: the home's bottom when there are no promos */
function MakerRow(): ReactElement {
  return (
    <a className="trial-maker" href={MAKER_URL} target="_blank" rel="noopener noreferrer">
      <span className="trial-maker-mark" aria-hidden="true">
        똑
      </span>
      <span className="trial-maker-text">
        <b>인천봉수초 홍찬우가 만들었어요</b>
        <span>수업과 업무를 덜어 주는 다른 도구는 클래스똑딱에서 만나 보세요</span>
      </span>
      <span className="trial-maker-go">classddok.com ↗</span>
    </a>
  )
}

function MakerCard(): ReactElement {
  return (
    <a className="promo-card" href={MAKER_URL} target="_blank" rel="noopener noreferrer">
      <span className="promo-picture promo-maker-face">
        <span className="trial-maker-mark" aria-hidden="true">
          똑
        </span>
      </span>
      <b className="promo-title">인천봉수초 홍찬우가 만들었어요</b>
      <span className="promo-text">수업과 업무 도구를 더 만나 보세요</span>
      <span className="promo-go">classddok.com ↗</span>
    </a>
  )
}

/** a promo card: a link, or with a video, a button that plays it */
function PromoCard({
  promo,
  onPlay,
}: {
  promo: ShownPromo
  onPlay: (promo: ShownPromo) => void
}): ReactElement {
  const plays = Boolean(promo.youtubeId || promo.videoUrl)
  const inside = (
    <>
      <span className="promo-picture">
        {promo.imageSrc ? (
          <img src={promo.imageSrc} alt="" draggable={false} />
        ) : promo.videoUrl ? (
          <video src={promo.videoUrl} preload="metadata" muted playsInline />
        ) : (
          <span className="promo-picture-letter" aria-hidden="true">
            {promo.title.slice(0, 1)}
          </span>
        )}
        {plays && (
          <span className="promo-play" aria-hidden="true">
            ▶
          </span>
        )}
      </span>
      <b className="promo-title">{promo.title}</b>
      {promo.text && <span className="promo-text">{promo.text}</span>}
      {plays ? (
        <span className="promo-go">영상 보기</span>
      ) : (
        promo.linkUrl && <span className="promo-go">{promo.linkLabel} ↗</span>
      )}
    </>
  )
  if (plays) {
    return (
      <button type="button" className="promo-card" onClick={() => onPlay(promo)}>
        {inside}
      </button>
    )
  }
  return promo.linkUrl ? (
    <a className="promo-card" href={promo.linkUrl} target="_blank" rel="noopener noreferrer">
      {inside}
    </a>
  ) : (
    <div className="promo-card">{inside}</div>
  )
}

/** a promo's video, played in a window over the home; closing it stops the video */
function PromoPlayer({ promo, onClose }: { promo: ShownPromo; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="home-popup home-player"
      aria-labelledby="promo-player-title"
      data-testid="promo-player"
      onClose={onClose}
    >
      <div className="home-popup-body">
        <h2 id="promo-player-title">{promo.title}</h2>
        {promo.youtubeId && (
          <iframe
            src={'https://www.youtube-nocookie.com/embed/' + promo.youtubeId + '?autoplay=1&rel=0'}
            title={promo.title + ' 동영상'}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        )}
        {promo.videoUrl && <video src={promo.videoUrl} controls autoPlay playsInline />}
        {promo.text && <p>{promo.text}</p>}
        {promo.linkUrl && (
          <a
            className="home-popup-link"
            href={promo.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {promo.linkLabel}
          </a>
        )}
      </div>
      <footer className="home-popup-foot home-player-foot">
        <button type="button" onClick={() => dialog.current?.close()} autoFocus>
          닫기
        </button>
      </footer>
    </dialog>
  )
}

/**
 * The bottom of the home: the maker's card and two promos. With more promos than places, each
 * opening of the home starts at the next one, and while the cards are on screen they move on
 * every 8 seconds; a pointer or focus on them holds them, a dot picked by hand stops it, and
 * so does the system's reduce-motion setting.
 */
export function HomePromos({ promos }: { promos: ShownPromo[] }): ReactElement {
  const root = useRef<HTMLDivElement>(null)
  const turns = promos.length > SLOTS
  const [start, setStart] = useState(0)
  const [auto, setAuto] = useState(true)
  const [held, setHeld] = useState(false)
  const [seen, setSeen] = useState(false)
  const [playing, setPlaying] = useState<ShownPromo | null>(null)

  useEffect(() => {
    if (!turns) return
    let turn = 0
    try {
      turn = Number(localStorage.getItem(TURN_KEY)) || 0
      localStorage.setItem(TURN_KEY, String(turn + 1))
    } catch {
      // without storage every opening starts at the first promo
    }
    setStart(turn % promos.length)
  }, [turns, promos.length])

  useEffect(() => {
    const el = root.current
    if (!el || !turns) return
    const watch = new IntersectionObserver((entries) =>
      setSeen(entries.some((entry) => entry.isIntersecting)),
    )
    watch.observe(el)
    return () => watch.disconnect()
  }, [turns])

  useEffect(() => {
    if (!turns || !auto || held || !seen) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setStart((s) => (s + 1) % promos.length), TURN_EVERY_MS)
    return () => clearInterval(timer)
  }, [turns, auto, held, seen, promos.length])

  if (promos.length === 0) return <MakerRow />
  const shown = Array.from(
    { length: Math.min(SLOTS, promos.length) },
    (_, i) => promos[(start + i) % promos.length]!,
  )
  const leave = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false)
  }
  return (
    <div
      ref={root}
      className="home-promos"
      data-testid="home-promos"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={leave}
    >
      <div className={'home-promo-grid home-promo-grid-' + (shown.length + 1)}>
        <MakerCard />
        {shown.map((promo) => (
          <PromoCard
            key={promo.id}
            promo={promo}
            onPlay={(picked) => {
              setPlaying(picked)
              // a video was opened: the cards stay where they are
              setAuto(false)
            }}
          />
        ))}
      </div>
      {turns && (
        <div className="home-promo-dots">
          {promos.map((promo, i) => (
            <button
              key={promo.id}
              type="button"
              aria-label={promo.title + ' 보기'}
              aria-pressed={i === start}
              onClick={() => {
                setStart(i)
                setAuto(false)
              }}
            />
          ))}
        </div>
      )}
      {playing && <PromoPlayer promo={playing} onClose={() => setPlaying(null)} />}
    </div>
  )
}

/** the desktop app's popups, one after another; each can be put away for the day */
export function DesktopPopups({ popups }: { popups: ShownPopup[] }): ReactElement | null {
  const dialog = useRef<HTMLDialogElement>(null)
  const [queue, setQueue] = useState<ShownPopup[]>([])
  const [hideToday, setHideToday] = useState(false)
  const today = localDay()

  useEffect(() => {
    setQueue(
      popups.filter((popup) => {
        try {
          return localStorage.getItem(HIDE_KEY + popup.id) !== today
        } catch {
          return true
        }
      }),
    )
  }, [popups, today])

  const popup = queue[0]
  useEffect(() => {
    const el = dialog.current
    if (popup && el && !el.open) el.showModal()
  }, [popup])

  if (!popup) return null
  const close = () => {
    if (hideToday) {
      try {
        localStorage.setItem(HIDE_KEY + popup.id, today)
      } catch {
        // without storage the popup comes back next time
      }
    }
    setHideToday(false)
    dialog.current?.close()
    setQueue((rest) => rest.slice(1))
  }
  return (
    <dialog
      ref={dialog}
      className="home-popup"
      aria-labelledby="home-popup-title"
      data-testid="home-popup"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
    >
      <div className="home-popup-body">
        <h2 id="home-popup-title">{popup.title || '새로운 소식'}</h2>
        {popup.body && <p>{popup.body}</p>}
        {popup.imageSrc && <img src={popup.imageSrc} alt="" />}
        {popup.youtubeId && (
          <iframe
            src={'https://www.youtube-nocookie.com/embed/' + popup.youtubeId + '?rel=0'}
            title={(popup.title || '안내') + ' 동영상'}
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
          />
        )}
        {popup.videoUrl && <video src={popup.videoUrl} controls playsInline preload="metadata" />}
        {popup.linkUrl && (
          <a
            className="home-popup-link"
            href={popup.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {popup.linkLabel || '자세히 보기'}
          </a>
        )}
      </div>
      <footer className="home-popup-foot">
        <label>
          <input
            type="checkbox"
            checked={hideToday}
            onChange={(e) => setHideToday(e.target.checked)}
          />
          오늘 하루 보지 않기
        </label>
        <button type="button" onClick={close} autoFocus>
          닫기
        </button>
      </footer>
    </dialog>
  )
}

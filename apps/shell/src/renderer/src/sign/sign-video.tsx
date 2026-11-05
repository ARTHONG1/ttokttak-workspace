import { useState } from 'react'
import type { MouseEvent, ReactElement } from 'react'
import { Modal } from '../special-common'

/** 똑딱서명's introduction video: played in the app, and the same video on YouTube */
export const TTOK_SIGN_VIDEO_URL = 'https://youtu.be/tLxKYB8qInY'
export const TTOK_SIGN_EMBED_URL = 'https://www.youtube.com/embed/tLxKYB8qInY?rel=0'

/** the desktop opens YouTube in the browser through the main process; the web edition follows the link */
function openOnYouTube(e: MouseEvent<HTMLAnchorElement>): void {
  if (document.documentElement.dataset.edition === 'web') return
  if (typeof window.aiOffice?.openFeatureLink === 'function') {
    e.preventDefault()
    void window.aiOffice.openFeatureLink('ttokSignVideo')
  }
}

function PlayIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7.2" fill="currentColor" />
      <path d="M6.4 5.2v5.6L10.9 8z" fill="var(--sf-card)" />
    </svg>
  )
}

/** a 소개 영상 button; pressing it plays the video in a dialog over the page */
export function SignVideoButton({ variant }: { variant: 'card' | 'page' }): ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={'sf-video-btn sf-video-btn-' + variant}
        data-testid={'sign-video-' + variant}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        <PlayIcon />
        소개 영상
      </button>
      {open && (
        <Modal title="똑딱서명 소개 영상" onClose={() => setOpen(false)} wide>
          <div className="ct-video-wrap" data-testid="sign-video-player">
            <iframe
              src={TTOK_SIGN_EMBED_URL + '&autoplay=1'}
              title="똑딱서명 소개 영상"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
          <div className="sf-video-foot">
            <a
              href={TTOK_SIGN_VIDEO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="ct-video-link"
              onClick={openOnYouTube}
            >
              유튜브에서 보기 ↗
            </a>
          </div>
        </Modal>
      )}
    </>
  )
}

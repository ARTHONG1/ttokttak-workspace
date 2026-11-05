import React from 'react'
import './send-cooldown.css'

/** whole seconds left, as people count them down (19.2 s left reads 20) */
export const cooldownSeconds = (leftMs: number): number => Math.ceil(leftMs / 1000)

/** the send button's face while the web edition's wait runs: a ring that empties, and the seconds */
export function SendCooldownRing({
  leftMs,
  totalMs,
  size = 22,
}: {
  readonly leftMs: number
  readonly totalMs: number
  readonly size?: number
}): React.JSX.Element {
  const r = size / 2 - 2
  const c = 2 * Math.PI * r
  const share = Math.min(1, Math.max(0, leftMs / totalMs))
  return (
    <span className="ai-cooldown-ring" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="ai-cooldown-track" cx={size / 2} cy={size / 2} r={r} />
        <circle
          className="ai-cooldown-left"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - share)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ai-cooldown-num">{cooldownSeconds(leftMs)}</span>
    </span>
  )
}

/** a thin bar under the input that shrinks to nothing as the wait runs out */
export function SendCooldownBar({
  leftMs,
  totalMs,
}: {
  readonly leftMs: number
  readonly totalMs: number
}): React.JSX.Element {
  const share = Math.min(1, Math.max(0, leftMs / totalMs))
  return (
    <div
      className="ai-cooldown-bar"
      role="status"
      aria-live="polite"
      aria-label={cooldownSeconds(leftMs) + '초 뒤에 다시 보낼 수 있어요'}
    >
      <span style={{ transform: `scaleX(${share})` }} />
    </div>
  )
}

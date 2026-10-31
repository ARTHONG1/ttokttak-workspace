/**
 * Who may use the web edition: a Google account signed in with Firebase Authentication.
 *
 * The browser signs in on the gate page (client/login.html) and posts the Firebase ID token
 * here. The gateway checks it the way Firebase documents for a token verified without the
 * Admin SDK (RS256, signed by a key from securetoken@system.gserviceaccount.com, audience =
 * the Firebase project, issuer = https://securetoken.google.com/<project>, not expired, a
 * non-empty sub), then keeps the account on the browser session (the HttpOnly `hs` cookie)
 * for WEB_AUTH_SESSION_HOURS (12 by default). Every route that reaches a desktop session,
 * the WebSocket included, needs that account.
 *
 * AI requests are counted per account per day (Asia/Seoul) in this process. A limit is off
 * until WEB_DAILY_AI_LIMIT is set; WEB_ALLOWED_EMAILS (comma separated, optional) narrows the
 * accounts that may sign in at all.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose'

const PROJECT = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || ''
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)
const ALLOWED = new Set(
  String(process.env.WEB_ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
)
/** how long one sign-in keeps a browser session open */
const SESSION_MS = Math.max(1, Number(process.env.WEB_AUTH_SESSION_HOURS || 12)) * 3600_000

/** the auth switch: on in the Cloud Run service, off for a local preview unless asked for */
export const authRequired = process.env.WEB_AUTH !== 'off' && Boolean(PROJECT)

/** what the gate page needs to start Firebase in the browser (all public values) */
export function firebaseWebConfig() {
  return {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || (PROJECT ? PROJECT + '.firebaseapp.com' : ''),
    projectId: PROJECT,
    appId: process.env.FIREBASE_APP_ID || '',
  }
}

/**
 * The account of a Firebase ID token, or null with the reason. Only Google sign-ins are
 * accepted, and only a verified email.
 */
export async function verifyIdToken(token) {
  if (!PROJECT) return { account: null, reason: 'no project' }
  if (typeof token !== 'string' || token.length > 4096) return { account: null, reason: 'bad token' }
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ['RS256'],
      audience: PROJECT,
      issuer: 'https://securetoken.google.com/' + PROJECT,
    })
    if (typeof payload.sub !== 'string' || !payload.sub) return { account: null, reason: 'no subject' }
    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.auth_time === 'number' && payload.auth_time > now + 60)
      return { account: null, reason: 'auth time in the future' }
    const provider = payload.firebase && payload.firebase.sign_in_provider
    if (provider !== 'google.com') return { account: null, reason: 'not a Google sign-in' }
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : ''
    if (!email || payload.email_verified !== true) return { account: null, reason: 'unverified email' }
    if (ALLOWED.size && !ALLOWED.has(email)) return { account: null, reason: 'not allowed' }
    return {
      account: {
        uid: payload.sub,
        email,
        name: typeof payload.name === 'string' ? payload.name.slice(0, 80) : '',
        expiresAt: Date.now() + SESSION_MS,
      },
      reason: '',
    }
  } catch (err) {
    return { account: null, reason: String((err && err.code) || (err && err.message) || err) }
  }
}

// ---------------------------------------------------------------- daily AI requests
const LIMIT = Number(process.env.WEB_DAILY_AI_LIMIT || 0)
const counts = new Map()
let countsDay = ''

/** today in Korea: the day a count belongs to */
function seoulDay(now = Date.now()) {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10)
}

/** midnight in Korea after now, when a day's count starts again */
export function nextSeoulMidnight(now = Date.now()) {
  const day = seoulDay(now)
  return Date.parse(day + 'T00:00:00+09:00') + 24 * 3600_000
}

function rollDay(now) {
  const day = seoulDay(now)
  if (day !== countsDay) {
    counts.clear()
    countsDay = day
  }
}

/**
 * One AI request by an account: allowed, or refused once today's limit is used up. The
 * count is kept for every account whether or not a limit is set, so a limit can be chosen
 * from real use.
 */
export function takeAiRequest(uid, now = Date.now()) {
  rollDay(now)
  const used = counts.get(uid) || 0
  if (LIMIT > 0 && used >= LIMIT) return { ok: false, used, limit: LIMIT, resetsAt: nextSeoulMidnight(now) }
  counts.set(uid, used + 1)
  return { ok: true, used: used + 1, limit: LIMIT, resetsAt: nextSeoulMidnight(now) }
}

export function aiUsageOf(uid, now = Date.now()) {
  rollDay(now)
  return { used: counts.get(uid) || 0, limit: LIMIT, resetsAt: nextSeoulMidnight(now) }
}

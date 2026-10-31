// Checks the web edition's sign-in gate and per-account AI count without a browser:
// a gateway with auth on refuses every session route before sign-in, and web-auth counts
// requests per account and day. Usage (from program/): node web/scripts/auth-check.mjs
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 18093
const env = {
  ...process.env,
  PORT: String(PORT),
  WEB_HOST: '127.0.0.1',
  WEB_SESSIONS_ROOT: '/tmp/hs-auth-check',
  GOOGLE_CLOUD_PROJECT: 'hangul-ai-workbench-3ope70',
  VERTEX_ACCESS_TOKEN: 'unused',
  WEB_DAILY_AI_LIMIT: '2',
}
const gw = spawn(process.execPath, ['web/runtime/gateway.mjs'], { env, stdio: ['ignore', 'pipe', 'inherit'] })
let failed = 0
const check = (name, ok) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name)
  if (!ok) failed++
}
try {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch('http://127.0.0.1:' + PORT + '/api/health')
      break
    } catch {
      await sleep(100)
    }
  }
  const base = 'http://127.0.0.1:' + PORT
  const app = await fetch(base + '/app')
  const cookie = (app.headers.get('set-cookie') || '').split(';')[0]
  const page = await app.text()
  check('/app shows the sign-in page first', page.includes('/__web/login.js'))
  const cfg = await (await fetch(base + '/__auth/config')).json()
  check('auth is required', cfg.required === true)
  check('basic tier is flash lite', cfg.ai.basicModel === 'gemini-3.5-flash-lite')
  check('advanced tier is locked', cfg.ai.advancedEnabled === false)
  const up = await fetch(base + '/__upload-root', { headers: { cookie } })
  check('session route refused before sign-in (401)', up.status === 401)
  const forged = await fetch(base + '/__auth/session', {
    method: 'POST',
    headers: { cookie, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: 'not-a-token' }),
  })
  check('a forged token is refused (401)', forged.status === 401)
  const cross = await fetch(base + '/__auth/session', {
    method: 'POST',
    headers: { cookie, origin: 'https://evil.example', 'content-type': 'application/json' },
    body: '{}',
  })
  check('sign-in from another site is refused (403)', cross.status === 403)
  const me = await fetch(base + '/__auth/me', { headers: { cookie } })
  check('no account before sign-in', me.status === 401)
} finally {
  gw.kill()
}

process.env.WEB_DAILY_AI_LIMIT = '2'
const auth = await import('../runtime/web-auth.mjs?count')
const now = Date.parse('2026-10-31T14:00:00Z') // 23:00 in Seoul
check('1st request today', auth.takeAiRequest('u1', now).ok)
check('2nd request today', auth.takeAiRequest('u1', now).ok)
const third = auth.takeAiRequest('u1', now)
check('3rd request refused at the limit of 2', !third.ok && third.limit === 2)
check('another account has its own count', auth.takeAiRequest('u2', now).ok)
check('the count starts again after midnight in Seoul', auth.takeAiRequest('u1', now + 3600_000).ok)
console.log(failed ? failed + ' failed' : 'all passed')
process.exit(failed ? 1 : 0)

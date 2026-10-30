'use strict'
/** Vertex AI through ADC for the desktop main's Gemini protocol (x-goog-api-key → bearer). */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')

let cached = null
const METADATA = 'http://metadata.google.internal/computeMetadata/v1'

async function metadata(p, original) {
  try {
    const res = await original(METADATA + '/' + p, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(1500) })
    return res.ok ? res : null
  } catch {
    return null
  }
}

async function token(original) {
  if (process.env.VERTEX_ACCESS_TOKEN) return process.env.VERTEX_ACCESS_TOKEN
  if (cached && cached.expiresAt - 60000 > Date.now()) return cached.token
  // local preview: the signed-in gcloud account (its tokens last an hour; refresh before that)
  if (process.env.VERTEX_GCLOUD) {
    const value = await new Promise((resolve, reject) =>
      execFile(process.env.VERTEX_GCLOUD, ['auth', 'print-access-token'], { timeout: 30000 }, (err, out) => (err ? reject(err) : resolve(String(out).trim()))),
    )
    cached = { token: value, expiresAt: Date.now() + 50 * 60 * 1000 }
    return cached.token
  }
  const meta = await metadata('instance/service-accounts/default/token', original)
  if (meta) {
    const body = await meta.json()
    cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 }
    return cached.token
  }
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json')
  const creds = JSON.parse(fs.readFileSync(file, 'utf8'))
  const res = await original('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: creds.client_id, client_secret: creds.client_secret, refresh_token: creds.refresh_token }),
  })
  const body = await res.json()
  cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 }
  return cached.token
}

const VERTEX = /^https:\/\/([a-z0-9-]+-)?aiplatform\.googleapis\.com\//

function vertexBaseUrl() {
  const project = process.env.GOOGLE_CLOUD_PROJECT
  const location = process.env.VERTEX_LOCATION || 'global'
  const host = location === 'global' ? 'aiplatform.googleapis.com' : location + '-aiplatform.googleapis.com'
  return 'https://' + host + '/v1/projects/' + project + '/locations/' + location + '/publishers/google'
}

function install() {
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!VERTEX.test(url)) return original(input, init)
    const headers = new Headers(init && init.headers)
    headers.delete('x-goog-api-key')
    headers.set('Authorization', 'Bearer ' + (await token(original)))
    if (!process.env.WEB_AI_TRACE) return original(input, { ...(init || {}), headers })
    // diagnostics only: model, status and timing, never request or response content
    const started = Date.now()
    const model = (/models\/([^:/?]+)/.exec(url) || [])[1] || '?'
    const at = () => new Date().toISOString().slice(11, 19)
    console.warn('[vertex] ' + at() + ' ' + model + ' sent')
    // local debugging only (never set in the Cloud Run service): keep the request body to replay it
    if (process.env.WEB_AI_TRACE_DIR && init && typeof init.body === 'string') {
      try {
        fs.mkdirSync(process.env.WEB_AI_TRACE_DIR, { recursive: true })
        fs.writeFileSync(path.join(process.env.WEB_AI_TRACE_DIR, started + '-' + model + '.json'), init.body)
      } catch {}
    }
    try {
      const res = await original(input, { ...(init || {}), headers })
      console.warn('[vertex] ' + at() + ' ' + model + ' HTTP ' + res.status + ' headers after ' + (Date.now() - started) + 'ms')
      return res
    } catch (err) {
      console.warn('[vertex] ' + at() + ' ' + model + ' failed after ' + (Date.now() - started) + 'ms: ' + String((err && err.name) || err))
      throw err
    }
  }
}

module.exports = { install, vertexBaseUrl }


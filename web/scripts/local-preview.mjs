// Local preview of the web edition: the same desktop shell and editors (apps/*/out) that the
// Cloud Run service and the installed app run, served on http://127.0.0.1:5188 for the editor preview.
// AI goes to Vertex Gemini with the signed-in gcloud account (gcloud auth print-access-token).
// Usage: GOOGLE_CLOUD_PROJECT=<your-project> node web/scripts/local-preview.mjs
// (VERTEX_GCLOUD=<path to gcloud> when gcloud is not on PATH)
import { homedir } from 'node:os'
import { join } from 'node:path'

if (!process.env.GOOGLE_CLOUD_PROJECT) {
  console.error('Set GOOGLE_CLOUD_PROJECT to the Google Cloud project that runs Vertex AI.')
  process.exit(1)
}
process.env.PORT ||= '5188'
process.env.WEB_HOST ||= '127.0.0.1'
process.env.VERTEX_LOCATION ||= 'global'
process.env.WEB_SESSIONS_ROOT ||= '/tmp/hs-preview'
// the preview on this Mac opens without the Google sign-in the public service asks for
process.env.WEB_AUTH ||= 'off'
if (!process.env.VERTEX_ACCESS_TOKEN) process.env.VERTEX_GCLOUD ||= 'gcloud'
// each session runs with its own HOME, so point gcloud at the real account's config
process.env.CLOUDSDK_CONFIG ||= join(homedir(), '.config', 'gcloud')

await import('../runtime/gateway.mjs')

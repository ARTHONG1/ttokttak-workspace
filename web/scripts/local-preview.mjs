// Local preview of the web edition: the same desktop shell and editors (apps/*/out) that the
// Cloud Run service and the installed app run, served on http://127.0.0.1:5188 for the editor preview.
// AI goes to Vertex Gemini with the signed-in gcloud account (gcloud auth print-access-token).
// Usage (from the workspace root): npm run preview
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const KNOWN_GCLOUD = join(homedir(), 'Documents/Codex/2026-10-11/new-chat/work/vertex/google-cloud-sdk/bin/gcloud')
process.env.PORT ||= '5188'
process.env.WEB_HOST ||= '127.0.0.1'
process.env.GOOGLE_CLOUD_PROJECT ||= 'hangul-ai-workbench-3ope70'
process.env.VERTEX_LOCATION ||= 'global'
process.env.WEB_SESSIONS_ROOT ||= '/tmp/hs-preview'
if (!process.env.VERTEX_ACCESS_TOKEN && !process.env.VERTEX_GCLOUD) process.env.VERTEX_GCLOUD = existsSync(KNOWN_GCLOUD) ? KNOWN_GCLOUD : 'gcloud'
// each session runs with its own HOME, so point gcloud at the real account's config
process.env.CLOUDSDK_CONFIG ||= join(homedir(), '.config', 'gcloud')

await import('../runtime/gateway.mjs')

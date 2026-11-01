/**
 * The Codex CLI owns the user's login, model and model catalog. The desktop
 * app only reuses a *loopback* OpenAI-compatible proxy from Codex's own config.
 * It never copies credentials or accepts a remote endpoint from that config.
 */
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { AiRunError } from '../run-error'

const MAX_CONFIG_BYTES = 256 * 1024

function unsafeRoute(reason: string): AiRunError {
  return new AiRunError('unsafe-tools', `Codex local connection: ${reason}`, { provider: 'codex' })
}

/** Allow only literal numeric loopback hosts and simple paths, with no URL normalization. */
export function validatedCodexLocalEndpoint(value: string): string {
  const match = /^(https?):\/\/(127\.0\.0\.1|\[::1\]):([0-9]{1,5})(\/[-A-Za-z0-9._~/]*)?$/.exec(value)
  if (!match || Number(match[3]) < 1 || Number(match[3]) > 65535) {
    throw unsafeRoute('only an explicit 127.0.0.1 or [::1] HTTP(S) address is supported')
  }
  const path = match[4] ?? ''
  const segments = path.split('/')
  if (segments.some((part) => part === '.' || part === '..') || /\/\//.test(path)) {
    throw unsafeRoute('the local proxy address contains an unsafe path')
  }
  return value
}

/** A strict TOML string scalar; unsupported syntax for routing fields fails closed. */
function tomlString(source: string): string {
  const basic = /^("(?:[^"\\]|\\["\\bfnrt]|\\u[0-9a-fA-F]{4}|\\U[0-9a-fA-F]{8})*")\s*(?:#.*)?$/.exec(source)
  if (basic) {
    try {
      // JSON supports all ordinary escapes used by a TOML basic string; we
      // deliberately do not try to interpret multiline or interpolation.
      const result: unknown = JSON.parse(basic[1]!)
      if (typeof result === 'string') return result
    } catch { /* invalid scalar */ }
  }
  const literal = /^'([^']*)'\s*(?:#.*)?$/.exec(source)
  if (literal) return literal[1]!
  throw unsafeRoute('unsupported or malformed routing entry in config.toml')
}

/**
 * Read only top-level routing keys; [model_providers.*] and other tables are
 * not routing instructions for this app. A duplicate is treated as ambiguous.
 */
export function codexLocalEndpointFromConfig(config: string): string | undefined {
  let topLevel = true
  let route: string | undefined
  let provider: string | undefined
  const seen = new Set<string>()
  for (const line of config.split(/\r?\n/)) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('[')) {
      topLevel = false
      continue
    }
    if (!topLevel || !trimmed || trimmed.startsWith('#')) continue
    const setting = /^(openai_base_url|model_provider)\s*=\s*(.*)$/.exec(trimmed)
    if (!setting) continue
    const [, key, raw] = setting
    if (seen.has(key!)) throw unsafeRoute(`duplicate ${key} setting`)
    seen.add(key!)
    const value = tomlString(raw!)
    if (key === 'openai_base_url') route = validatedCodexLocalEndpoint(value)
    else provider = value
  }
  if (provider !== undefined && provider !== 'openai') {
    throw unsafeRoute('custom model_provider is not supported by this desktop connection')
  }
  return route
}

/**
 * Read at launch time so a running app follows changes made in the Codex CLI.
 * Missing config is ordinary first-run state; every other read error stops the
 * launch rather than silently routing a configured proxy to the cloud.
 */
export async function readCodexLocalEndpoint(
  env: NodeJS.ProcessEnv = process.env,
  readConfig: (file: string) => Promise<string> = defaultReadConfig,
): Promise<string | undefined> {
  const codexHome = env.CODEX_HOME || join(env.HOME || env.USERPROFILE || homedir(), '.codex')
  const path = join(codexHome, 'config.toml')
  try {
    return codexLocalEndpointFromConfig(await readConfig(path))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    if (error instanceof AiRunError) throw error
    throw unsafeRoute('config.toml could not be read')
  }
}

async function defaultReadConfig(path: string): Promise<string> {
  const file = await stat(path)
  if (file.size > MAX_CONFIG_BYTES) throw unsafeRoute('config.toml is too large to verify')
  return readFile(path, 'utf8')
}

/** Keep every Codex hardening override, changing only the validated base URL. */
export function codexOpenaiBaseUrlOverride(localEndpoint?: string): string {
  return `openai_base_url=${JSON.stringify(localEndpoint ? validatedCodexLocalEndpoint(localEndpoint) : '')}`
}

import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import {
  LEGACY_MCP_SERVER_NAME,
  mcpAgentIds,
  mcpConfigFile,
  migrateLegacyMcpEntry,
} from '@genoffice/cli/agent-mcp'
import {
  bundledSkillFrom,
  installSkill,
  LEDGER_KEY,
  ledgerFromSettings,
} from '@genoffice/cli/agent-skills'
import { HOME_DIR_NAME, launcherFileName } from '@genoffice/cli/install'
import { mcpLaunchFromLauncher } from '@genoffice/cli/mcp-launch'
import { PRODUCT_NAME } from '@genoffice/i18n'
import { readAppSettings, writeAppSetting } from './app-settings'

/**
 * Releases up to 0.16.2 registered this app on the user's machine under the
 * base project's command name. This moves what those releases left behind to
 * the product's own names, once per machine:
 *
 * - the per-user folder (launcher record, CLI audit log, the user's skills),
 * - the coding agents' MCP entries and the agent skill this app installed,
 * - the terminal command links it made.
 *
 * Only things that point into this product's install (HangulAIWorkbench) are
 * touched: the base project's own app may be installed beside it and keeps
 * its registrations.
 */
export const LEGACY_COMMAND = LEGACY_MCP_SERVER_NAME
const LEGACY_HOME_DIR_NAME = `.${LEGACY_COMMAND}`
const LEGACY_SKILL_KEYS: Array<[string, string]> = [
  ['ieum-title', 'ttok-title'],
  ['ieum-template', 'ttok-template'],
]
const LEGACY_SOURCE_FILE: [string, string] = ['.ieum-source.json', '.ttok-source.json']
const SETTING_KEY = 'legacyNamesMigrated'

export interface LegacyMigrationOptions {
  home: string
  settingsPath: string
  /** directory holding the current launcher (Resources/cli when packaged) */
  cliDir: string
  /** the bundled agent skill (skills/ttokttak/SKILL.md) */
  skillPath: string
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
}

export interface LegacyMigrationReport {
  home: 'moved' | 'merged' | 'none'
  mcpEntries: number
  skills: number
  links: number
}

/** Runs once per machine; later calls return null without touching anything. */
export function migrateLegacyNames(opts: LegacyMigrationOptions): LegacyMigrationReport | null {
  if (readAppSettings(opts.settingsPath)[SETTING_KEY] === true) return null
  const report: LegacyMigrationReport = {
    home: moveLegacyHome(opts.home),
    mcpEntries: 0,
    skills: 0,
    links: 0,
  }
  const platform = opts.platform ?? process.platform
  const launcher = join(opts.cliDir, launcherFileName(platform))
  const launch = mcpLaunchFromLauncher(launcher, { platform, exists: existsSync })
  for (const id of mcpAgentIds()) {
    try {
      const file = mcpConfigFile(id, { env: opts.env, home: opts.home })
      if (file && migrateLegacyMcpEntry(id, file, launch)) report.mcpEntries++
    } catch {
      // an agent's config that cannot be read stays as it is
    }
  }
  report.skills = moveLegacyAgentSkills(opts)
  if (platform !== 'win32') report.links = removeLegacyCommandLinks(opts.home)
  writeAppSetting(opts.settingsPath, SETTING_KEY, true)
  return report
}

/** The legacy folder is ours when its launcher record points into this product. */
function legacyHomeIsOurs(dir: string): boolean {
  try {
    return readFileSync(join(dir, 'launcher'), 'utf-8').includes(PRODUCT_NAME)
  } catch {
    return false
  }
}

function moveLegacyHome(home: string): LegacyMigrationReport['home'] {
  const legacy = join(home, LEGACY_HOME_DIR_NAME)
  const current = join(home, HOME_DIR_NAME)
  if (!existsSync(legacy) || !legacyHomeIsOurs(legacy)) return 'none'
  let result: LegacyMigrationReport['home'] = 'moved'
  if (!existsSync(current)) {
    renameSync(legacy, current)
  } else {
    // the new folder already exists (written by this version before the move):
    // bring over the user's skills it does not have yet, then drop the old folder
    result = 'merged'
    const from = join(legacy, 'skills')
    const to = join(current, 'skills')
    if (existsSync(from)) {
      if (!existsSync(to)) renameSync(from, to)
      else
        for (const name of readdirSync(from))
          if (!existsSync(join(to, name))) renameSync(join(from, name), join(to, name))
    }
    rmSync(legacy, { recursive: true, force: true })
  }
  rewriteLegacySkillRecords(join(current, 'skills'))
  return result
}

/** Installed skills keep their title, template and GitHub source under the current keys. */
function rewriteLegacySkillRecords(skillsDir: string): void {
  let names: string[]
  try {
    names = readdirSync(skillsDir)
  } catch {
    return
  }
  for (const name of names) {
    const dir = join(skillsDir, name)
    const [oldSource, newSource] = LEGACY_SOURCE_FILE
    try {
      if (existsSync(join(dir, oldSource)) && !existsSync(join(dir, newSource))) {
        renameSync(join(dir, oldSource), join(dir, newSource))
      }
      const skill = join(dir, 'SKILL.md')
      const text = readFileSync(skill, 'utf-8')
      let next = text
      for (const [oldKey, newKey] of LEGACY_SKILL_KEYS) {
        next = next.replace(new RegExp(`^(\\s+)${oldKey}:`, 'gm'), `$1${newKey}:`)
      }
      if (next !== text) writeFileSync(skill, next, 'utf-8')
    } catch {
      // not a skill folder, or unreadable: leave it
    }
  }
}

/** Agent skills this app installed under the legacy folder name, reinstalled under the current one. */
function moveLegacyAgentSkills(opts: LegacyMigrationOptions): number {
  const ledger = ledgerFromSettings(readAppSettings(opts.settingsPath))
  const legacy = Object.keys(ledger).filter((path) =>
    new RegExp(`[\\\\/]${LEGACY_COMMAND}[\\\\/]SKILL\\.md$`).test(path),
  )
  if (!legacy.length) return 0
  let moved = 0
  let bundled
  try {
    bundled = bundledSkillFrom(readFileSync(opts.skillPath))
  } catch {
    return 0
  }
  for (const path of legacy) {
    try {
      rmSync(path, { force: true })
      try {
        if (readdirSync(dirname(path)).length === 0) rmSync(dirname(path), { recursive: true })
      } catch {}
      delete ledger[path]
      installSkill(dirname(dirname(path)), bundled, ledger)
      moved++
    } catch {
      delete ledger[path]
    }
  }
  writeAppSetting(opts.settingsPath, LEDGER_KEY, ledger)
  return moved
}

/** `ieumoffice` command links on the PATH that point into this product (now dangling). */
function removeLegacyCommandLinks(home: string): number {
  let removed = 0
  for (const dir of [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    join(home, '.local', 'bin'),
    join(home, 'bin'),
  ]) {
    const link = join(dir, LEGACY_COMMAND)
    try {
      if (lstatSync(link).isSymbolicLink() && readlinkSync(link).includes(PRODUCT_NAME)) {
        unlinkSync(link)
        removed++
      }
    } catch {
      // absent, or not ours to remove
    }
  }
  return removed
}

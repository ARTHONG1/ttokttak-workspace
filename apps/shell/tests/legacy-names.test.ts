import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateLegacyNames } from '../src/main/legacy-names'

const SKILL = join(__dirname, '..', '..', '..', 'skills', 'ttokttak', 'SKILL.md')

function machine() {
  const root = mkdtempSync(join(tmpdir(), 'legacy-names-'))
  const home = join(root, 'home')
  mkdirSync(home)
  return {
    home,
    settingsPath: join(root, 'app-settings.json'),
    cliDir: '/Applications/HangulAIWorkbench.app/Contents/Resources/cli',
    skillPath: SKILL,
    platform: 'darwin' as const,
    env: { GENOFFICE_HOME: home },
  }
}

describe('migrateLegacyNames (update from 0.16.2 or earlier)', () => {
  it("moves the per-user folder with the user's skills and their records, once", () => {
    const m = machine()
    const legacy = join(m.home, '.ieumoffice')
    mkdirSync(join(legacy, 'skills', 'minutes'), { recursive: true })
    writeFileSync(
      join(legacy, 'launcher'),
      '/Applications/HangulAIWorkbench.app/Contents/Resources/cli\n',
    )
    writeFileSync(
      join(legacy, 'skills', 'minutes', 'SKILL.md'),
      '---\nname: minutes\nmetadata:\n  ieum-title: 회의록\n---\nbody\n',
    )
    writeFileSync(join(legacy, 'skills', 'minutes', '.ieum-source.json'), '{}')

    expect(migrateLegacyNames(m)).toMatchObject({ home: 'moved' })
    const skill = join(m.home, '.ttokttak', 'skills', 'minutes')
    expect(existsSync(legacy)).toBe(false)
    expect(readFileSync(join(skill, 'SKILL.md'), 'utf-8')).toContain('  ttok-title: 회의록')
    expect(existsSync(join(skill, '.ttok-source.json'))).toBe(true)
    expect(migrateLegacyNames(m)).toBeNull()
  })

  it("leaves a legacy folder that belongs to the base project's own app", () => {
    const m = machine()
    const legacy = join(m.home, '.ieumoffice')
    mkdirSync(legacy)
    writeFileSync(join(legacy, 'launcher'), '/Applications/IeumOffice.app/Contents/Resources/cli\n')
    expect(migrateLegacyNames(m)).toMatchObject({ home: 'none' })
    expect(existsSync(legacy)).toBe(true)
  })

  it('reinstalls the agent skill it had installed under the legacy folder name', () => {
    const m = machine()
    const skills = join(m.home, '.claude', 'skills')
    const old = join(skills, 'ieumoffice', 'SKILL.md')
    mkdirSync(join(skills, 'ieumoffice'), { recursive: true })
    writeFileSync(old, 'old')
    writeFileSync(
      m.settingsPath,
      JSON.stringify({
        agentSkillInstalls: { [old]: { version: '1', sha256: 'x', at: 'y', channel: 'app' } },
      }),
    )
    expect(migrateLegacyNames(m)).toMatchObject({ skills: 1 })
    expect(existsSync(join(skills, 'ieumoffice'))).toBe(false)
    expect(readFileSync(join(skills, 'ttokttak', 'SKILL.md'), 'utf-8')).toBe(
      readFileSync(SKILL, 'utf-8'),
    )
    const ledger = JSON.parse(readFileSync(m.settingsPath, 'utf-8')).agentSkillInstalls
    expect(Object.keys(ledger)).toEqual([join(skills, 'ttokttak', 'SKILL.md')])
  })
})

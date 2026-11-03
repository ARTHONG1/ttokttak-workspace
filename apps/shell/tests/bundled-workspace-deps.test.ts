import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * electron-vite bundles devDependencies into the shell main and leaves
 * "dependencies" to be required at run time from app.asar. The workspace
 * packages ship TypeScript source only, so one listed under "dependencies"
 * is required as a .ts file by the installed app, and the app dies at launch
 * (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING, 0.15.0 rehearsal).
 */
const SHELL = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(SHELL, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
}

describe('shell package.json', () => {
  it('bundles every workspace package instead of requiring its source at run time', () => {
    const atRunTime = Object.keys(pkg.dependencies ?? {}).filter((name) =>
      name.startsWith('@genoffice/'),
    )
    expect(atRunTime).toEqual([])
  })
})

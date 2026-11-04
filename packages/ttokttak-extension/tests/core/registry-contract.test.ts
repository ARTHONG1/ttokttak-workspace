import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FEATURES } from '../../src/core/registry'

/**
 * A task is more than its line in core/registry.ts: the page part, the extension's check of
 * its work, the desktop app's queue check and a browser test must all know it. This test
 * names what is missing when a task is added halfway (see ADDING-A-FEATURE.ko.md).
 */
const PKG = join(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (...p: string[]) => readFileSync(join(PKG, ...p), 'utf8')
const e2e = readdirSync(join(PKG, 'e2e'))
  .map((f) => read('e2e', f))
  .join('\n')

describe('every registered task is wired through', () => {
  for (const f of FEATURES) {
    describe(f.id, () => {
      it('has its page part in src/features/<id>/index.ts, joined in page-main', () => {
        expect(existsSync(join(PKG, 'src/features', f.id, 'index.ts'))).toBe(true)
        expect(read('src/ext/page-main.ts')).toContain("'../features/" + f.id + "/index'")
      })

      it("has the extension's check of its work", () => {
        expect(read('src/ext/background.ts')).toContain("'" + f.id + "':")
      })

      it("has the desktop app's queue check", () => {
        expect(read('../../apps/shell/src/main/work-outbox.ts')).toContain("'" + f.id + "':")
      })

      it('has a browser test', () => {
        expect(e2e).toContain(f.id)
      })
    })
  }
})

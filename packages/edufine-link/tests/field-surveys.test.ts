import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { specFromDiagnostic, type DiagnosticFile } from '../src/diagnose'
import { applyFill, planFill } from '../src/fill'
import { buildPumuiPackage } from '../src/pumui-package'
import { findWorkForm } from '../src/screen'
import { DEFAULT_SCREEN_MAP } from '../src/screen-map'
import { makeFakeEdufine } from './fixtures/fake-nexacro'

// Field survey files: structure-only copies of diagnostic files from real K-에듀파인
// screens (tools/rea-edufine/diag.mjs in the workspace writes them here). Every 품의등록
// screen recorded in the field must fill with the current code and 화면 이름표.
const DIR = join(__dirname, 'fixtures/surveys')
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')) : []

describe('field survey screens', () => {
  it.skipIf(files.length > 0)('has no field survey yet', () => {})

  for (const name of files) {
    const diag = JSON.parse(readFileSync(join(DIR, name), 'utf8')) as DiagnosticFile
    it.skipIf(diag.screen?.kind !== 'pumui')(name + ': fills the recorded 품의등록 screen', () => {
      const fake = makeFakeEdufine(specFromDiagnostic(diag, DEFAULT_SCREEN_MAP))
      const form = findWorkForm(fake.nx, DEFAULT_SCREEN_MAP)!
      const unit = diag.unitTable[0]?.name ?? '개'
      const pkg = buildPumuiPackage({
        title: '현장 화면 시험 품의',
        summary: '시험',
        items: [
          {
            description: '시험 품목',
            specification: '',
            unit,
            quantity: 2,
            unitPrice: 1000,
            amount: 2000,
          },
        ],
      })
      expect(applyFill(form, DEFAULT_SCREEN_MAP, planFill(form, DEFAULT_SCREEN_MAP, pkg))).toEqual({
        ok: true,
        added: 1,
        gridTotal: 2000,
      })
      expect(fake.forbiddenCalls()).toBe(0)
    })
  }
})

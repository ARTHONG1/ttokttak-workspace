import { expect, it } from 'vitest'
import { applyDisplayName } from '../src/main/app-display-name'

it('renames the app while preserving the existing data directory', () => {
  let name = 'HangulAIWorkbench'
  let path = '/existing/profile/HangulAIWorkbench'
  applyDisplayName({
    getPath: () => path,
    setPath: (_key, value) => {
      path = value
    },
    setName: (value) => {
      name = value
      path = '/new/default/' + value
    },
  })
  expect(name).toBe('똑딱작업실')
  expect(path).toBe('/existing/profile/HangulAIWorkbench')
})

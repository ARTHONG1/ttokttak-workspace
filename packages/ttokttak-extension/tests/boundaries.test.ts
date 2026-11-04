import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The folders keep tasks apart: a feature (src/features/<id>) never uses another feature,
 * site code (src/sites) never uses a feature, and core (src/core) knows the features only
 * through core/registry.ts. A mistake in a new task then cannot break 에듀파인 품의.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []
  })
}

/** every relative import of a source file, as a path under src/ */
function imports(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  return [...text.matchAll(/from '(\.[^']+)'/g)].map((m) =>
    relative(SRC, resolve(dirname(file), m[1]))
      .split('\\')
      .join('/'),
  )
}

const under = (file: string) => relative(SRC, file).split('\\').join('/')

describe('folder boundaries', () => {
  const all = files(SRC)
  const features = all.filter((f) => under(f).startsWith('features/'))

  it('has at least one feature', () => {
    expect(features.length).toBeGreaterThan(0)
  })

  it('keeps each feature to itself', () => {
    const bad = features.flatMap((f) => {
      const own = under(f).split('/')[1]
      return imports(f)
        .filter((i) => i.startsWith('features/') && i.split('/')[1] !== own)
        .map((i) => under(f) + ' → ' + i)
    })
    expect(bad).toEqual([])
  })

  it('keeps site code and core free of features, but for the registry', () => {
    const bad = all
      .filter((f) => /^(sites|core)\//.test(under(f)) && under(f) !== 'core/registry.ts')
      .flatMap((f) =>
        imports(f)
          .filter((i) => i.startsWith('features/'))
          .map((i) => under(f) + ' → ' + i),
      )
    expect(bad).toEqual([])
  })
})

#!/usr/bin/env node
/**
 * Fixes in installed dependencies, run on every npm install (root postinstall). Each fix
 * names the exact version it was written for and is skipped, with a notice, for any other
 * version: an upgrade must look at the fix again instead of silently losing it.
 *
 * numfmt 3.2.6 (Univer pins it): round() scaled the value by 10**places for every place a
 * format allows, so a format with many optional decimals (statistics workbooks often use
 * "#,##0.0#####################") showed the binary error: 501.13 → 501.12999999999994, or
 * "####" in a narrow column. Excel keeps 15 significant digits; so does round() now. numfmt
 * 4 fixed it, but its API (tokenTypes, lower-case token types) no longer fits Univer 0.25.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))

function patchFile(file, from, to) {
  const text = readFileSync(file, 'utf8')
  if (text.includes(to)) return 'already'
  if (!text.includes(from)) throw new Error('patch-deps: the expected code is not in ' + file)
  writeFileSync(file, text.replace(from, to))
  return 'patched'
}

function numfmt() {
  let dir
  try {
    // its exports hide package.json: find the package from its CommonJS entry (dist/numfmt.js)
    dir = dirname(dirname(require.resolve('numfmt')))
  } catch {
    console.warn('patch-deps: numfmt is not installed; nothing to patch')
    return
  }
  const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  if (version !== '3.2.6') {
    console.warn(
      'patch-deps: numfmt ' + version + ' is not 3.2.6; its 15-digit fix was not applied',
    )
    return
  }
  const lib = patchFile(
    join(dir, 'lib/round.js'),
    '  if (places) {\n    const p = 10 ** (places) || 1;',
    '  if (places > 0 && number > 0) {\n    // 15 significant digits, as Excel (patched by tools/patch-deps.mjs)\n    places = Math.min(places, Math.max(0, 15 - Math.floor(Math.log10(number)) - 1));\n  }\n  if (places) {\n    const p = 10 ** (places) || 1;',
  )
  const dist = patchFile(
    join(dir, 'dist/numfmt.js'),
    'if(t){const n=10**t||1;return _e(e*n,0)/n}',
    'if(t>0&&e>0){t=Math.min(t,Math.max(0,15-Math.floor(Math.log10(e))-1))}if(t){const n=10**t||1;return _e(e*n,0)/n}',
  )
  const shown = require(join(dir, 'dist/numfmt.js')).format('#,##0.0#####################', 501.13)
  if (shown !== '501.13') throw new Error('patch-deps: numfmt still formats 501.13 as ' + shown)
  console.log(
    'patch-deps: numfmt 3.2.6 rounds to 15 significant digits (lib ' + lib + ', dist ' + dist + ')',
  )
}

numfmt()

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { agentPlugin, type AgentPluginHost } from '../studio-plugin/agent-plugin.mjs'
import { planLocalExactEdit } from '../../docs/src/main/local-ai-exact-edit'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  await init({
    module_or_path: readFileSync(join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')),
  })
})

function fixture(lines: string[]) {
  let doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  lines.forEach((line, index) => {
    if (index) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    if (line) doc.insertText(0, index, 0, line)
  })
  let steps = 0
  const host = {
    read: (fn: (d: HwpDocument) => unknown) => fn(doc),
    transaction: (_label: string, fn: (tx: never) => unknown) => {
      const before = doc.exportHwpx()
      try {
        const result = fn({ doc: () => doc, deferPagination: () => {} } as never)
        steps++
        return result
      } catch (error) {
        doc.free()
        doc = new HwpDocument(before)
        throw error
      }
    },
    events: { on: () => undefined },
    automation: { execute: () => null },
  } as unknown as AgentPluginHost
  const plugin = agentPlugin.activate(host)
  return {
    plugin,
    get steps() {
      return steps
    },
    save: () => doc.exportHwpx(),
    close: () => doc.free(),
  }
}

const hwpTool = {
  name: 'replace_text',
  description: 'Replace one exact occurrence',
  inputSchema: {
    type: 'object' as const,
    properties: { find: { type: 'string' }, replace: { type: 'string' } },
  },
}

const textOf = (bytes: Uint8Array) => {
  const doc = new HwpDocument(bytes)
  try {
    return JSON.parse(doc.getTextFileText()) as string
  } finally {
    doc.free()
  }
}

describe('local AI exact edit through the real HWPX engine', () => {
  it('saves and reopens only the quoted replacement, preserving date, amount and organization', () => {
    const editor = fixture([
      '새빛초등학교 공문',
      '행사일: 2026년 12월 3일',
      '예산: 350,000원',
      '협조 부탁드립니다.',
    ])
    try {
      const planned = planLocalExactEdit(
        [
          {
            role: 'user',
            text: '날짜와 예산은 그대로 두고 "협조 부탁드립니다."를 "협조하여 주시기 바랍니다."로 바꿔 줘.',
          },
        ],
        [hwpTool],
      )
      expect(planned?.name).toBe('replace_text')
      const { find, replace } = planned!.input as { find: string; replace: string }
      expect(editor.plugin.replaceText(find, replace)).toMatchObject({ ok: true, count: 1 })
      expect(editor.steps).toBe(1)
      expect(textOf(editor.save()).split(/\r?\n/)).toEqual([
        '새빛초등학교 공문',
        '행사일: 2026년 12월 3일',
        '예산: 350,000원',
        '협조하여 주시기 바랍니다.',
      ])
    } finally {
      editor.close()
    }
  })

  it('rejects repeated text without changing the serialized HWPX', () => {
    const editor = fixture(['협조 부탁드립니다.', '협조 부탁드립니다.'])
    try {
      const before = textOf(editor.save())
      expect(
        editor.plugin.replaceText('협조 부탁드립니다.', '협조하여 주시기 바랍니다.'),
      ).toMatchObject({
        ok: false,
        reason: 'ambiguous',
        count: 2,
      })
      expect(editor.steps).toBe(0)
      expect(textOf(editor.save())).toBe(before)
    } finally {
      editor.close()
    }
  })
})

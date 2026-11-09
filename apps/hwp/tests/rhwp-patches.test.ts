import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { RENDERER_SCHEME } from '../../../packages/electron-utils/src/renderer-scheme'
import {
  AGENT_PLUGIN_MODULE,
  APP_SCHEME,
  HANCOM_KEYS_MODULE,
  PASSWORD_FLAG,
  STUDIO_PATCHES,
  applyPatch,
  hancomHooks,
  missingHancomCommands,
  missingPluginHooks,
  pluginHooks,
  rhwpPatches,
} from '../scripts/rhwp-patches.mjs'
import { AGENT_PLUGIN_ID } from '../studio-plugin/agent-plugin.mjs'

const require = createRequire(import.meta.url)

describe('rhwp scheme patches', () => {
  it('admit the scheme the packaged renderers are served from', () => {
    expect(APP_SCHEME).toBe(RENDERER_SCHEME)
  })

  it('apply to the installed @rhwp/editor transport', () => {
    const transport = join(dirname(require.resolve('@rhwp/editor')), 'transport.js')
    const patched = applyPatch('sdk-scheme', readFileSync(transport, 'utf8'))
    expect(patched).toContain(`targetUrl.protocol !== '${APP_SCHEME}:'`)
    // http and https stay accepted: the dev server origin depends on them
    expect(patched).toContain("targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:'")
  })

  it('patch the studio origin check', () => {
    const source = "    return protocol === 'http:' || protocol === 'https:';\n"
    expect(applyPatch('studio-scheme', source)).toBe(
      `    return protocol === 'http:' || protocol === 'https:' || protocol === '${APP_SCHEME}:';\n`,
    )
  })
})

describe('rhwp password-flag patch', () => {
  it('adds the protection flag to the command context, next to the dirty flag', () => {
    const source = [
      '  return {',
      '    hasDocument: hasDoc,',
      '    isDirty: documentState.isDirty(),',
      '  };',
      '',
    ].join('\n')
    expect(applyPatch('studio-password-flag', source)).toBe(
      [
        '  return {',
        '    hasDocument: hasDoc,',
        '    isDirty: documentState.isDirty(),',
        `    ${PASSWORD_FLAG}: wasm.requiresPasswordForSave,`,
        '  };',
        '',
      ].join('\n'),
    )
  })
})

describe('rhwp plugin-allow patch', () => {
  it('lets the studio load the app plugin, and nothing else new', () => {
    const source = [
      'async function resolvePlugin(id: string): Promise<StudioPlugin | null> {',
      "  if (id === 'hwpctrl') return hwpctrlPlugin;",
      "  if (import.meta.env.DEV && id === 'dev-probe') {",
      '    return devProbePlugin;',
      '  }',
      '  return null;',
      '}',
      '',
    ].join('\n')
    const patched = applyPatch('studio-plugin-allow', source)
    expect(patched).toContain(`if (id === '${AGENT_PLUGIN_ID}') {`)
    expect(patched).toContain(`import('${AGENT_PLUGIN_MODULE}')`)
    // the studio's own entries stay, in their order
    expect(patched.indexOf("id === 'hwpctrl'")).toBeLessThan(patched.indexOf(AGENT_PLUGIN_ID))
    expect(patched).toContain("  if (import.meta.env.DEV && id === 'dev-probe') {")
    expect(patched.split('if (').length).toBe(source.split('if (').length + 1)
  })
})

describe('a patch whose text is gone', () => {
  it('fails loudly instead of building an unpatched editor', () => {
    expect(() => applyPatch('sdk-scheme', 'export class EditorTransport {}')).toThrow(/rhwp patch/)
    expect(() => applyPatch('studio-scheme', 'export const x = 1')).toThrow(/rhwp patch/)
    expect(() => applyPatch('studio-password-flag', 'return { hasDocument }')).toThrow(/rhwp patch/)
    expect(() => applyPatch('studio-plugin-allow', 'return null')).toThrow(/rhwp patch/)
  })

  it('refuses to guess between two matches', () => {
    const twice = "return protocol === 'http:' || protocol === 'https:';\n".repeat(2)
    expect(() => applyPatch('studio-scheme', twice)).toThrow(/exactly one/)
  })
})

describe('what the plugin reaches into the studio for', () => {
  const complete = (file: string) => {
    const needles = [...pluginHooks, ...hancomHooks]
      .filter((hook) => hook.file === file)
      .flatMap((hook) => hook.needles)
    return needles.length > 0 ? needles.join('\n') : null
  }

  it('is all there in a source that has every name', () => {
    expect(missingPluginHooks(complete)).toEqual([])
  })

  it('accepts CRLF checkouts while still rejecting a changed hook', () => {
    const windows = (file: string) => complete(file)?.replaceAll('\n', '\r\n') ?? null
    expect(missingPluginHooks(windows)).toEqual([])
    const changed = (file: string) =>
      windows(file)?.replace('getSelectionOrdered()', 'selectionInOrder()') ?? null
    expect(missingPluginHooks(changed)).toEqual(['src/engine/cursor.ts: getSelectionOrdered()'])
  })

  it('names the file and the name when one is gone', () => {
    const renamed = (file: string) =>
      (complete(file) ?? '').replace('getSelectionOrdered()', 'selectionInOrder()')
    expect(missingPluginHooks(renamed)).toEqual(['src/engine/cursor.ts: getSelectionOrdered()'])
  })

  it('counts every name of a file that is gone', () => {
    const gone = (file: string) => (file === 'src/automation/types.ts' ? null : complete(file))
    expect(missingPluginHooks(gone)).toEqual([
      'src/automation/types.ts: registerCommand(def: ExtCommandDef): void',
    ])
  })
})

describe('rhwp format-copy safety patch', () => {
  const source = [
    'const FORMAT_COPY_CELL_KEYS: Array<keyof CellProperties> = [',
    "  'cellProtect',",
    "  'fieldName',",
    "  'editableInForm',",
    "  'borderFillId',",
    '];',
  ].join('\n')

  it('drops the form field name and editability from a copied cell look', () => {
    const patched = applyPatch('studio-format-copy-safety', source)
    expect(patched).not.toContain("'fieldName'")
    expect(patched).not.toContain("'editableInForm'")
    expect(patched).toContain("'cellProtect'")
    expect(patched).toContain("'borderFillId'")
  })
})

describe('rhwp nested-table patches', () => {
  // the studio's text around each patch, as the pinned release has it
  const bridge = [
    '  deleteTableControl(sec: number, parentPara: number, controlIdx: number): { ok: boolean } {',
    "    if (!this.doc) throw new Error('문서가 로드되지 않았습니다');",
    '    return JSON.parse(this.doc.deleteTableControl(sec, parentPara, controlIdx));',
    '  }',
    '',
    '  getCellProperties(sec: number) {}',
    '',
  ].join('\n')

  it('give the bridge one call for a table in the body or in a cell', () => {
    const patched = applyPatch('studio-table-delete-at', bridge)
    expect(patched).toContain('deleteTableAt(ref: {')
    // a path of two or more is a table in a cell: the cell is all but the last step
    expect(patched).toContain(
      'if (path.length < 2) return this.deleteTableControl(ref.sec, ref.ppi, ref.ci);',
    )
    expect(patched).toContain(
      'JSON.stringify(path.slice(0, -1)), path[path.length - 1].controlIndex',
    )
    expect(patched).toContain('this.doc.deleteCellTableControlByPath(')
    // the studio's own call stays as it was
    expect(patched.startsWith(bridge.split('\n\n')[0])).toBe(true)
    expect(patched).toContain('  getCellProperties(sec: number) {}')
  })

  it('let Delete take a selected table in a cell instead of dropping the selection', () => {
    const source = [
      '    if (this.cursor.isInTableObjectSelection()) {',
      '      const ref = this.cursor.getSelectedTableRef();',
      '      if (!ref) return;',
      '      if (ref.cellPath && ref.cellPath.length > 1) {',
      '        this.cursor.moveOutOfSelectedTable();',
      "        this.eventBus.emit('table-object-selection-changed', false);",
      '        this.updateCaret();',
      '        return;',
      '      }',
      '      this.cursor.moveOutOfSelectedTable();',
      "      this.eventBus.emit('table-object-selection-changed', false);",
      "      this.executeOperation({ kind: 'snapshot', operationType: 'deleteTable', operation: (wasm: WasmBridge) => {",
      '        wasm.deleteTableControl(ref.sec, ref.ppi, ref.ci);',
      '        return this.cursor.getPosition();',
      '      }});',
      '',
    ].join('\n')
    const patched = applyPatch('studio-nested-table-delete', source)
    expect(patched).not.toContain('ref.cellPath.length > 1')
    expect(patched).not.toContain('deleteTableControl')
    expect(patched).toContain(
      '        wasm.deleteTableAt(ref);\n        return this.cursor.getPosition();',
    )
    expect(patched.split('moveOutOfSelectedTable()').length).toBe(2)
  })

  it('lets Cut delete a nested table only after the guarded asynchronous copy', () => {
    const source = [
      '    // 중첩 표 잘라내기는 지원하지 않는다. keydown 경로도 같은 선택 상태를 유지한다.',
      '    if (table?.cellPath && table.cellPath.length > 1) return;',
      '    try {',
      '      if (!await this.copySelectedObject(isCurrent) || !isCurrent()) return;',
      '      if (picture) {',
      '        this.deleteObjectControl(picture);',
      '      } else {',
      '        this.cursor.moveOutOfSelectedTable();',
      "        this.executeOperation({ kind: 'snapshot', operationType: 'cutTable', operation: (wasm: WasmBridge) => {",
      '          wasm.deleteTableControl(ref.sec, ref.ppi, ref.ci);',
      '          return this.cursor.getPosition();',
      '        }});',
      "        this.eventBus.emit('table-object-selection-changed', false);",
      '      }',
      '    } finally { cancel(); }',
    ].join('\n')
    const patched = applyPatch('studio-nested-table-cut', source)
    expect(patched).not.toContain('table.cellPath.length > 1')
    expect(patched).toContain(
      'if (!await this.copySelectedObject(isCurrent) || !isCurrent()) return;',
    )
    expect(patched).toContain('wasm.deleteTableAt(ref);')
    expect(patched).toContain('this.deleteObjectControl(picture);')
    expect(patched).toContain('finally { cancel(); }')
    expect(() => applyPatch('studio-nested-table-cut', `${source}\n${source}`)).toThrow(
      /exactly one/,
    )
  })

  it('make Delete Table take the table the caret is in, not the outer one', () => {
    const source = [
      '    execute(services) {',
      '      const ih = services.getInputHandler();',
      '      if (!ih) return;',
      '      const ref = ih.getSelectedTableRef();',
      '      if (ref) {',
      '        safeTableOp(() => ih.executeOperation({',
      "          kind: 'snapshot',",
      "          operationType: 'deleteTable',",
      '          operation: (wasm) => {',
      '            wasm.deleteTableControl(ref.sec, ref.ppi, ref.ci);',
      '',
    ].join('\n')
    const patched = applyPatch('studio-nested-table-command', source)
    // a selected table in a cell goes the way Delete takes it
    const nested = patched.indexOf('if ((ref?.cellPath?.length ?? 0) > 1) {')
    expect(nested).toBeGreaterThan(-1)
    expect(patched.indexOf('ih.performDelete();')).toBeGreaterThan(nested)
    // from the caret, a path of two or more means the inner table, and the caret stays in its cell
    expect(patched).toContain('(at.cellPath?.length ?? 0) > 1')
    expect(patched).toContain('cellPath: at.cellPath')
    expect(patched).toContain('cellPath: outer,')
    // a table in the body is still deleted as before
    expect(patched).toContain('      if (ref) {\n        safeTableOp(() => ih.executeOperation({')
    expect(patched).toContain('wasm.deleteTableControl(ref.sec, ref.ppi, ref.ci);')
  })

  it('match a checkout with CRLF line ends, and keep them', () => {
    const patched = applyPatch('studio-table-delete-at', bridge.replaceAll('\n', '\r\n'))
    expect(patched).toContain('deleteTableAt(ref: {')
    expect(patched.replaceAll('\r\n', '')).not.toContain('\n')
  })

  it('are all in the studio build', () => {
    for (const name of [
      'studio-table-delete-at',
      'studio-nested-table-delete',
      'studio-nested-table-cut',
      'studio-nested-table-command',
    ] as const) {
      expect(STUDIO_PATCHES).toContain(name)
    }
  })
})

describe('rhwp table page split patch', () => {
  // the studio's text after it makes a table from the menu, as the pinned release has it
  const create = [
    '              : wasm.createTable(pos.sectionIndex, pos.paragraphIndex, pos.charOffset, rows, cols);',
    '            if (result.ok) {',
    '              return {',
  ].join('\n')

  it('split a new table between rows at the page end, unless treated as a character', () => {
    const patched = applyPatch('studio-table-split-pages', create)
    expect(patched).toContain('if (result.ok && !options?.treatAsChar) {')
    expect(patched).toContain(
      'wasm.setTableProperties(pos.sectionIndex, result.paraIdx, result.controlIdx, { pageBreak: 1 });',
    )
    // the caret still goes into the new table's first cell
    expect(patched.indexOf('if (result.ok) {')).toBeGreaterThan(patched.indexOf('pageBreak: 1'))
    expect(STUDIO_PATCHES).toContain('studio-table-split-pages')
  })
})

describe('rhwp memo menu patches', () => {
  // the studio's text around the command, as the pinned release has it
  const insert = [
    "  stub('insert:para-band', t('command.insert.paraBand.label')),",
    "  stub('insert:comment', t('command.insert.comment.label'), 'icon-comment'),",
    '  {',
    "    id: 'insert:footnote',",
  ].join('\n')

  it('turn the comment stub into a command that asks the app for a memo', () => {
    const patched = applyPatch('studio-memo-command', insert)
    expect(patched).not.toContain("stub('insert:comment'")
    expect(patched).toContain("    id: 'insert:comment',")
    expect(patched).toContain("    icon: 'icon-comment',")
    expect(patched).toContain('canExecute: (ctx) => ctx.hasDocument && !ctx.isFormMode')
    expect(patched).toContain("globalThis.dispatchEvent(new CustomEvent('ttok:memo-insert'))")
    // no shortcut: the menu shows none for the memo
    const command = patched.slice(
      patched.indexOf("    id: 'insert:comment',"),
      patched.indexOf("    id: 'insert:footnote',"),
    )
    expect(command).not.toContain('shortcutLabel')
  })

  it('name the menu 메모 in Korean and Memo in English', () => {
    const ko = '  "command.insert.comment.label": "주석",'
    expect(applyPatch('studio-memo-label-ko', ko)).toBe('  "command.insert.comment.label": "메모",')
    const en = '  "command.insert.comment.label": "Comments",'
    expect(applyPatch('studio-memo-label-en', en)).toBe('  "command.insert.comment.label": "Memo",')
  })

  it('fail when the stub or a label is gone', () => {
    expect(() => applyPatch('studio-memo-command', 'export const insertCommands = []')).toThrow(
      /rhwp patch/,
    )
    expect(() => applyPatch('studio-memo-label-ko', 'const catalog = {}')).toThrow(/rhwp patch/)
    expect(() => applyPatch('studio-memo-label-en', 'const catalog = {}')).toThrow(/rhwp patch/)
  })

  it('refuse to guess between two matches', () => {
    const twice = [
      "  stub('insert:comment', t('command.insert.comment.label'), 'icon-comment'),",
      "  stub('insert:comment', t('command.insert.comment.label'), 'icon-comment'),",
    ].join('\n')
    expect(() => applyPatch('studio-memo-command', twice)).toThrow(/exactly one/)
    expect(() =>
      applyPatch('studio-memo-label-ko', '  "command.insert.comment.label": "주석",\n'.repeat(2)),
    ).toThrow(/exactly one/)
    expect(() =>
      applyPatch(
        'studio-memo-label-en',
        '  "command.insert.comment.label": "Comments",\n'.repeat(2),
      ),
    ).toThrow(/exactly one/)
  })

  it('are all in the studio build', () => {
    for (const name of [
      'studio-memo-command',
      'studio-memo-label-ko',
      'studio-memo-label-en',
    ] as const) {
      expect(STUDIO_PATCHES).toContain(name)
    }
  })
})

describe('rhwp memo bridge patch', () => {
  const bridge = [
    '  getMemoAnchors(): MemoAnchor[] {',
    "    if (!this.doc) throw new Error('문서가 로드되지 않았습니다');",
    '    return JSON.parse(this.doc.getMemoList());',
    '  }',
  ].join('\n')

  it('keeps one memo method and returns no anchors without a memo-capable document', () => {
    const patched = applyPatch('studio-memo-anchors', bridge)
    const js = ts.transpileModule(`class Bridge { ${patched} }`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText
    const makeBridge = new Function(`${js}; return new Bridge()`)
    const instance = makeBridge()
    expect(instance.getMemoAnchors()).toEqual([])
    instance.doc = {}
    expect(instance.getMemoAnchors()).toEqual([])
    instance.doc = { getMemoList: () => '[{"sectionIndex":2}]' }
    expect(instance.getMemoAnchors()).toEqual([{ sectionIndex: 2 }])
    expect(patched.match(/getMemoAnchors\(/g)).toHaveLength(1)
  })

  it('rejects missing and ambiguous upstream methods', () => {
    expect(() => applyPatch('studio-memo-anchors', 'export class WasmBridge {}')).toThrow(
      /rhwp patch/,
    )
    expect(() => applyPatch('studio-memo-anchors', `${bridge}\n${bridge}`)).toThrow(/exactly one/)
    expect(STUDIO_PATCHES).toContain('studio-memo-anchors')
  })
})

describe('official v0.9.0 studio integration', () => {
  // Both the studio builder and the engine builder may have fetched the same official tag.
  const studio = [
    join(__dirname, '..', 'node_modules', '.cache', 'rhwp-studio', 'v0.9.0', 'rhwp-studio'),
    join(
      __dirname,
      '..',
      '..',
      '..',
      'node_modules',
      '.cache',
      'rhwp-core',
      'v0.9.0',
      'rhwp-studio',
    ),
  ].find(existsSync)
  const read = (file: string) => {
    try {
      return readFileSync(join(studio!, file), 'utf8')
    } catch {
      return null
    }
  }
  const files = studio
    ? readdirSync(join(studio, 'src'), { recursive: true })
        .map(String)
        .filter((file) => file.endsWith('.ts'))
        .map((file) => join(studio, 'src', file))
    : []

  it.skipIf(!studio)(
    'takes every patch through the actual build hooks without duplicate methods',
    () => {
      const plugin = rhwpPatches(...STUDIO_PATCHES)
      const transform = plugin.transform as (code: string, id: string) => { code: string } | null
      for (const file of files) {
        const source = readFileSync(file, 'utf8')
        const patched = transform.call({}, source, `${file}?integration`)
        if (!patched) continue
        const ast = ts.createSourceFile(file, patched.code, ts.ScriptTarget.Latest, true)
        const checkClass = (node: ts.Node) => {
          if (ts.isClassDeclaration(node)) {
            const methods = node.members
              .filter(ts.isMethodDeclaration)
              .filter((method) => !!method.body)
              .map((method) => method.name.getText(ast))
            expect(new Set(methods).size, file).toBe(methods.length)
          }
          ts.forEachChild(node, checkClass)
        }
        checkClass(ast)
      }
      const buildEnd = plugin.buildEnd as () => void
      buildEnd.call({
        error: (message: string) => {
          throw new Error(message)
        },
      })
    },
  )

  it.skipIf(!studio)('has every app hook and Hangul-key command before transformation', () => {
    expect(missingPluginHooks(read)).toEqual([])
    const commands = join(studio!, 'src', 'command', 'commands')
    const sources = readdirSync(commands)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => readFileSync(join(commands, file), 'utf8'))
      .join('\n')
    expect(missingHancomCommands(sources)).toEqual([])
  })

  it.skipIf(!studio)('rejects upstream changes to the memo undo and paint-cache wiring', () => {
    for (const [file, needle] of [
      ['src/engine/command.ts', 'touchesMemoAnchor(wasm.getMemoAnchors(), target, start, end)'],
      ['src/core/memo.ts', 'memo.startCharIdx <= end && start <= memo.endCharIdx'],
      ['src/core/wasm-bridge.ts', 'canvasFontResolution.resolve(String(value))'],
      [
        'src/core/wasm-bridge.ts',
        'withHostCanvasFonts(session, () => canvasFontResolution.run(operation))',
      ],
      ['src/core/canvas-font-resolution-scope.ts', 'finally { this.values = previous; }'],
    ]) {
      expect(read(file), file).toContain(needle)
      const changed = (name: string) =>
        name === file ? read(name)!.replace(needle, 'CHANGED') : read(name)
      expect(missingPluginHooks(changed), `${file}: ${needle}`).not.toEqual([])
    }
  })

  function upstreamModule(file: string): Record<string, any> {
    const output = ts.transpileModule(read(file)!, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText
    const exports = {}
    new Function('exports', output)(exports)
    return exports
  }

  it
    .skipIf(!studio)
    .each(['success', 'copy-failed', 'selection', 'document', 'mutation', 'history'])(
    'preserves asynchronous nested-table cut safety: %s',
    async (outcome) => {
      const source = applyPatch('studio-nested-table-cut', read('src/engine/input-handler.ts')!)
      const ast = ts.createSourceFile('input-handler.ts', source, ts.ScriptTarget.Latest, true)
      const handler = ast.statements.find(
        (node): node is ts.ClassDeclaration =>
          ts.isClassDeclaration(node) && node.name?.text === 'InputHandler',
      )!
      const method = handler.members.find(
        (node) => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'cutSelectedObject',
      )!
      const output = ts.transpileModule(`class Cut { ${method.getText(ast)} }`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText
      const { tableObjectClipboardTarget } = upstreamModule(
        'src/engine/table-object-clipboard-target.ts',
      )
      const cut = new Function('tableObjectClipboardTarget', `${output}; return new Cut()`)(
        tableObjectClipboardTarget,
      )
      const ref = {
        sec: 0,
        ppi: 3,
        ci: 1,
        cellPath: [
          { controlIndex: 1, cellIndex: 2, cellParaIndex: 0 },
          { controlIndex: 4, cellIndex: 0, cellParaIndex: 0 },
        ],
      }
      let selection = ref
      let undoTop = {}
      let finishCopy!: (ok: boolean) => void
      const clipboard = new Promise<boolean>((resolve) => {
        finishCopy = resolve
      })
      const deleted: unknown[] = []
      const listeners = new Map<string, () => void>()
      cut.active = true
      cut.editMode = 'edit'
      cut.isFormMode = () => false
      cut.history = { peekUndoTop: () => undoTop }
      cut.cursor = {
        isInPictureObjectSelection: () => false,
        isInTableObjectSelection: () => true,
        getSelectedTableRef: () => selection,
        moveOutOfSelectedTable: () => {},
        getPosition: () => ({ sectionIndex: 0, paragraphIndex: 3, charOffset: 0 }),
      }
      cut.wasm = {
        documentGeneration: 1,
        borrowDocumentHandle: () => 1,
        deleteTableAt: (target: unknown) => deleted.push(target),
      }
      cut.eventBus = {
        on: (event: string, listener: () => void) => {
          listeners.set(event, listener)
          return () => listeners.delete(event)
        },
        emit: () => {},
      }
      cut.copySelectedObject = () => clipboard
      cut.executeOperation = (operation: { kind: string; operation: (wasm: unknown) => void }) => {
        expect(operation.kind).toBe('snapshot')
        operation.operation(cut.wasm)
      }
      const pending = cut.cutSelectedObject()
      expect(deleted).toEqual([])
      if (outcome === 'selection') selection = { ...ref }
      if (outcome === 'document') cut.wasm.documentGeneration++
      if (outcome === 'mutation') listeners.get('document-mutated')!()
      if (outcome === 'history') undoTop = {}
      finishCopy(outcome !== 'copy-failed')
      await pending
      expect(deleted).toEqual(outcome === 'success' ? [ref] : [])
      expect(cut.cancelPendingObjectCut).toBeNull()
      expect(listeners.size).toBe(0)
    },
  )

  it.skipIf(!studio)(
    'preserves upstream memo undo coverage for boundaries, caret memos and nested paths',
    () => {
      const { touchesMemoAnchor } = upstreamModule('src/core/memo.ts')
      const target = { section: 0, para: 3, cellPath: [] }
      const memo = { sectionIndex: 0, paraIndex: 3, startCharIdx: 2, endCharIdx: 5, path: null }
      expect(touchesMemoAnchor([memo], target, 3, 4)).toBe(true)
      expect(touchesMemoAnchor([memo], target, 1, 2)).toBe(true)
      expect(touchesMemoAnchor([memo], target, 5, 6)).toBe(true)
      expect(touchesMemoAnchor([memo], target, 0, 1)).toBe(false)
      expect(touchesMemoAnchor([{ ...memo, endCharIdx: 2 }], target, 1, 3)).toBe(true)
      expect(touchesMemoAnchor([memo], { ...target, para: 4 }, 3, 4)).toBe(false)
      expect(touchesMemoAnchor([memo], { ...target, section: 1 }, 3, 4)).toBe(false)
      expect(touchesMemoAnchor([{ ...memo, startCharIdx: null }], target, 3, 4)).toBe(false)
      const cell = {
        ...memo,
        path: [{ type: 'cell', controlIndex: 1, cellIndex: 2, paraIndex: 0 }],
      }
      expect(touchesMemoAnchor([cell], { ...target, cellPath: [[1, 2, 0]] }, 3, 4)).toBe(true)
      expect(touchesMemoAnchor([cell], { ...target, cellPath: [[1, 3, 0]] }, 3, 4)).toBe(false)
      const box = { ...memo, path: [{ type: 'textbox', controlIndex: 5, paraIndex: 1 }] }
      expect(touchesMemoAnchor([box], { ...target, cellPath: [[5, 0, 1]] }, 3, 4)).toBe(true)
    },
  )

  it.skipIf(!studio)(
    'reuses font resolutions within a paint and refreshes between host scopes and awaits',
    async () => {
      const { CanvasFontResolutionScope } = upstreamModule(
        'src/core/canvas-font-resolution-scope.ts',
      )
      const calls: string[] = []
      let policy = 'A'
      const scope = new CanvasFontResolutionScope((font: string) => {
        calls.push(font)
        return `${policy}:${font}`
      })
      scope.run(() => {
        expect(scope.resolve('font')).toBe('A:font')
        expect(scope.resolve('font')).toBe('A:font')
        policy = 'B'
        scope.run(() => expect(scope.resolve('font')).toBe('B:font'))
        expect(scope.resolve('font')).toBe('A:font')
      })
      scope.run(() => expect(scope.resolve('font')).toBe('B:font'))
      expect(calls).toEqual(['font', 'font', 'font'])
      await scope.run(async () => {
        expect(scope.resolve('font')).toBe('B:font')
        await Promise.resolve()
        policy = 'C'
        expect(scope.resolve('font')).toBe('C:font')
      })
      expect(() =>
        scope.run(() => {
          throw new Error('paint failed')
        }),
      ).toThrow('paint failed')
      policy = 'D'
      expect(scope.resolve('font')).toBe('D:font')
    },
  )
})

describe('rhwp Hangul-key patches', () => {
  it('adapt the shortcut table after its last entry, importing the module', () => {
    const source = [
      'export const defaultShortcuts: [ShortcutDef, string][] = [',
      "  [{ key: 'z', ctrl: true }, 'edit:undo'],",
      "  [{ key: 'p', ctrl: true, shift: true }, 'table:block-product'],",
      '];',
      '',
      'export function matchShortcut() {}',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-shortcuts', source)
    expect(patched).toContain(`import { adaptToHancom } from '${HANCOM_KEYS_MODULE}';`)
    expect(patched.indexOf('adaptToHancom(defaultShortcuts);')).toBeGreaterThan(
      patched.indexOf('];'),
    )
    expect(patched).toContain("  [{ key: 'z', ctrl: true }, 'edit:undo'],")
    expect(patched).toContain('export function matchShortcut() {}')
  })

  it('give the menus the new labels through the command registry', () => {
    const source = [
      "import type { CommandDef } from './types';",
      '',
      'export class CommandRegistry {',
      '  register(def: CommandDef): void {',
      '    this.commands.set(def.id, def);',
      '  }',
      '}',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-labels', source)
    expect(patched).toContain(`import { withHancomLabel } from '${HANCOM_KEYS_MODULE}';`)
    expect(patched).toContain('    this.commands.set(def.id, withHancomLabel(def));')
    expect(patched).not.toContain('this.commands.set(def.id, def);')
  })

  it("register the new commands after the studio's own, in its locale", () => {
    const source = [
      "import { initI18n, t } from '@/i18n/index.ts';",
      'registry.registerAll(pageCommands);',
      'registry.registerAll(toolCommands);',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-commands', source)
    expect(patched).toContain("import { getLocale } from '@/i18n/core.ts';")
    expect(patched).toContain(
      `import { hancomCommands, installHancomMainKeys, installHancomMenuItems } from '${HANCOM_KEYS_MODULE}';`,
    )
    // the studio parts the new commands build on are handed over; the module imports none
    expect(patched).toContain(
      "import { InsertTextCommand, InsertTabCommand } from '@/engine/command';",
    )
    expect(patched).toContain("import { ModalDialog } from '@/ui/dialog';")
    expect(patched).toContain("import { FindDialog, navigateToSearchHit } from '@/ui/find-dialog';")
    expect(patched).toContain("import { CellBorderBgDialog } from '@/ui/cell-border-bg-dialog';")
    expect(patched).toContain("import { showToast } from '@/ui/toast';")
    expect(patched).toContain(
      '  InsertTextCommand, InsertTabCommand, ModalDialog, FindDialog, navigateToSearchHit,\n' +
        '  CellBorderBgDialog, showToast,\n}));',
    )
    expect(patched.indexOf('registry.registerAll(hancomCommands(getLocale(), {')).toBeGreaterThan(
      patched.indexOf('registry.registerAll(toolCommands);'),
    )
    expect(patched).toContain('installHancomMenuItems(document, getLocale());')
    // the main process asks the editor about Ctrl+Shift+S and Ctrl+Shift+H through it
    expect(patched).toContain('installHancomMainKeys(window, () => inputHandler, dispatcher);')
  })

  it('give the bridge the page number calls of engine patch 0014', () => {
    const source = [
      '  applyStyle(sec: number, para: number, styleId: number): { ok: boolean } {',
      '    return { ok: true };',
      '  }',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-page-number', source)
    expect(patched).toContain(
      '  setPageNumberPos(sec: number, format: number, position: number, dash: boolean): string {',
    )
    expect(patched).toContain(
      'return (this.doc as any).setPageNumberPos(sec, format, position, dash);',
    )
    expect(patched).toContain('return (this.doc as any).getPageNumberPos(sec);')
    expect(patched.indexOf('setPageNumberPos(sec')).toBeLessThan(patched.indexOf('  applyStyle('))
  })

  it('give the bridge the one-cell resize call of engine patch 0016', () => {
    const source = [
      '  moveTableOffset(sec: number, parentPara: number, controlIdx: number, deltaH: number, deltaV: number): { ok: boolean; ppi: number; ci: number } {',
      '    return { ok: true, ppi: 0, ci: 0 };',
      '  }',
      '',
    ].join('\n')
    const patched = applyPatch('studio-single-cell-resize', source)
    expect(patched).toContain('  resizeTableCell(')
    expect(patched).toContain(
      'return JSON.parse((this.doc as any).resizeTableCell(sec, parentPara, controlIdx, row, col, vertical, forward));',
    )
    expect(patched.indexOf('resizeTableCell(')).toBeLessThan(patched.indexOf('  moveTableOffset('))
  })

  it('puts a new row below a merged cell after the merge, in both insert paths', () => {
    const source = [
      "import { t } from '../../i18n/index.ts';",
      'function applyTableInsertRowColumn() {',
      '  switch (mode) {',
      "          case 'row-below':",
      '            wasm.insertTableRow(pos.sectionIndex, pos.parentParaIndex!, pos.controlIndex!, cellInfo.row, true);',
      '            break;',
      '  }',
      '}',
      'const commands = [',
      '  {',
      "    id: 'table:insert-row-below',",
      "    label: t('command.table.insertRowBelow.registryLabel'),",
      '    canExecute: inTable,',
      '    execute(services) {',
      '      const ih = services.getInputHandler();',
      '      if (!ih) return;',
      '      const pos = ih.getCursorPosition();',
      '      if (pos.parentParaIndex === undefined || pos.controlIndex === undefined || pos.cellIndex === undefined) return;',
      '      const cellInfo = services.wasm.getCellInfo(pos.sectionIndex, pos.parentParaIndex, pos.controlIndex, pos.cellIndex);',
      '      safeTableOp(() => ih.executeOperation({',
      "        kind: 'snapshot',",
      "        operationType: 'insertTableRow',",
      '        operation: (wasm) => {',
      '          wasm.insertTableRow(pos.sectionIndex, pos.parentParaIndex!, pos.controlIndex!, cellInfo.row, true);',
      '          return pos;',
      '        },',
      "      }), '줄 추가');",
      '    },',
      '  },',
      '];',
      '',
    ].join('\n')
    const patched = applyPatch('studio-merged-row-below', source)
    expect(patched).toContain(`import { insertRowBelow } from '${HANCOM_KEYS_MODULE}';`)
    expect(patched).toContain(
      'const afterRow = cellInfo.row + Math.max(1, cellInfo.rowSpan || 1) - 1 + i;',
    )
    expect(patched).toContain('wasm.mergeTableCells(')
    expect(patched).toContain('      insertRowBelow(services);')
    expect(patched).not.toContain('safeTableOp(() => ih.executeOperation({')
  })

  it('hand the equal-size stubs to the app’s own equalizer', () => {
    const source = [
      "import { t } from '../../i18n/index.ts';",
      '// HWP/HWPX cannot persist independent per-row or per-column geometry. Keep',
      '// commands that require that representation unavailable at command routing.',
      'const localTableGeometryCanPersist = () => false;',
      '',
      '  {',
      "    id: 'table:cell-height-equal',",
      "    label: t('command.table.cellHeightEqual.label'),",
      "    shortcutLabel: 'H',",
      '    canExecute: localTableGeometryCanPersist,',
      '    execute() {},',
      '  },',
      '  {',
      "    id: 'table:cell-width-equal',",
      "    label: t('command.table.cellWidthEqual.label'),",
      "    shortcutLabel: 'W',",
      '    canExecute: localTableGeometryCanPersist,',
      '    execute() {},',
      '  },',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-equal-cells', source)
    expect(patched).toContain(`import { equalizeTableCells } from '${HANCOM_KEYS_MODULE}';`)
    expect(patched).not.toContain('localTableGeometryCanPersist')
    expect(patched).toContain('    canExecute: inTableOrCellSelection,')
    expect(patched).toContain("      equalizeTableCells(services, 'height', getLocale() === 'ko');")
    expect(patched).toContain("      equalizeTableCells(services, 'width', getLocale() === 'ko');")
  })

  it('hand the sequences to the module, the second key first and the IME path too', () => {
    const source = [
      "import { matchShortcut, defaultShortcuts } from '@/command/shortcut-map';",
      'export function onKeyDown(this: any, e: KeyboardEvent): void {',
      '  this._cellBlockLetterImeGuard?.reset();',
      '  if (this._pendingChordK) {}',
      '  if (this.connectorDrawingMode) {',
      '    return;',
      '  }',
      '  if (e.isComposing || e.keyCode === 229) {',
      "    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyM') {",
      '      e.preventDefault();',
      '      this._pendingChordM = true;',
      '      return;',
      '    }',
      '  }',
      '}',
      'export function handleCtrlKey(this: any, e: KeyboardEvent): void {',
      "  if (e.key === '/' && !e.shiftKey && !e.altKey) {",
      '    this.commandPalette?.open();',
      '    return;',
      '  }',
      '  const cmdId = matchShortcut(e, defaultShortcuts);',
      "  if ((e.key === 'k' || e.key === 'K' || e.key === 'ㅏ') && !e.shiftKey && !e.altKey) {",
      '    this._pendingChordK = true;',
      '  }',
      '}',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-chords', source)
    expect(patched).toContain(
      `import { hancomCellBlockKey, hancomCellKey, hancomChordKey, hancomChordStart, hancomContextKey, hancomCtrlKey, hancomTableObjectKey } from '${HANCOM_KEYS_MODULE}';`,
    )
    // the second key is looked at before anything else the handler does
    expect(patched).toContain(
      '  this._cellBlockLetterImeGuard?.reset();\n  if (hancomChordKey(this, e)) return;\n  if (this._pendingChordK)',
    )
    // a table-object key and H/W in a cell block come before the selection is dropped
    expect(patched).toContain(
      '  if (hancomTableObjectKey(this, e)) return;\n' +
        '  if (hancomCellBlockKey(this, e)) return;\n' +
        '  if (hancomCellKey(this, e)) return;\n' +
        '  if (this.connectorDrawingMode) {',
    )
    // the studio no longer starts its own Ctrl+M on the IME path
    expect(patched).not.toContain('this._pendingChordM = true;')
    expect(patched).toContain(
      '  if (e.isComposing || e.keyCode === 229) {\n    if (hancomCtrlKey(this, e)) return;',
    )
    // the keys that depend on the caret come ahead of the studio's shortcut table
    const context = patched.indexOf('  if (hancomContextKey(this, e)) return;')
    expect(context).toBeGreaterThan(patched.indexOf('this.commandPalette?.open();'))
    expect(context).toBeLessThan(
      patched.indexOf('const cmdId = matchShortcut(e, defaultShortcuts);'),
    )
    // and the module comes ahead of the studio's Ctrl+K
    expect(
      patched.indexOf('  if (hancomChordStart(this, e)) return;\n  if ((e.key'),
    ).toBeGreaterThan(patched.indexOf('handleCtrlKey'))
  })

  it('fail when one edit of several is gone', () => {
    const source = "import type { CommandDef } from './types';\n"
    expect(() => applyPatch('studio-hancom-labels', source)).toThrow(/studio-hancom-labels/)
  })

  it('are all in the studio build', () => {
    for (const name of [
      'studio-hancom-shortcuts',
      'studio-hancom-labels',
      'studio-hancom-commands',
      'studio-hancom-chords',
      'studio-hancom-page-number',
    ] as const) {
      expect(STUDIO_PATCHES).toContain(name)
    }
  })
})

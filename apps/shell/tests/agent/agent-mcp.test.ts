/**
 * The app's MCP tools as an agent session gets them (decision 0032): which
 * tools, withheld words read as labels, a withholding deck not edited, no tab
 * closing, and file readers kept to the project folder.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  AGENT_MCP_TOOL_NAMES,
  buildAgentMcpTools,
  withholdingOpenDocuments,
  withholdingSlides,
} from '../../src/main/agent/agent-mcp'
import type { OpenDocumentsControl } from '../../src/main/mcp/tools/open-documents-tools'
import type { SlidesControl } from '../../src/main/mcp/tools/slides-tools'

function slides(overrides: Partial<SlidesControl> = {}): SlidesControl {
  return {
    openBlankTab: async () => 1,
    runTxn: vi.fn(async () => ({ applied: true })),
    readDeck: vi.fn(async (_wc: number, options?: { withhold?: boolean }) => ({
      withhold: options?.withhold,
    })),
    saveDeck: async (_wc, path) => ({ path }),
    ...overrides,
  }
}

function openDocs(content: string): OpenDocumentsControl {
  return {
    list: async () => [],
    read: async () => content,
    close: vi.fn(async () => ({})),
  }
}

const tab = (kind: string) => ({ id: 't1', kind, title: 'x', dirty: false, active: true }) as never

describe('slides for an agent', () => {
  it('reads with withheld words as labels', async () => {
    const control = slides()
    expect(await withholdingSlides(control).readDeck(3)).toEqual({ withhold: true })
  })

  it('edits a deck that withholds nothing', async () => {
    const control = slides({ deckWithholds: async () => false })
    await withholdingSlides(control).runTxn(3, { ops: [] })
    expect(control.runTxn).toHaveBeenCalled()
  })

  it('refuses to edit a deck that withholds something, or one it cannot check', async () => {
    for (const control of [slides({ deckWithholds: async () => true }), slides()]) {
      await expect(withholdingSlides(control).runTxn(3, { ops: [] })).rejects.toThrow(/withholds/)
      expect(control.runTxn).not.toHaveBeenCalled()
    }
  })
})

describe('open documents for an agent', () => {
  it('reads a Markdown document with its withheld span as a label', async () => {
    const control = withholdingOpenDocuments(
      openDocs(
        'Pay: <span class="redact-span" data-redaction="" data-label="salary">5,000</span> won\n',
      ),
    )
    const text = String(await control.read(tab('markdown')))
    expect(text).not.toContain('5,000')
    expect(text).toContain('{{salary}}')
  })

  it('sends a presentation to read_deck and never closes a tab', async () => {
    const inner = openDocs('x')
    const control = withholdingOpenDocuments(inner)
    await expect(control.read(tab('slides'))).rejects.toThrow(/read_deck/)
    await expect(control.close(tab('docs'), { unsaved: 'save' })).rejects.toThrow(/not available/)
    expect(inner.close).not.toHaveBeenCalled()
  })
})

describe('the tool set', () => {
  const tools = buildAgentMcpTools(
    {
      version: '0.0.0',
      defaultSaveDir: () => 'C:\\Out',
      slidesControl: slides(),
      openDocumentsControl: openDocs(''),
      resolveTarget: async () => ({ id: 1 }) as never,
    },
    'C:\\Users\\me\\Project',
    'win32',
  )
  const names = tools.map((tool) => tool.name)

  it('holds only the open-document tools and the two readers', () => {
    for (const name of names) expect(AGENT_MCP_TOOL_NAMES).toContain(name)
    expect(names).toContain('open_documents')
    expect(names).toContain('read_deck')
    expect(names).toContain('read_hwp')
    for (const absent of [
      'create_session',
      'save_session',
      'create_docx',
      'create_pptx',
      'create_xlsx',
      'open_in_genoffice',
    ]) {
      expect(names).not.toContain(absent)
    }
  })

  it('reads Hangul and PDF files only inside the project folder', async () => {
    for (const name of ['read_hwp', 'read_pdf']) {
      const tool = tools.find((t) => t.name === name)!
      expect(() => tool.handler({ path: 'C:\\Users\\me\\Documents\\a.hwp' })).toThrow(
        /project folder/,
      )
      expect(() => tool.handler({ path: 'C:\\Users\\me\\Project-old\\a.hwp' })).toThrow(
        /project folder/,
      )
    }
  })
})

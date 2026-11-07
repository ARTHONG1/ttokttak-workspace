import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateLegacyMcpEntry } from '../src/agent-mcp'

// Releases up to 0.16.2 registered the server as "ieumoffice"; an update moves
// that entry to "ttokttak" and leaves another program's entry alone.
const OLD = '/Applications/HangulAIWorkbench.app/Contents/Resources/cli/ieumoffice'
const NEW = {
  command: '/Applications/HangulAIWorkbench.app/Contents/Resources/cli/ttokttak',
  args: ['mcp'],
}

function config(name: string, text: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'legacy-mcp-')), name)
  writeFileSync(file, text)
  return file
}

describe('migrateLegacyMcpEntry', () => {
  it("moves this app's JSON entry to the current name and keeps other servers", () => {
    const file = config(
      'mcp.json',
      JSON.stringify({
        mcpServers: {
          ieumoffice: { type: 'stdio', command: OLD, args: ['mcp'] },
          other: { command: 'x' },
        },
      }),
    )
    expect(migrateLegacyMcpEntry('cursor', file, NEW)).toBe(true)
    const servers = JSON.parse(readFileSync(file, 'utf-8')).mcpServers
    expect(Object.keys(servers).sort()).toEqual(['other', 'ttokttak'])
    expect(servers.ttokttak.command).toBe(NEW.command)
  })

  it("leaves an entry that starts the base project's own app", () => {
    const theirs = '/Applications/IeumOffice.app/Contents/Resources/cli/ieumoffice'
    const text = JSON.stringify({ mcpServers: { ieumoffice: { command: theirs, args: ['mcp'] } } })
    const file = config('settings.json', text)
    expect(migrateLegacyMcpEntry('gemini', file, NEW)).toBe(false)
    expect(readFileSync(file, 'utf-8')).toBe(text)
  })

  it('moves the Codex TOML table with its env sub-table', () => {
    const file = config(
      'config.toml',
      `model = "x"\n\n[mcp_servers.ieumoffice]\ncommand = "${OLD}"\nargs = ["mcp"]\n\n[mcp_servers.ieumoffice.env]\nA = "1"\n`,
    )
    expect(migrateLegacyMcpEntry('codex', file, NEW)).toBe(true)
    const text = readFileSync(file, 'utf-8')
    expect(text).not.toContain('ieumoffice')
    expect(text).toContain('[mcp_servers.ttokttak]')
    expect(text).toContain('model = "x"')
  })
})

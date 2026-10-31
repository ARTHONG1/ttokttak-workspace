import { basename } from 'node:path'
import { flagString } from '../args'
import { HWP_PREVIEW_CHARS, hwpText } from '../formats/hwp'
import { extension, readInput, resolveInput } from '../fs'
import { cutIndex, previewChars } from '../preview'
import type { CommandContext, CommandDef } from '../registry'
import { CliError, EXIT, type CommandResult } from '../result'

export const hwpCommand: CommandDef = {
  name: 'hwp',
  summary: 'Read the text of a Hangul (HWP / HWPX) document, without any app process.',
  usage: 'hwp read <file.hwp|file.hwpx> [--offset n] [--full | --max-chars n]',
  options: [
    {
      name: 'offset',
      value: 'n',
      description: 'read: start character (default 0)',
    },
    {
      name: 'full',
      description: 'read: the whole text, unclipped',
    },
    {
      name: 'max-chars',
      value: 'n',
      description: `read: characters to return (default ${HWP_PREVIEW_CHARS})`,
    },
  ],
  async run(args, ctx) {
    const [verb, file] = args.positionals
    if (verb !== 'read') {
      throw new CliError(EXIT.usage, 'expected "hwp read <file.hwp|file.hwpx>"', undefined, {
        reason: verb === undefined ? 'missing_argument' : 'invalid_argument',
        suggestion: 'run `ieumoffice help hwp`',
      })
    }
    return read(file, args, ctx)
  },
}

type Args = Parameters<CommandDef['run']>[0]

async function read(
  file: string | undefined,
  args: Args,
  ctx: CommandContext,
): Promise<CommandResult> {
  const path = resolveInput(file, ctx)
  const ext = extension(path)
  if (ext !== 'hwp' && ext !== 'hwpx') {
    throw new CliError(EXIT.usage, `not an HWP or HWPX document: ${path}`, undefined, {
      reason: 'unsupported',
      suggestion: 'use docs read, sheet read, slides read or pdf read for other formats',
    })
  }
  const offset = parseOffset(flagString(args, 'offset'))
  const max = previewChars(args, HWP_PREVIEW_CHARS)
  let text: string
  try {
    text = await hwpText(readInput(path))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new CliError(EXIT.file, message, undefined, { reason: 'unsupported' })
  }
  if (offset > text.length) {
    throw new CliError(
      EXIT.usage,
      `--offset ${offset} is past the end of the text (${text.length} characters)`,
      { valid_range: [0, text.length] },
      { reason: 'out_of_range' },
    )
  }
  const end = Math.min(text.length, cutIndex(text, offset, offset + max))
  const detail: Record<string, unknown> = {
    format: ext,
    chars: text.length,
    offset,
    text: text.slice(offset, end),
  }
  if (end < text.length) {
    detail.truncated = `characters ${end}-${text.length} not read; pass --offset ${end} for the next part, or --full for everything`
    detail.next_offset = end
  }
  const part = offset > 0 || end < text.length ? `, read ${offset}-${end}` : ''
  return { summary: `${basename(path)}: ${text.length} characters${part}`, detail }
}

function parseOffset(raw: string | undefined): number {
  if (raw === undefined) return 0
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) {
    throw new CliError(
      EXIT.usage,
      `--offset must be a non-negative integer (got ${raw})`,
      undefined,
      {
        reason: 'invalid_argument',
      },
    )
  }
  return n
}

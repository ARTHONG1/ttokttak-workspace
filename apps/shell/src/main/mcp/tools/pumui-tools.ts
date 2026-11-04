/**
 * AI agent tools for K-에듀파인 품의: the agent prepares a 품의 and 똑딱작업실 holds it for
 * the 똑딱 에듀파인 연결 extension. Nothing leaves this PC here and nothing is filled in by
 * the agent: the teacher takes the 품의 on the K-에듀파인 품의등록 screen and saves it.
 */
import { buildPumuiPackage } from '@genoffice/edufine-link/package'
import { z } from 'zod'
import type { McpToolDefinition } from '../mcp-server'
import type { PumuiOutbox } from '../../pumui-outbox'

const TAKE =
  'On the K-에듀파인 품의등록 screen the teacher presses [똑딱], sees the waiting 품의 at once and fills it with [K-에듀파인에 채우기]; saving and approval stay with the teacher.'

export function createPumuiTools(
  outbox: Pick<PumuiOutbox, 'enqueue' | 'size'>,
): McpToolDefinition[] {
  return [
    {
      name: 'pumui_send',
      description:
        'Prepare a school purchase request (품의) for K-에듀파인: title (5+ characters), summary (the 기안문 text) and item rows. Each row amount is computed as quantity × unit price and the total from the rows. The 품의 is checked and held in GenOffice for 30 minutes; nothing is sent anywhere and nothing is filled in by this tool. ' +
        TAKE +
        ' Use K-에듀파인 unit names such as 개, SET, 상자, 식, 명, 권, 매, 롤.',
      inputSchema: {
        title: z.string().min(5).max(200),
        summary: z.string().max(20_000).default(''),
        items: z
          .array(
            z.object({
              description: z.string().min(1).max(500),
              specification: z.string().max(500).default(''),
              unit: z.string().min(1).max(20),
              quantity: z.number().finite(),
              unitPrice: z.number().finite(),
            }),
          )
          .min(1)
          .max(200),
      },
      handler: (args) => {
        const items = (
          args.items as {
            description: string
            specification?: string
            unit: string
            quantity: number
            unitPrice: number
          }[]
        ).map((i) => ({
          description: i.description,
          specification: i.specification ?? '',
          unit: i.unit,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          amount: Math.round(i.quantity * i.unitPrice),
        }))
        const pkg = buildPumuiPackage({
          title: String(args.title ?? ''),
          summary: String(args.summary ?? ''),
          items,
        })
        const held = outbox.enqueue(JSON.stringify(pkg))
        if (!held.ok) throw new Error(held.reason)
        return {
          held: true,
          title: pkg.title,
          items: pkg.items.length,
          total: pkg.total,
          next: TAKE,
        }
      },
    },
    {
      name: 'pumui_status',
      description:
        'How many 품의 GenOffice holds for the K-에듀파인 extension right now (each is held for 30 minutes, at most five).',
      handler: () => ({ waiting: outbox.size() }),
    },
  ]
}

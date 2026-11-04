/**
 * What the 똑딱 button opens on a site: the task with work waiting (the latest when several
 * have some), else the site's only task, else the list of its tasks.
 */
import type { FeatureInfo } from './feature'

export type HomeChoice = { kind: 'open'; id: string } | { kind: 'list'; ids: string[] }

/** waiting: when each task's waiting work arrived, by task id */
export function homeChoice(
  features: readonly FeatureInfo[],
  waiting: Readonly<Record<string, number>>,
): HomeChoice {
  let latest: { id: string; at: number } | null = null
  for (const f of features) {
    const at = waiting[f.id]
    if (typeof at === 'number' && (!latest || at > latest.at)) latest = { id: f.id, at }
  }
  if (latest) return { kind: 'open', id: latest.id }
  if (features.length === 1) return { kind: 'open', id: features[0].id }
  return { kind: 'list', ids: features.map((f) => f.id) }
}

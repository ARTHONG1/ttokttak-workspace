import type { Lang } from '@genoffice/i18n'

/**
 * The web edition (program/web) offers two models instead of the provider catalog:
 * 기본형 (basic) and 고급형 (advanced). The server holds the same line in
 * web/runtime/vertex-auth.cjs and refuses any other model, so this list only decides
 * what the screens show. The frame bootstrap (web/runtime/client/frame.js) marks every
 * page with data-edition="web" and, when the server has opened the advanced tier,
 * data-web-advanced="1".
 */
export const WEB_BASIC_MODEL = 'gemini-3.5-flash-lite'
export const WEB_ADVANCED_MODEL = 'gemini-4-argon'

export type WebAiTierId = 'basic' | 'advanced'

export interface WebAiTier {
  readonly id: WebAiTierId
  readonly model: string
  /** shown, but not pickable until the server opens it */
  readonly locked: boolean
}

function edition(): DOMStringMap | null {
  return typeof document === 'undefined' ? null : document.documentElement.dataset
}

/** the two tiers on the web edition; null on the desktop app */
export function webAiTiers(): readonly WebAiTier[] | null {
  const data = edition()
  if (!data || data.edition !== 'web') return null
  return [
    { id: 'basic', model: WEB_BASIC_MODEL, locked: false },
    { id: 'advanced', model: WEB_ADVANCED_MODEL, locked: data.webAdvanced !== '1' },
  ]
}

const LABELS: Partial<Record<Lang, Record<WebAiTierId | 'locked', string>>> = {
  ko: { basic: '기본형', advanced: '고급형', locked: '준비 중' },
  en: { basic: 'Basic', advanced: 'Advanced', locked: 'Coming soon' },
}

export function webAiTierText(lang: Lang, key: WebAiTierId | 'locked'): string {
  return (LABELS[lang] ?? LABELS.en)![key]
}

/** the tier a stored model belongs to, when it is one of the two */
export function webAiTierOf(tiers: readonly WebAiTier[], model: string): WebAiTier | undefined {
  return tiers.find((tier) => tier.model === model.trim())
}

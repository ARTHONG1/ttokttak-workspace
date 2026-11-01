export const INTRO_LINKS = {
  'intro-class': 'https://classddok.com',
  'intro-project': 'https://github.com/ARTHONG1/ttokttak-workspace',
  'intro-install': 'https://github.com/ARTHONG1/ttokttak-workspace#ai-에이전트로-설치하기',
  'intro-guide': 'https://github.com/ARTHONG1/ttokttak-workspace/blob/main/INSTALL.md',
  'intro-office': 'https://github.com/pblsketch/openoffice',
  'intro-rhwp': 'https://github.com/edwardkim/rhwp',
  'intro-univer': 'https://github.com/dream-num/univer',
  'intro-tiptap': 'https://github.com/ueberdosis/tiptap',
  'intro-pdf': 'https://github.com/mozilla/pdf.js',
  'intro-electron': 'https://github.com/electron/electron',
} as const
export type IntroLinkKey = keyof typeof INTRO_LINKS
export function introLinkKey(url: string): IntroLinkKey | null {
  return (Object.entries(INTRO_LINKS).find(([, value]) => value === url)?.[0] as IntroLinkKey | undefined) ?? null
}
export function isIntroLinkKey(value: unknown): value is IntroLinkKey {
  return typeof value === 'string' && Object.hasOwn(INTRO_LINKS, value)
}

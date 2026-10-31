import { useCallback, useState } from 'react'

import type { FontFamilyInfoMap } from '@genoffice/ui'
import { TEMPLATE_FONT_FAMILY_NAMES } from '@genoffice/ui/template-fonts'

interface SystemFonts {
  readonly families: readonly string[]
  /** Korean name / Hangul coverage per family; empty until the main process answers */
  readonly info: FontFamilyInfoMap
}

const NONE: SystemFonts = { families: [], info: new Map() }

let cached: SystemFonts | null = null
let pending: Promise<SystemFonts> | null = null

async function queryFamilies(): Promise<readonly string[]> {
  const query = (window as { queryLocalFonts?: () => Promise<{ readonly family: string }[]> })
    .queryLocalFonts
  if (!query) return []
  try {
    const fonts = await query.call(window)
    const families = new Set<string>()
    for (const font of fonts) if (font.family) families.add(font.family)
    return [...families].sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

/// The families to ask the main process about: the enumeration plus the bundled
/// template families, which it cannot see but the main process reads from their
/// folder (Hangul coverage routes a Pretendard pick to the East Asian slot too).
export function familiesForInfo(families: readonly string[]): readonly string[] {
  const listed = new Set(families)
  return [...families, ...TEMPLATE_FONT_FAMILY_NAMES.filter((f) => !listed.has(f))]
}

/// The enumeration names every family in English only, so the main process
/// reads the Korean names from the font files; without them the list still works.
async function queryInfo(families: readonly string[]): Promise<FontFamilyInfoMap> {
  try {
    return new Map(await window.desktop.fontFamilyInfo(familiesForInfo(families)))
  } catch {
    return NONE.info
  }
}

function loadSystemFonts(): Promise<SystemFonts> {
  if (cached) return Promise.resolve(cached)
  pending ??= queryFamilies().then(async (families) => {
    cached = { families, info: await queryInfo(families) }
    return cached
  })
  return pending
}

/// Empty until load() runs — call it from the picker's open click so the
/// Local Font Access API sees user activation; cached for the page lifetime,
/// and on failure the pickers just keep the built-in list. Returns every
/// family: the pickers dedupe the candidate names where the two sections
/// merge (docs keeps every candidate visible, so it never partitions).
export function useSystemFontFamilies(): SystemFonts & { readonly load: () => void } {
  const [fonts, setFonts] = useState<SystemFonts>(cached ?? NONE)
  const load = useCallback(() => {
    void loadSystemFonts().then(setFonts)
  }, [])
  return { families: fonts.families, info: fonts.info, load }
}

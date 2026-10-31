import { useCallback, useState } from 'react'

import { partitionFontFamilies, type FontFamilyInfoMap } from '@genoffice/ui'
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

/// The enumeration names every family in English only, so the main process
/// reads the Korean names from the font files; without them the list still works.
async function queryInfo(families: readonly string[]): Promise<FontFamilyInfoMap> {
  if (families.length === 0) return NONE.info
  try {
    return new Map(await window.slidesApi.fontFamilyInfo(families))
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

/// The picker's sections: the bundled template fonts count as present although
/// the OS enumeration cannot see them (the main process serves their files).
export function pickerFontSections(
  candidates: readonly string[],
  systemFamilies: readonly string[],
): ReturnType<typeof partitionFontFamilies> {
  return partitionFontFamilies(candidates, systemFamilies, TEMPLATE_FONT_FAMILY_NAMES)
}

/// Empty until load() runs — call it from the picker's open click so the
/// Local Font Access API sees user activation; cached for the page lifetime,
/// and on failure the picker just keeps the built-in list. Returns every
/// family: candidates vs system section is decided per render by
/// partitionFontFamilies (which also hides candidates the machine lacks).
export function useSystemFontFamilies(): SystemFonts & { readonly load: () => void } {
  const [fonts, setFonts] = useState<SystemFonts>(cached ?? NONE)
  const load = useCallback(() => {
    void loadSystemFonts().then(setFonts)
  }, [])
  return { families: fonts.families, info: fonts.info, load }
}

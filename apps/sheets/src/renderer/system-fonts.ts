import { useCallback, useState } from 'react'

import {
  BUILTIN_FONT_FAMILIES,
  partitionFontFamilies,
  splitHangulFamilies,
  type FontFamilyInfoMap,
} from '@genoffice/ui'
import { TEMPLATE_FONT_FAMILY_NAMES } from '@genoffice/ui/template-fonts'

/** Suite-wide font dropdown candidates, kept under the historical sheets-side name. */
export const DEFAULT_FONT_FAMILIES: readonly string[] = BUILTIN_FONT_FAMILIES

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
    return new Map(await window.desktopApi.fontFamilyInfo(families))
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
/// and on failure the pickers just keep the default list. Returns every
/// family: candidates vs system section is decided per render by
/// partitionFontFamilies (which also hides candidates the machine lacks).
export function useSystemFontFamilies(): SystemFonts & { readonly load: () => void } {
  const [fonts, setFonts] = useState<SystemFonts>(cached ?? NONE)
  const load = useCallback(() => {
    void loadSystemFonts().then(setFonts)
  }, [])
  return { families: fonts.families, info: fonts.info, load }
}

/// The echoed value stays listed even when uninstalled (document echo). The
/// bundled template families stay listed too: the OS enumeration cannot see
/// them, yet template-fonts.ts registers them for the grid. With
/// `hangulInfo` (the Korean UI passes it) the installed Korean fonts are split
/// out of the system section so they can be listed right below the common ones.
export function fontFamilyGroups(
  systemFamilies: readonly string[],
  echoFamily: string | null | undefined,
  hangulInfo?: FontFamilyInfoMap,
): {
  readonly common: readonly string[]
  readonly hangul: readonly string[]
  readonly system: readonly string[]
} {
  const { builtin, system } = partitionFontFamilies(
    DEFAULT_FONT_FAMILIES,
    systemFamilies,
    TEMPLATE_FONT_FAMILY_NAMES,
  )
  const known = !echoFamily || builtin.includes(echoFamily) || systemFamilies.includes(echoFamily)
  const { hangul, other } = splitHangulFamilies(system, hangulInfo)
  return {
    common: known ? builtin : [echoFamily, ...builtin],
    hangul,
    system: other,
  }
}

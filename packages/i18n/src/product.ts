/**
 * Product identity: the ONE place the user-visible product name, the names
 * derived from it, and the public repository are defined.
 *
 * This product is based on the open-source GenOffice. Its dictionaries, help
 * topics and source keep writing "GenOffice" wherever the product names itself
 * (so they stay mergeable with upstream), and that name is swapped for the
 * product name at the point a string is produced: createI18n does it for every
 * translated string, brandText() for any other text shown to the user.
 *
 * To print the literal upstream name — the "based on GenOffice" acknowledgement —
 * write UPSTREAM_NAME_LITERAL, i.e. `{{GenOffice}}`, in the string.
 */

/** The upstream project this product is based on; also the token dictionaries use for the product name. */
export const UPSTREAM_PRODUCT_NAME = 'GenOffice'

/** Escape for a literal upstream name: brandText() turns `{{GenOffice}}` into `GenOffice`. */
export const UPSTREAM_NAME_LITERAL = `{{${UPSTREAM_PRODUCT_NAME}}}`

/**
 * The product name in every language without a localized one. Also the name
 * everything registered on the user's machine derives from (the installer's
 * productName, the userData folder, the default save folder), which must stay
 * the same whatever the UI language is.
 */
export const PRODUCT_NAME = 'HangulAIWorkbench'

/** Languages that show a localized product name instead of PRODUCT_NAME. */
const LOCALIZED_PRODUCT_NAMES: Readonly<Record<string, string>> = {
  ko: '똑딱작업실',
}

/** The product name as shown in a UI language (a Lang or a raw locale tag). */
export function productName(lang: string | null | undefined): string {
  const base = lang?.trim().toLowerCase().split(/[-_]/)[0] ?? ''
  return Object.hasOwn(LOCALIZED_PRODUCT_NAMES, base)
    ? LOCALIZED_PRODUCT_NAMES[base]!
    : PRODUCT_NAME
}

/** Electron userData folder name of the installed app (under the per-user app-data root). */
export const USER_DATA_DIR_NAME = PRODUCT_NAME

/** userData folder name of an unpacked (development) run, kept apart from the installed app's. */
export const DEV_USER_DATA_DIR_NAME = `${PRODUCT_NAME}-Dev`

/** The product's public GitHub repository: issues, releases and update checks all point here. */
export const PRODUCT_REPO_OWNER = 'ARTHONG1'
export const PRODUCT_REPO_NAME = 'ttokttak-studio'
/** `owner/repo`; the URLs built from it live in @genoffice/electron-utils (github-menu.ts) */
export const PRODUCT_REPO_SLUG = `${PRODUCT_REPO_OWNER}/${PRODUCT_REPO_NAME}`

/** The product's home page: the repository, whose README carries the step-by-step help. */
export const PRODUCT_WEBSITE = `https://github.com/${PRODUCT_REPO_SLUG}`

/**
 * Where rights holders and users reach the maintainer about trademarks, copyright and
 * licensing: the repository's issue tracker (no personal mail address is published).
 */
export const PRODUCT_CONTACT_URL = `https://github.com/${PRODUCT_REPO_SLUG}/issues`

const NAME_TOKEN = new RegExp(`\\{\\{${UPSTREAM_PRODUCT_NAME}\\}\\}|${UPSTREAM_PRODUCT_NAME}`, 'g')

/** the name sits inside a longer identifier (GenOfficeFormField): not the product name */
function insideIdentifier(before: string, after: string): boolean {
  return /[A-Za-z0-9_]/.test(before) || /^[A-Za-z0-9]/.test(after)
}

/** the name is part of a file or folder name (GenOffice.exe, Documents/GenOffice, GenOffice-<v>.dmg) */
function insideFileName(before: string, after: string): boolean {
  return /[\\/]/.test(before) || /^(?:[\\/]|[-_][A-Za-z0-9<]|\.[A-Za-z0-9])/.test(after)
}

/**
 * Rewrite the product name in a UI string for a language: "GenOffice" becomes
 * productName(lang), except inside file and folder names, which carry
 * PRODUCT_NAME in every language. `{{GenOffice}}` prints the literal upstream
 * name. Text that does not mention the name is returned as is.
 */
export function brandText(text: string, lang: string | null | undefined): string {
  if (!text.includes(UPSTREAM_PRODUCT_NAME)) return text
  const localized = productName(lang)
  const branded = text.replace(NAME_TOKEN, (match: string, offset: number) => {
    if (match !== UPSTREAM_PRODUCT_NAME) return UPSTREAM_PRODUCT_NAME
    const before = text.charAt(offset - 1)
    const after = text.slice(offset + match.length, offset + match.length + 2)
    if (insideIdentifier(before, after)) return match
    return insideFileName(before, after) ? PRODUCT_NAME : localized
  })
  return fixKoreanParticles(branded, localized)
}

/**
 * Korean dictionaries attach particles to "GenOffice" as if the name ended in a
 * vowel (GenOffice가/는/를/와). A localized name ending in a final consonant
 * takes the other form (똑딱작업실이/은/을/과); 로 already suits a final ㄹ.
 */
function fixKoreanParticles(text: string, name: string): string {
  const last = name.charCodeAt(name.length - 1)
  if (last < 0xac00 || last > 0xd7a3 || (last - 0xac00) % 28 === 0) return text
  const swap: Record<string, string> = { 가: '이', 는: '은', 를: '을', 와: '과' }
  return text.split(name).reduce((out, part, i) => {
    if (i === 0) return part
    const first = part.charAt(0)
    return out + name + (swap[first] ? swap[first] + part.slice(1) : part)
  })
}

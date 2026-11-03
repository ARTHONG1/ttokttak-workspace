/**
 * What the teacher types as the K-에듀파인 address, turned into the origin the extension
 * asks permission for. Only https *.go.kr hosts pass (127.0.0.1 too in the test build).
 */
export function originFrom(input: string, allowLocal = false): string | null {
  const raw = input.trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw)
  } catch {
    return null
  }
  if (url.protocol === 'https:' && url.hostname.endsWith('.go.kr')) return url.origin
  if (allowLocal && url.hostname === '127.0.0.1') return url.protocol + '//' + url.hostname
  return null
}

/**
 * Whether the launch and periodic background update checks run. Off unless the
 * user turned them on in Settings → About: updating is the user's call, made
 * with "업데이트 확인" (Settings → About, or the menu), never a window that
 * opens by itself.
 */
export function backgroundChecksOn(saved: unknown): boolean {
  return saved === true
}

/**
 * Whether this run checks the project's GitHub releases for updates. Windows installs
 * update through NSIS and latest.yml from ARTHONG1/ttokttak-workspace, which is how a
 * fixed 똑딱작업실 extension host or 품의 screen reaches a school PC without reinstalling.
 * macOS updates through latest-mac.yml and the release zip, swapped in by
 * mac-self-update.ts (Squirrel would need a Developer ID signature). Linux AppImage
 * stays off until a signed release exists; HANGUL_WORKBENCH_UPDATE_FEED=1 turns it on
 * for testing.
 */
export function updatesAllowed(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  isPackaged: boolean,
): boolean {
  if (!isPackaged) return false
  if (platform === 'win32' || platform === 'darwin') return true
  const asked = env.HANGUL_WORKBENCH_UPDATE_FEED === '1'
  if (platform === 'linux') return asked && Boolean(env.APPIMAGE)
  return false
}

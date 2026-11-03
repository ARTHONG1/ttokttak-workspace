/**
 * Whether this run checks the project's GitHub releases for updates. Windows installs
 * update through NSIS and latest.yml from ARTHONG1/ttokttak-workspace, which is how a
 * fixed 똑딱 에듀파인 연결 host or 품의 screen reaches a school PC without reinstalling.
 * macOS (Squirrel needs a signed, notarized app) and Linux AppImage stay off until a
 * signed release exists; HANGUL_WORKBENCH_UPDATE_FEED=1 turns them on for testing.
 */
export function updatesAllowed(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, isPackaged: boolean): boolean {
  if (!isPackaged) return false
  if (platform === 'win32') return true
  const asked = env.HANGUL_WORKBENCH_UPDATE_FEED === '1'
  if (platform === 'darwin') return asked
  if (platform === 'linux') return asked && Boolean(env.APPIMAGE)
  return false
}


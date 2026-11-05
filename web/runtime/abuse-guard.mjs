/**
 * Keeps the anonymous web edition usable for everyone. Each work space runs a whole
 * desktop process (300–500 MB), so the abuse that matters is opening many of them: one
 * address, or the world, filling the instance until nobody else gets in. This guard
 * decides when a browser asks for a new work space; it never looks at documents or AI
 * requests, and a work space that is already open (a reload) always gets back in.
 *
 * - at most `maxSessions` work spaces in all, and `maxPerIp` from one address; when full,
 *   the one idle longest (its tab closed, still waiting out its idle time) makes room;
 * - at most `newPerIp` new work spaces from one address per `windowMs`; going past it
 *   is a strike, and `strikes` strikes within the window block the address for `banMs`.
 *
 * Schools share one address among many teachers, so the limits are wide.
 */

const num = (value, fallback) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function guardOptionsFromEnv(env = process.env) {
  return {
    maxSessions: num(env.WEB_MAX_SESSIONS, 16),
    maxPerIp: num(env.WEB_MAX_SESSIONS_PER_IP, 10),
    newPerIp: num(env.WEB_NEW_SESSIONS_PER_IP, 30),
    windowMs: num(env.WEB_NEW_SESSIONS_WINDOW_MS, 10 * 60_000),
    strikes: num(env.WEB_BAN_STRIKES, 5),
    banMs: num(env.WEB_BAN_MS, 30 * 60_000),
  }
}

/**
 * The address a request comes from. Cloud Run's front end appends the caller's address to
 * X-Forwarded-For, so the last entry is the one a client cannot forge; without the header
 * (a local run) it is the socket's.
 */
export function clientIp(req) {
  const xff = String((req.headers && req.headers['x-forwarded-for']) || '')
  const last = xff
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .pop()
  return last || (req.socket && req.socket.remoteAddress) || 'unknown'
}

/** what the browser shows when a work space is refused */
export const REFUSALS = {
  banned: {
    title: '잠시 이용이 제한됐어요',
    detail:
      '짧은 시간에 작업 공간을 너무 많이 열어 이 연결을 30분 동안 막았어요. 잠시 뒤 다시 와 주세요.',
  },
  'too-fast': {
    title: '조금 천천히 열어 주세요',
    detail: '짧은 시간에 작업 공간을 너무 많이 열었어요. 몇 분 뒤 다시 해 주세요.',
  },
  'ip-full': {
    title: '이 연결에서 더 열 수 없어요',
    detail:
      '같은 인터넷 연결에서 동시에 열 수 있는 작업 공간을 모두 쓰고 있어요. 쓰지 않는 탭을 닫고 다시 해 주세요.',
  },
  'server-full': {
    title: '지금 사용하는 분이 많아요',
    detail: '잠시 뒤 다시 해 주세요. PC에 설치하는 똑딱작업실은 기다리지 않고 쓸 수 있어요.',
  },
}

export function createSessionGuard(options = guardOptionsFromEnv()) {
  const opened = new Map() // ip -> times new work spaces were opened
  const strikes = new Map() // ip -> times it went too fast
  const bans = new Map() // ip -> blocked until

  const recent = (map, ip, now) => {
    const list = (map.get(ip) || []).filter((t) => now - t < options.windowMs)
    if (list.length) map.set(ip, list)
    else map.delete(ip)
    return list
  }

  function bannedUntil(ip, now = Date.now()) {
    const until = bans.get(ip) || 0
    if (until <= now) {
      bans.delete(ip)
      return 0
    }
    return until
  }

  /**
   * May `ip` open work space `sid`? `live` lists the running ones: { sid, ip, idleSince }
   * (idleSince: when its tab went away, or null while one is attached).
   * → { ok: true, evict: sid[] } or { ok: false, reason }
   */
  function admit({ ip, sid, live }, now = Date.now()) {
    if (live.some((s) => s.sid === sid)) return { ok: true, evict: [] }
    if (bannedUntil(ip, now)) return { ok: false, reason: 'banned' }
    if (recent(opened, ip, now).length >= options.newPerIp) {
      const count = recent(strikes, ip, now).length + 1
      strikes.set(ip, [...recent(strikes, ip, now), now])
      if (count >= options.strikes) {
        bans.set(ip, now + options.banMs)
        strikes.delete(ip)
        return { ok: false, reason: 'banned' }
      }
      return { ok: false, reason: 'too-fast' }
    }
    const idleFirst = (list) =>
      list.filter((s) => s.idleSince != null).sort((a, b) => a.idleSince - b.idleSince)
    const evict = []
    let running = live
    const mine = running.filter((s) => s.ip === ip)
    if (mine.length >= options.maxPerIp) {
      const spare = idleFirst(mine)[0]
      if (!spare) return { ok: false, reason: 'ip-full' }
      evict.push(spare.sid)
      running = running.filter((s) => s.sid !== spare.sid)
    }
    if (running.length >= options.maxSessions) {
      const spare = idleFirst(running)[0]
      if (!spare) return { ok: false, reason: 'server-full' }
      evict.push(spare.sid)
    }
    opened.set(ip, [...recent(opened, ip, now), now])
    return { ok: true, evict }
  }

  return { admit, bannedUntil }
}

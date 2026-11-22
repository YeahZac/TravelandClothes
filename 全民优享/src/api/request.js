/**
 * CMS 请求：
 * - 微信小程序：优先云托管 callContainer（同袍会 env + test-sever）
 * - 其它端 / 失败回退：HTTPS CMS_BASE
 *
 * 优化：
 * - GET 同路径 in-flight 合并（多模块 onShow 不打重复请求）
 * - 短期内存 TTL + stale-while-revalidate（过期窗口内先回缓存再后台刷新）
 * - callContainer 失败才回退 HTTPS；热点 GET 优先 HTTPS
 */
/** HTTPS 回退基址（callContainer 失败时用）；已绑自定义域 yx.linyio.com */
export const CMS_BASE = 'https://yx.linyio.com'
export const USE_REMOTE = true

/** 同袍会云托管（与 utils/config.js 一致） */
export const CLOUD_ENV_ID = 'prod-d7gnz9s0j20275c05'
export const CLOUD_SERVICE = 'test-sever'

const TOKEN_KEY = 'qmyx_auth_token'

/** @type {Map<string, Promise<any>>} */
const inflight = new Map()
/** @type {Map<string, { at: number, ttl: number, data: any }>} */
const memCache = new Map()

/** 常见只读接口默认缓存（毫秒）；写操作 / 显式 noCache 跳过 */
const DEFAULT_GET_TTL = {
  '/api/traffic/v1/meta': 90 * 1000,
  '/api/traffic/v1/bootstrap': 45 * 1000,
  '/api/traffic/v1/festival/tickets': 60 * 1000,
  '/api/traffic/v1/gifts': 45 * 1000,
  '/api/traffic/v1/catalog': 45 * 1000,
  '/api/traffic/v1/me': 30 * 1000,
  '/api/traffic/v1/me/cart': 15 * 1000,
  '/api/traffic/v1/me/orders': 25 * 1000,
  '/api/traffic/v1/lottery/rules': 90 * 1000,
  '/api/traffic/v1/lottery/history': 45 * 1000,
  '/api/traffic/v1/festival/verify/access': 30 * 1000,
  '/api/traffic/v1/flash/current': 3 * 1000,
  '/api/traffic/v1/flash/history': 20 * 1000,
  '/api/traffic/v1/checkin/status': 15 * 1000,
  '/api/traffic/v1/steps/status': 15 * 1000,
  '/api/traffic/v1/steps/history': 60 * 1000,
  '/api/traffic/v1/activity/feed': 30 * 1000,
  '/api/traffic/v1/articles/notices': 45 * 1000,
  '/api/traffic/v1/tasks/today': 20 * 1000,
  '/api/traffic/v1/friends': 25 * 1000,
  '/api/traffic/v1/jar/state': 20 * 1000,
  '/api/traffic/v1/jar/feed': 20 * 1000,
  '/api/traffic/v1/invite/summary': 60 * 1000,
  '/api/traffic/v1/invite/qrcode': 120 * 1000,
  '/api/traffic/v1/legal': 120 * 1000,
}

export function getToken() {
  try {
    return uni.getStorageSync(TOKEN_KEY) || ''
  } catch (e) {
    return ''
  }
}

export function setToken(token) {
  try {
    if (token) uni.setStorageSync(TOKEN_KEY, token)
    else uni.removeStorageSync(TOKEN_KEY)
  } catch (e) {}
  // 登录态变化后清用户相关缓存
  invalidateRequestCache('/api/traffic/v1/me')
  invalidateRequestCache('/api/traffic/v1/festival/')
  invalidateRequestCache('/api/traffic/v1/me/')
}

function authHeader(extra = {}) {
  const header = {
    'Content-Type': 'application/json',
    ...extra,
  }
  const token = getToken()
  if (token) header.Authorization = `Bearer ${token}`
  return header
}

function pathOnly(path) {
  return String(path || '').split('?')[0]
}

function cacheKey(method, path) {
  return `${method} ${path}`
}

function resolveTtl(path, options = {}) {
  if (options.noCache) return 0
  if (options.cacheTtl != null) return Math.max(0, Number(options.cacheTtl) || 0)
  const base = pathOnly(path)
  return DEFAULT_GET_TTL[base] || 0
}

function peekMem(key) {
  const hit = memCache.get(key)
  if (!hit) return null
  return {
    data: hit.data,
    at: hit.at,
    ttl: hit.ttl,
    freshTtl: hit.freshTtl || hit.ttl,
    age: Date.now() - hit.at,
  }
}

function writeMem(key, data, ttl) {
  if (!ttl || data == null) return
  // 存 3×ttl 作 stale 窗口；fresh 判定仍用 ttl
  memCache.set(key, { at: Date.now(), ttl: Math.max(ttl, ttl * 3), freshTtl: ttl, data })
}

/** 失效内存缓存；prefix 为空则全清 */
export function invalidateRequestCache(prefix = '') {
  if (!prefix) {
    memCache.clear()
    return
  }
  const p = String(prefix)
  for (const key of [...memCache.keys()]) {
    if (key.includes(p)) memCache.delete(key)
  }
}

function viaHttps(path, options = {}) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${CMS_BASE}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: authHeader(options.header),
      timeout: options.timeout || 10000,
      success(res) {
        const body = res.data
        if (body && body.code === 304) {
          resolve({ __unchanged: true, ...(body.data || {}) })
          return
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
          resolve(body.data)
        } else {
          const err = new Error((body && body.msg) || `HTTP ${res.statusCode}`)
          err.statusCode = res.statusCode
          err.code = body && body.code
          reject(err)
        }
      },
      fail(err) {
        reject(err)
      },
    })
  })
}

function viaCallContainer(path, options = {}) {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    try {
      if (!wx.cloud || typeof wx.cloud.callContainer !== 'function') {
        reject(new Error('callContainer 不可用'))
        return
      }
      const method = (options.method || 'GET').toUpperCase()
      wx.cloud.callContainer({
        config: { env: CLOUD_ENV_ID },
        path,
        method,
        header: {
          ...authHeader(options.header),
          'X-WX-SERVICE': CLOUD_SERVICE,
        },
        // GET 参数已在 path query 中；勿再塞空 data 干扰部分网关
        data: method === 'GET' ? undefined : options.data || {},
        // 云调用真机常挂满 10–12s 才 fail；硬顶 4.5s，好尽快串行切 HTTPS（yx.linyio.com 实测 <1s）
        timeout: Math.min(
          Number(options.cloudTimeout || options.timeout) || (method === 'GET' ? 4500 : 6000),
          4500
        ),
        success(res) {
          const body = res.data
          if (body && body.code === 304) {
            resolve({ __unchanged: true, ...(body.data || {}) })
            return
          }
          if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
            resolve(body.data)
          } else {
            const err = new Error((body && body.msg) || `云托管 ${res.statusCode}`)
            err.statusCode = res.statusCode
            err.code = body && body.code
            reject(err)
          }
        },
        fail(err) {
          reject(err || new Error('云托管调用失败'))
        },
      })
    } catch (e) {
      reject(e)
    }
  })
  // #endif
  // #ifndef MP-WEIXIN
  return Promise.reject(new Error('当前端暂不支持'))
  // #endif
}

/** 自定义域会对 POST /auth/login 挂死，禁止回退到该路径 */
function httpsFallbackPath(path) {
  if (path === '/api/traffic/v1/auth/login' || path.startsWith('/api/traffic/v1/auth/login?')) {
    return '/api/traffic/v1/auth/session'
  }
  return path
}

/**
 * 双通道健康度。真机实测：自定义域 HTTPS 可能整批挂死到超时，而 callContainer 80~120ms 正常；
 * 开发者工具里相反（云调用冷启慢）。所以两条路都不能写死优先，按运行时表现自适应。
 */
const CLOUD = 'cloud'
const HTTPS = 'https'
const health = {
  [CLOUD]: { fails: 0, downUntil: 0, wins: 0, ewma: 0 },
  [HTTPS]: { fails: 0, downUntil: 0, wins: 0, ewma: 0 },
}
/** 连续失败即判定不可用的冷却期；期间不再当首选，也不再并发对冲 */
const TRANSPORT_DOWN_MS = 60 * 1000
const TRANSPORT_DOWN_FAILS = 2
/** 首选未在该时间内返回，就并发开第二条（GET 幂等，先到先用）；过早对冲会双倍打库 */
const HEDGE_AFTER_MS = 2800
/** 鉴权热路径禁止并发对冲：失败再串行换路即可 */
const NO_HEDGE_RE = /\/(me|steps\/|checkin|lottery\/|flash\/|bootstrap|catalog|gifts|tasks)(\?|$)/

/**
 * 判断「这条链路不通」还是「服务端已答复」。
 * 注意 502/504 是网关自己的错（云调用网关冷启、回源失败），业务进程根本没收到请求，
 * 必须换另一条通道重试；而带业务信封的 4xx/5xx（err.code 来自 body.code）是真答复，换路没意义。
 */
function isTransportError(err) {
  if (!err) return true
  const status = Number(err.statusCode) || 0
  if (status) {
    if (status === 502 || status === 504) return true
    // 5xx 且没有业务信封 → 网关/代理层错误
    if (status >= 500 && err.code == null) return true
    return false
  }
  const msg = String((err && (err.message || err.errMsg)) || '')
  return /timeout|fail|abort|interrupt|ECONN|ENOTFOUND|socket|network|不可用|调用失败/i.test(msg)
}

function markTransportOk(name, ms) {
  const h = health[name]
  if (!h) return
  h.wins += 1
  h.fails = 0
  h.downUntil = 0
  if (ms > 0) h.ewma = h.ewma ? Math.round(h.ewma * 0.7 + ms * 0.3) : ms
}

function markTransportFail(name) {
  const h = health[name]
  if (!h) return
  h.fails += 1
  if (h.fails >= TRANSPORT_DOWN_FAILS) h.downUntil = Date.now() + TRANSPORT_DOWN_MS
}

function isTransportDown(name) {
  const h = health[name]
  return !!h && h.downUntil > Date.now()
}

function attempt(name, path, options) {
  const startedAt = Date.now()
  const p =
    name === CLOUD
      ? viaCallContainer(path, options)
      : viaHttps(httpsFallbackPath(path), options)
  return p.then((data) => {
    markTransportOk(name, Date.now() - startedAt)
    return data
  })
}

/** 明显更快的通道（差 300ms 以上）才切换首选，避免抖动 */
const LATENCY_EDGE_MS = 300

/**
 * 首选通道：默认 HTTPS（yx.linyio.com 外网实测 <1s），云调用作备路。
 * 真机 callContainer 常挂满 10–12s，再当首选会拖死下单/准点兑换。
 * preferCloud 可强制云优先；健康/时延仍会自动翻转。
 */
function pickPrimary(options = {}) {
  let primary = HTTPS
  if (options.preferCloud) primary = CLOUD
  else if (options.preferHttps) primary = HTTPS
  let other = primary === CLOUD ? HTTPS : CLOUD

  const a = health[primary]
  const b = health[other]
  if (a.ewma && b.ewma && b.ewma + LATENCY_EDGE_MS < a.ewma) {
    const t = primary
    primary = other
    other = t
  }
  if (isTransportDown(primary) && !isTransportDown(other)) return [other, primary]
  return [primary, other]
}

let loggedSwitch = false

/** GET：首选 + 延迟对冲，两路都挂才报错；业务错误（有 statusCode）立即上抛 */
function hedgedGet(path, options, primary, secondary, timeout) {
  return new Promise((resolve, reject) => {
    let settled = false
    let secondStarted = false
    let running = 0
    let lastErr = null
    let hedgeTimer = null

    const done = (fn, v) => {
      if (settled) return
      settled = true
      if (hedgeTimer) clearTimeout(hedgeTimer)
      fn(v)
    }

    // force=true 是「首选已经失败」的串行兜底：哪怕另一条处于冷却也要试，
    // 冷却只用来抑制主动并发对冲（避免给已知坏通道加压）
    const startSecond = (force) => {
      if (settled || secondStarted || !secondary) return false
      if (!force && isTransportDown(secondary)) return false
      secondStarted = true
      run(secondary)
      return true
    }

    const run = (name) => {
      running += 1
      attempt(name, path, { ...options, timeout })
        .then((data) => {
          running -= 1
          done(resolve, data)
        })
        .catch((err) => {
          running -= 1
          lastErr = err
          if (!isTransportError(err)) {
            // 服务端已答复（401/503 等），两条通道结果一致，无需再试
            markTransportOk(name)
            done(reject, err)
            return
          }
          markTransportFail(name)
          if (!loggedSwitch && secondary) {
            loggedSwitch = true
            // 60s 后允许再提示一次；避免整晚只看到一句「cloud 不可用」误判为永久故障
            setTimeout(() => {
              loggedSwitch = false
            }, 60000)
            console.warn(
              `[cms] ${name} 暂不可用，改走 ${secondary}（多为云托管冷启/抖动，约 60s 内自动恢复探测）`
            )
          }
          if (startSecond(true)) return
          if (running <= 0) done(reject, lastErr || err)
        })
    }

    hedgeTimer = setTimeout(() => startSecond(false), HEDGE_AFTER_MS)
    run(primary)
  })
}

function transport(path, options = {}) {
  // #ifdef MP-WEIXIN
  const method = (options.method || 'GET').toUpperCase()
  const [primary, secondary] = pickPrimary(options)

  if (method === 'GET') {
    const timeout = options.timeout || 10000
    // 禁止并发对冲到 callContainer：微信会弹原生「cloud.callContainer:fail timeout」
    // 即使 HTTPS 已成功返回。一律串行：首选失败再换路。
    const runGet = () =>
      attempt(primary, path, { ...options, timeout }).catch((err) => {
        if (!isTransportError(err) || !secondary) throw err
        markTransportFail(primary)
        return attempt(secondary, path, { ...options, timeout })
      })
    return runGet().catch((err) => {
      // 两条通道都栽在链路层 → 再试一轮；502/504 说明实例在重启，多等一会且只打一条
      if (options.__retried || !isTransportError(err)) throw err
      const status = Number(err && err.statusCode) || 0
      const gatewayDown = status === 502 || status === 504
      const waitMs = gatewayDown ? 1800 : 700
      return new Promise((r) => setTimeout(r, waitMs)).then(() => {
        const [p2] = pickPrimary(options)
        return attempt(p2, path, { ...options, __retried: true, timeout })
      })
    })
  }

  // 写操作不并发对冲（非幂等）：首选失败且属传输故障才串行换路
  // 云调用写路径硬顶 4500ms（真机常挂 10s+）；HTTPS 写顶 8s
  const primaryTimeout =
    (primary === CLOUD ? options.cloudTimeout : options.timeout) ||
    options.timeout ||
    (primary === CLOUD ? 4500 : 8000)
  const secondaryTimeout =
    (secondary === CLOUD ? options.cloudTimeout : options.timeout) ||
    options.timeout ||
    (secondary === CLOUD ? 4500 : 8000)
  return attempt(primary, path, { ...options, timeout: primaryTimeout }).catch((err) => {
    if (!isTransportError(err)) {
      markTransportOk(primary)
      throw err
    }
    markTransportFail(primary)
    if (!secondary) throw err
    return attempt(secondary, path, { ...options, timeout: secondaryTimeout })
  })
  // #endif
  // #ifndef MP-WEIXIN
  return viaHttps(httpsFallbackPath(path), options)
  // #endif
}

function fetchAndCache(path, options, key, ttl) {
  // 只有 GET 能共享在途请求：缓存键不含 body，写请求复用会把别人的响应当成自己的
  const dedupe = (options.method || 'GET').toUpperCase() === 'GET'
  if (dedupe) {
    const pending = inflight.get(key)
    if (pending) return pending
  }
  const task = transport(path, options)
    .then((data) => {
      if (ttl > 0 && data != null && !data.__unchanged) writeMem(key, data, ttl)
      return data
    })
    .finally(() => {
      if (dedupe) inflight.delete(key)
    })
  if (dedupe) inflight.set(key, task)
  return task
}

/**
 * @param {string} path
 * @param {{
 *   method?: string,
 *   data?: any,
 *   header?: object,
 *   timeout?: number,
 *   cacheTtl?: number,
 *   noCache?: boolean,
 *   revalidate?: boolean,
 * }} [options]
 */
export function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const key = cacheKey(method, path)
  const ttl = method === 'GET' ? resolveTtl(path, options) : 0
  const allowSwr = method === 'GET' && ttl > 0 && options.revalidate !== false && !options.noCache

  if (allowSwr) {
    const hit = peekMem(key)
    if (hit && hit.data != null) {
      const freshTtl = hit.freshTtl || ttl
      const staleWindow = freshTtl * 3
      // 新鲜：直接返回；过半龄时后台轻量刷新
      if (hit.age < freshTtl) {
        if (hit.age > freshTtl * 0.6) {
          fetchAndCache(path, { ...options, noCache: true }, key, ttl).catch(() => {})
        }
        return Promise.resolve(hit.data)
      }
      // 过期但仍在 stale 窗口：先回旧数据，后台刷新（SWR）
      if (hit.age < staleWindow) {
        fetchAndCache(path, { ...options, noCache: true }, key, ttl).catch(() => {})
        return Promise.resolve(hit.data)
      }
    }
  }

  if (method === 'GET') {
    const pending = inflight.get(key)
    if (pending) return pending
  }

  return fetchAndCache(path, options, key, ttl)
}

export function actionId(prefix = 'act') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

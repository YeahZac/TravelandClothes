/**
 * CMS 请求：
 * - 微信小程序：优先云托管 callContainer（同袍会 env + test-sever）
 * - 其它端 / 失败回退：HTTPS CMS_BASE
 *
 * 优化：
 * - GET 同路径 in-flight 合并（多模块 onShow 不打重复请求）
 * - 可选短期内存缓存（cacheTtl）
 * - callContainer 失败才回退 HTTPS；GET 用更短超时避免双通道串行拖死
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
  '/api/traffic/v1/festival/tickets': 60 * 1000,
  '/api/traffic/v1/gifts': 45 * 1000,
  '/api/traffic/v1/catalog': 45 * 1000,
  '/api/traffic/v1/me': 20 * 1000,
  '/api/traffic/v1/lottery/rules': 90 * 1000,
  '/api/traffic/v1/festival/verify/access': 30 * 1000,
  '/api/traffic/v1/flash/current': 3 * 1000,
  '/api/traffic/v1/flash/history': 20 * 1000,
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

function readMem(key) {
  const hit = memCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > hit.ttl) {
    memCache.delete(key)
    return null
  }
  return hit.data
}

function writeMem(key, data, ttl) {
  if (!ttl || data == null) return
  memCache.set(key, { at: Date.now(), ttl, data })
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
        timeout: options.timeout || (method === 'GET' ? 8000 : 12000),
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

const warnedFallback = Object.create(null)

/** 自定义域会对 POST /auth/login 挂死，禁止回退到该路径 */
function httpsFallbackPath(path) {
  if (path === '/api/traffic/v1/auth/login' || path.startsWith('/api/traffic/v1/auth/login?')) {
    return '/api/traffic/v1/auth/session'
  }
  return path
}

/** 只读热点默认走 HTTPS，避免 callContainer 排队拖慢首屏 */
const PREFER_HTTPS_GET = [
  '/api/traffic/v1/meta',
  '/api/traffic/v1/catalog',
  '/api/traffic/v1/bootstrap',
  '/api/traffic/v1/gifts',
  '/api/traffic/v1/lottery/rules',
  '/api/traffic/v1/flash/current',
  '/api/traffic/v1/flash/history',
  '/api/traffic/v1/me',
]

function shouldPreferHttps(path, method, options) {
  if (options.preferHttps) return true
  if (options.preferCloud) return false
  if (method !== 'GET') return false
  const base = pathOnly(path)
  return PREFER_HTTPS_GET.some((p) => base === p || base.startsWith(p + '/'))
}

function transport(path, options = {}) {
  // #ifdef MP-WEIXIN
  const method = (options.method || 'GET').toUpperCase()
  const httpsPath = httpsFallbackPath(path)
  const httpsTimeout = options.timeout || (method === 'GET' ? 10000 : 12000)
  // 高频只读：直连 HTTPS，避免 callContainer 先卡满再回退
  if (shouldPreferHttps(path, method, options)) {
    return viaHttps(httpsPath, { ...options, timeout: httpsTimeout }).catch((err) => {
      const cloudTimeout = options.cloudTimeout || Math.min(6000, httpsTimeout)
      if (!warnedFallback[`https:${path}`]) {
        warnedFallback[`https:${path}`] = true
        console.warn('[cms] HTTPS 失败，回退 callContainer', path, err && (err.message || err.errMsg || err))
      }
      return viaCallContainer(path, { ...options, timeout: cloudTimeout })
    })
  }
  const cloudTimeout = options.cloudTimeout || options.timeout || (method === 'GET' ? 8000 : 12000)
  return viaCallContainer(path, { ...options, timeout: cloudTimeout }).catch((err) => {
    if (!warnedFallback[path]) {
      warnedFallback[path] = true
      console.warn('[cms] callContainer 失败，回退 HTTPS', path, err && (err.message || err.errMsg || err))
    }
    return viaHttps(httpsPath, {
      ...options,
      timeout: httpsTimeout,
    })
  })
  // #endif
  // #ifndef MP-WEIXIN
  return viaHttps(httpsFallbackPath(path), options)
  // #endif
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
 * }} [options]
 */
export function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const key = cacheKey(method, path)
  const ttl = method === 'GET' ? resolveTtl(path, options) : 0

  if (method === 'GET' && ttl > 0) {
    const cached = readMem(key)
    if (cached != null) return Promise.resolve(cached)
  }

  if (method === 'GET') {
    const pending = inflight.get(key)
    if (pending) return pending
  }

  const task = transport(path, options)
    .then((data) => {
      if (method === 'GET' && ttl > 0 && data != null && !data.__unchanged) {
        writeMem(key, data, ttl)
      }
      return data
    })
    .finally(() => {
      if (method === 'GET') inflight.delete(key)
    })

  if (method === 'GET') inflight.set(key, task)
  return task
}

export function actionId(prefix = 'act') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

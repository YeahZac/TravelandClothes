const path = require('path')
const fs = require('fs')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const { validateConfig } = require('./validate')
const cos = require('./cos')
const { compressImage } = require('./imageCompress')
const dbMod = require('./db')
const configService = require('./services/configService')
const authService = require('./services/authService')
const jarService = require('./services/jarService')
const adminService = require('./services/adminService')
const commerceService = require('./services/commerceService')
const opsService = require('./services/opsService')
const mediaService = require('./services/mediaService')
const mediaUrl = require('./mediaUrl')

const app = express()
const PORT = process.env.PORT || 3100
const ROOT = path.join(__dirname, '..')

cos.ensureFolderTree()
if (typeof cos.warmWxGetauthAsync === 'function') cos.warmWxGetauthAsync()

// Node20 + deasync：未捕获超时会直接杀掉进程 → 云托管 502/503；只记日志不退出
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err)
})
process.on('unhandledRejection', (err) => {
  const msg = String((err && err.message) || err || '')
  // SyncGate 满时偶发 Promise 未接：降噪，避免误判成进程级故障
  if (/DB_BUSY|sync gate full|DB timeout|circuit open/i.test(msg)) {
    console.warn('[unhandledRejection:busy]', msg)
    return
  }
  console.error('[unhandledRejection]', err && err.stack ? err.stack : err)
})

/**
 * 库初始化放到 listen 之后，且用 openAsync（无 deasync）。
 * 同步 DDL + deasync 会在 Node20 打崩进程 → Liveness connection refused。
 */
let dbBooted = false
let dbBooting = false
async function bootDb(attempt = 1) {
  if (dbBooted || dbBooting) return
  dbBooting = true
  try {
    await dbMod.openAsync()
    try {
      await require('./warmSchemas').warmAllSchemasAsync()
    } catch (e) {
      console.warn('[boot] warmSchemas', e && e.message)
    }
    try {
      await require('./services/configService').warmPublishedAsync()
    } catch (e) {
      console.warn('[boot] published warm', e && e.message)
    }
    try {
      await require('./services/opsService').getOpsAsync()
    } catch (e) {
      console.warn('[boot] ops warm', e && e.message)
    }
    // 轻量种子一次：走 SyncGate，失败不阻断就绪
    try {
      await dbMod.runSync(() => adminService.seedIfEmpty())
    } catch (e) {
      console.warn('[boot] seedIfEmpty', e && e.message)
    }
    dbBooted = true
    dbBooting = false
    console.log('[boot] db ready (async warm + stability kernel)')
    // 方案B：启动后自动写入微信订单详情 path / 发货消息跳转（失败仅打日志）
    setTimeout(() => {
      require('./services/wxShippingService')
        .ensureMsgJumpPath({ force: true })
        .then((r) => console.log('[boot] wx order path', JSON.stringify(r && { ok: r.ok, skipped: r.skipped })))
        .catch((e) => console.warn('[boot] wx order path', e && e.message))
    }, 2500)
  } catch (e) {
    dbBooting = false
    console.error('[db] 启动失败(将重试，不退出进程):', e && e.message)
    const delay = Math.min(60000, 3000 * Math.max(1, attempt))
    setTimeout(() => {
      bootDb(attempt + 1).catch(() => {})
    }, delay)
  }
}

// 须大于 DB 查询超时，让 SQL 先失败返回，而不是 HTTP 先砍导致 SyncGate 槽位泄漏观感
const REQUEST_TIMEOUT_MS = Math.max(8000, Number(process.env.CMS_REQUEST_TIMEOUT_MS || 25000))
let _httpServer = null
let _shuttingDown = false

app.use(cors())
app.use(
  express.json({
    limit: '4mb',
    verify: (req, _res, buf) => {
      if (
        req.originalUrl &&
        (req.originalUrl.includes('/pay/wx/notify') || req.originalUrl.includes('/pay/wx/refund-notify'))
      ) {
        req.rawBody = buf
      }
    },
  })
)
/** 业务 API 墙钟超时：快速 503，不拖死事件循环 */
app.use((req, res, next) => {
  if (_shuttingDown) {
    return fail(res, 503, '服务重启中，请稍后')
  }
  const path = req.path || ''
  if (path === '/ping' || path === '/ready' || path === '/') return next()
  if (!path.startsWith('/api/')) return next()
  const timer = setTimeout(() => {
    if (res.headersSent) return
    console.warn('[api:timeout]', req.method, req.path)
    fail(res, 503, '请求超时，请稍后重试')
  }, REQUEST_TIMEOUT_MS)
  const clear = () => clearTimeout(timer)
  res.on('finish', clear)
  res.on('close', clear)
  next()
})
app.use('/uploads', express.static(cos.UPLOAD_ROOT))
/** 运营台入口：/qmyx/（不用 /admin，避免与 linyitech.cloud 其他项目冲突） */
app.use('/qmyx', express.static(path.join(ROOT, 'public/admin')))
app.get(['/admin', '/admin/'], (_req, res) => {
  res.redirect(301, '/qmyx/')
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

function baseUrl(req) {
  const host = req.get('host')
  const proto = req.protocol || 'http'
  return `${proto}://${host}`
}

function ok(res, data, msg = 'ok') {
  res.json({ code: 0, msg, data })
}

function fail(res, code, msg) {
  res.status(code >= 400 && code < 600 ? code : 400).json({ code, msg, data: null })
}

function isBusyError(e) {
  if (!e) return false
  if (e.code === 'DB_BUSY' || e.code === 'DB_TIMEOUT') return true
  const msg = String(e.message || '')
  return /DB_BUSY|DB timeout|circuit open|sync gate full/i.test(msg)
}

/** 同步业务包装：把 deasync/SQL 异常收成 JSON，避免 Express 默认 HTML 500 */
function wrap(handler) {
  return (req, res, next) => {
    try {
      const out = handler(req, res, next)
      if (out && typeof out.then === 'function') {
        out.catch((e) => {
          console.error('[api]', req.method, req.path, e && e.message)
          if (res.headersSent) return
          if (isBusyError(e)) return fail(res, 503, '服务繁忙，请稍后')
          fail(res, 500, (e && e.message) || '服务器错误')
        })
      }
    } catch (e) {
      console.error('[api]', req.method, req.path, e && e.message)
      if (res.headersSent) return
      if (isBusyError(e)) return fail(res, 503, '服务繁忙，请稍后')
      fail(res, 500, (e && e.message) || '服务器错误')
    }
  }
}

function authToken(req) {
  const h = req.get('authorization') || ''
  return h.startsWith('Bearer ') ? h.slice(7) : req.query.token || (req.body && req.body.token)
}

function authUser(req) {
  if (req && req.authResolved) return req.authUserId || null
  return authService.userFromToken(authToken(req))
}

function requireUser(req, res) {
  const uid = authUser(req)
  if (!uid) {
    fail(res, 401, '未登录或 token 无效')
    return null
  }
  try {
    authService.touchActive(uid)
  } catch (_) {}
  return uid
}

/** async 路由：鉴权走 queryAsync，不抢 SyncGate */
async function requireUserAsync(req, res) {
  const uid =
    req && req.authResolved
      ? req.authUserId || null
      : await authService.userFromTokenAsync(authToken(req))
  if (!uid) {
    fail(res, 401, '未登录或 token 无效')
    return null
  }
  try {
    authService.touchActive(uid)
  } catch (_) {}
  return uid
}

/**
 * 统一异步鉴权预取：
 * - 有 token 的 API 请求在进入旧同步 handler 前先 queryAsync 校验并写入 req。
 * - requireUser 因而只读 req/内存，MySQL 冷 token 不再触发 deasync。
 * - 无 token 的公开接口直接放行，不增加数据库查询。
 */
app.use('/api/traffic/v1', (req, _res, next) => {
  const token = authToken(req)
  if (!token) {
    req.authResolved = true
    req.authUserId = null
    return next()
  }
  authService
    .userFromTokenAsync(token)
    .then((uid) => {
      req.authResolved = true
      req.authUserId = uid || null
      next()
    })
    .catch((e) => {
      console.warn('[auth] prefetch', e && e.message)
      req.authResolved = true
      req.authUserId = null
      next()
    })
})

/** 探针专用：不碰 DB，保证容器能先变 Ready */
app.get('/ping', (_req, res) => {
  let wxAuth = null
  try {
    const wx = require('./services/wxAuth')
    wxAuth = {
      stamp: wx.BUILD_STAMP,
      cloud: wx.inCloudContainer(),
      openApi: wx.openApiBase(),
    }
  } catch (_) {}
  const stab = typeof dbMod.getStabilityStats === 'function' ? dbMod.getStabilityStats() : null
  ok(res, {
    status: 'ok',
    service: 'traffic-cms',
    dbBooted,
    shuttingDown: _shuttingDown,
    cosMode: cos.MODE,
    cos: typeof cos.cosDiag === 'function' ? cos.cosDiag() : { mode: cos.MODE },
    dialect: dbMod.DIALECT,
    db: dbMod.DIALECT === 'mysql' ? process.env.DB_NAME || 'travel_clothes' : dbMod.DB_PATH,
    build: process.env.BUILD_ID || process.env.GIT_COMMIT || 'async-hotpath-v18',
    wxAuth,
    stability: stab,
  })
})

/** 就绪：库已 boot 且熔断未开（云托管可选用；Liveness 仍用 /ping） */
app.get('/ready', (_req, res) => {
  const circuitOpen = typeof dbMod.isCircuitOpen === 'function' && dbMod.isCircuitOpen()
  if (!dbBooted || circuitOpen || _shuttingDown) {
    return res.status(503).json({
      code: 503,
      msg: !dbBooted ? 'db booting' : circuitOpen ? 'circuit open' : 'shutting down',
      data: { dbBooted, circuitOpen, shuttingDown: _shuttingDown },
    })
  }
  ok(res, { ready: true, dbBooted: true })
})

/** 主动探测云托管 getauth（发布 1～2 分钟后再打；启动瞬间失败属正常） */
app.get('/api/traffic/v1/admin/cos-probe', async (_req, res) => {
  try {
    if (typeof cos.probeWxGetauth !== 'function') {
      return fail(res, 500, '当前版本不支持 cos-probe')
    }
    const data = await cos.probeWxGetauth()
    ok(res, data, data.ok ? 'getauth ok' : 'getauth fail')
  } catch (e) {
    fail(res, 500, e.message || 'cos-probe 失败')
  }
})

/** 轻量版本探测 —— 前端缓存失效依据；库未就绪时走文件/内存，禁止 deasync 挂死 */
app.get('/api/traffic/v1/meta', async (req, res) => {
  try {
    const m = await configService.metaAsync(baseUrl(req))
    if (!m) return fail(res, 503, '尚未发布配置')
    ok(res, m)
  } catch (e) {
    console.warn('[meta]', e && e.message)
    fail(res, 503, (e && e.message) || 'meta 暂不可用')
  }
})

/** 小程序启动：全量壳层；?version= 相同则 304 */
app.get(
  '/api/traffic/v1/bootstrap',
  wrap(async (req, res) => {
    const published =
      (await configService.getPublishedAsync().catch(() => null)) ||
      configService.loadPublishedFromFile()
    if (!published) return fail(res, 503, '尚未发布配置')
    const degraded = published.__source === 'file-fallback'
    const clientVer = String(req.query.version || '')
    if (!degraded && clientVer && clientVer === String(published.version)) {
      return res.status(200).json({
        code: 304,
        msg: 'not modified',
        data: {
          version: published.version,
          publishedAt: published.publishedAt,
          unchanged: true,
        },
      })
    }
    const cfg = configService.absolutize(published)
    delete cfg.__source
    // 首屏必须先返回：这里禁止 runSync/deasync。catalog 由 /catalog 独立刷新。
    const catalog = cfg.catalog || { products: [], gifts: [], lottery: null }
    cfg.catalog = catalog
    if (!cfg.game) cfg.game = {}
    if (!cfg.game.lottery) cfg.game.lottery = catalog.lottery
    // 异步预热首屏常见图，不改 URL
    try {
      mediaService.warmKeysAsync(mediaService.collectKeysFromValue({ pages: cfg.pages, catalog }))
    } catch (_) {}
    let risk = null
    const economy = (cfg.game && cfg.game.economy) || null
    let lotteryRules = null
    try {
      const ops = require('./services/opsService')
      // 先 async 预热 ops，再拼汉服节票价——避免启动链路 deasync 超时冒泡成「汉服节」报错
      const full = await ops.getOpsAsync()
      // 下列衍生函数内部仍有同步统计查询；bootstrap 只发已加载配置，禁止 deasync。
      risk = full.risk || null
      cfg.risk = risk
      lotteryRules = cfg.lotteryRules || null
      const festPrices = (full.festival && full.festival.prices) || {}
      cfg.ops = {
        ...(cfg.ops || {}),
        homePopup: full.homePopup || {},
        monetize: full.monetize || {},
        demoActivityFeed: !!full.demoActivityFeed,
        festival: {
          registerEnabled: full.festival == null || full.festival.registerEnabled !== false,
          prices: festPrices,
        },
      }
    } catch (e) {
      console.warn('[bootstrap] ops/festival', e && e.message)
    }
    ok(res, {
      config: cfg,
      catalog,
      risk,
      economy,
      lotteryRules,
      degraded,
      meta: configService.metaFromPub(published, baseUrl(req)),
      platform: req.query.platform || 'mp-weixin',
      channel: req.query.channel || 'organic',
    })
  })
)

app.get(
  '/api/traffic/v1/config/:pageKey',
  wrap(async (req, res) => {
    const published = await configService.getPublishedAsync()
    if (!published) return fail(res, 503, '尚未发布配置')
    const page = published.pages && published.pages[req.params.pageKey]
    if (!page) return fail(res, 404, 'page 不存在')
    const slice = configService.absolutize({
      version: published.version,
      brand: published.brand,
      pageKey: req.params.pageKey,
      page,
      dicts: published.dicts,
      assets: published.assets,
      copy: published.copy,
      game: published.game,
    })
    ok(res, slice)
  })
)

app.get(
  '/api/traffic/v1/assets/manifest',
  wrap(async (req, res) => {
    const [man, m] = await Promise.all([
      configService.assetManifestAsync(),
      configService.metaAsync(baseUrl(req)),
    ])
    ok(res, { ...man, meta: m })
  })
)

/** 登录（多端 code → token） */
app.get(
  '/api/traffic/v1/legal',
  wrap(async (_req, res) => {
    ok(res, await require('./services/legalService').listPublicAsync())
  })
)

app.get(
  '/api/traffic/v1/legal/:docId',
  wrap(async (req, res) => {
    const doc = await require('./services/legalService').getPublicAsync(req.params.docId)
    if (!doc) return fail(res, 404, '协议不存在')
    ok(res, doc)
  })
)

/**
 * 微信登录。
 * 注意：自定义域 yx.linyio.com 上 POST /auth/login 会被网关挂死（0 字节超时），
 * 故同时挂 /auth/session 供 HTTPS 回退；callContainer 两条都可用。
 */
async function handleAuthLogin(req, res) {
  try {
    const body = req.body || {}
    // 云托管 callContainer 会注入 x-wx-openid / x-wx-unionid
    const cloudOpenid =
      req.get('x-wx-openid') || req.get('X-WX-OPENID') || body.cloudOpenid || ''
    const cloudUnionid =
      req.get('x-wx-unionid') || req.get('X-WX-UNIONID') || body.cloudUnionid || ''
    const data = await authService.login({
      platform: body.platform || 'mp-weixin',
      code: body.code || '',
      inviteCode: body.inviteCode || body.invite || '',
      channel: body.channel || '',
      nickName: body.nickName || body.nickname || '',
      avatarUrl: body.avatarUrl || body.avatar_url || '',
      gender: body.gender || '',
      cloudOpenid,
      cloudUnionid,
      agreeLegal: body.agreeLegal,
      tosVersion: body.tosVersion,
      privacyVersion: body.privacyVersion,
    })
    ok(res, data)
  } catch (e) {
    console.error('[auth/login]', e && e.message)
    fail(res, 400, e.message || '登录失败')
  }
}

app.post('/api/traffic/v1/auth/login', handleAuthLogin)
app.post('/api/traffic/v1/auth/session', handleAuthLogin)

app.post('/api/traffic/v1/auth/logout', (req, res) => {
  const h = req.get('authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.body && req.body.token) || ''
  authService.revokeToken(token)
  ok(res, { ok: true })
})

app.post(
  '/api/traffic/v1/auth/profile',
  wrap(async (req, res) => {
    const uid = requireUser(req, res)
    if (!uid) return
    const body = req.body || {}
    const data = await authService.updateProfile(uid, {
      nickName: body.nickName || body.nickname,
      avatarUrl: body.avatarUrl || body.avatar_url,
      gender: body.gender,
      province: body.province,
      city: body.city,
      district: body.district,
    })
    ok(res, data)
  })
)

/** 小程序上传头像（base64），写入 COS/本地并回写 profile */
app.post('/api/traffic/v1/me/avatar', async (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  try {
    const body = req.body || {}
    const raw = String(body.base64 || body.data || '')
    if (!raw) return fail(res, 400, '缺少头像数据')
    const m = raw.match(/^data:([^;]+);base64,(.+)$/) || []
    const mime = String(body.mime || m[1] || 'image/jpeg').slice(0, 64)
    const b64 = m[2] || raw.replace(/^data:[^;]+;base64,/, '')
    const buffer = Buffer.from(b64, 'base64')
    if (!buffer.length || buffer.length > 2 * 1024 * 1024) {
      return fail(res, 400, '头像过大或无效')
    }
    const compressed = await compressImage(buffer, mime)
    const ext = compressed.mime === 'image/webp' ? 'webp' : compressed.mime === 'image/png' ? 'png' : 'jpg'
    const key = `qmyx/avatars/u${uid}_${Date.now()}.${ext}`
    const put = await cos.putObject({
      key,
      buffer: compressed.buffer,
      mime: compressed.mime,
      originalName: `avatar.${ext}`,
    })
    const storagePath = mediaUrl.toStoragePath(put.path) || `/uploads/${put.cosKey}`
    // COS await 之后禁止直接 deasync；updateProfile 内部已 setImmediate
    const data = await authService.updateProfile(uid, { avatarUrl: storagePath })
    ok(res, { ...data, path: storagePath, cosKey: put.cosKey })
  } catch (e) {
    console.error('[me/avatar]', e && e.message)
    fail(res, 500, e.message || '头像上传失败')
  }
})

app.get('/api/traffic/v1/auth/wx-meta', (_req, res) => {
  const cfg = authService.wxConfig()
  ok(res, {
    appId: cfg.appId,
    secretConfigured: !!cfg.secret,
    allowDemo: cfg.allowDemo,
  })
})

app.get(
  '/api/traffic/v1/me',
  wrap(async (req, res) => {
    const uid = await requireUserAsync(req, res)
    if (!uid) return
    const data = await authService.meAsync(uid)
    if (!data) return fail(res, 404, '用户不存在')
    ok(res, data)
  })
)

app.get('/api/traffic/v1/jar/state', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const st = jarService.getState(uid)
  if (!st) return fail(res, 404, '罐子不存在')
  ok(res, st)
})

app.post('/api/traffic/v1/jar/harvest', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const actionId = (req.body && req.body.actionId) || ''
  if (!actionId) return fail(res, 400, '缺少 actionId')
  const r = jarService.harvest(uid, actionId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/jar/water', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const actionId = (req.body && req.body.actionId) || ''
  if (!actionId) return fail(res, 400, '缺少 actionId')
  const r = jarService.water(uid, actionId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/jar/fertilize', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const actionId = (req.body && req.body.actionId) || ''
  if (!actionId) return fail(res, 400, '缺少 actionId')
  const r = jarService.fertilize(uid, actionId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/jar/light', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const actionId = (req.body && req.body.actionId) || ''
  if (!actionId) return fail(res, 400, '缺少 actionId')
  const r = jarService.light(uid, actionId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/jar/clear-event', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const actionId = (req.body && req.body.actionId) || ''
  if (!actionId) return fail(res, 400, '缺少 actionId')
  const r = jarService.clearEvent(uid, actionId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/jar/redeem', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const actionId = (req.body && req.body.actionId) || ''
  if (!actionId) return fail(res, 400, '缺少 actionId')
  const r = jarService.redeem(uid, actionId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.get('/api/traffic/v1/admin/tree-defaults', (_req, res) => {
  ok(res, require('./services/treeDefaults').defaultTreeConfig())
})

/** 能量树：吸收今日营养 / 种种子 / 收果 / 偷好友树上营养 */
app.post('/api/traffic/v1/jar/claim-drop', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const actionId = (req.body && req.body.actionId) || ''
  if (!actionId) return fail(res, 400, '缺少 actionId')
  const r = require('./services/treeService').claimOwnDrop(uid, actionId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/jar/plant', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const actionId = (req.body && req.body.actionId) || ''
  const seedId = (req.body && req.body.seedId) || ''
  if (!actionId) return fail(res, 400, '缺少 actionId')
  if (!seedId) return fail(res, 400, '缺少 seedId')
  const r = require('./services/treeService').plantSeed(uid, seedId, actionId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/jar/harvest-fruit', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const actionId = (req.body && req.body.actionId) || ''
  if (!actionId) return fail(res, 400, '缺少 actionId')
  const r = require('./services/treeService').harvestFruit(uid, actionId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/friends/steal-nutrition', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const friendId = Number((req.body && req.body.friendId) || 0)
  const actionId = (req.body && req.body.actionId) || ''
  if (!friendId) return fail(res, 400, '缺少 friendId')
  if (!actionId) return fail(res, 400, '缺少 actionId')
  const r = require('./services/treeService').stealNutrition(uid, friendId, actionId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.get('/api/traffic/v1/jar/feed', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, jarService.feed(uid))
})

app.post('/api/traffic/v1/jar/feed/read', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, jarService.markFeedRead(uid))
})

app.post('/api/traffic/v1/subscribe/grant', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const saved = jarService.saveSubscribe(uid, (req.body && req.body.grants) || [])
  // 授权后立刻按当前罐态入队
  try {
    const st = jarService.getState(uid)
    require('./services/subscribeService').scheduleFromJar(uid, st)
  } catch (e) {}
  ok(res, saved)
})

/** P0：签到账本 */
app.post(
  '/api/traffic/v1/checkin',
  wrap(async (req, res) => {
    const uid = requireUser(req, res)
    if (!uid) return
    const r = await dbMod.runSync(() => require('./services/checkinService').checkin(uid))
    if (!r.ok) return fail(res, 400, r.msg)
    ok(res, r)
  })
)

app.get(
  '/api/traffic/v1/checkin/status',
  wrap(async (req, res) => {
    const uid = await requireUserAsync(req, res)
    if (!uid) return
    const data = await require('./services/checkinService').statusAsync(uid)
    ok(res, data)
  })
)

/** P0：好友 / 偷 / 助力 */
app.get('/api/traffic/v1/friends', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, require('./services/socialService').listFriends(uid))
})

app.post('/api/traffic/v1/friends/steal', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const friendId = Number((req.body && req.body.friendId) || 0)
  const actionId = (req.body && req.body.actionId) || ''
  if (!friendId) return fail(res, 400, '缺少 friendId')
  const r = require('./services/socialService').steal(uid, friendId, actionId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/friends/help', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const friendId = Number((req.body && req.body.friendId) || 0)
  const actionId = (req.body && req.body.actionId) || ''
  if (!friendId) return fail(res, 400, '缺少 friendId')
  const r = require('./services/socialService').help(uid, friendId, actionId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

/** P1：邀请摘要 / 解冻 */
/** 登录前校验邀请码（无需登录） */
app.get(
  '/api/traffic/v1/invite/check',
  wrap(async (req, res) => {
    const code = (req.query && (req.query.code || req.query.invite)) || ''
    ok(res, await require('./services/inviteService').checkCodeAsync(code))
  })
)

app.get('/api/traffic/v1/invite/summary', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, require('./services/inviteService').summary(uid))
})

app.get('/api/traffic/v1/invite/qrcode', async (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  try {
    const force = req.query.force === '1' || req.query.force === 'true'
    const r = await require('./services/inviteService').getInviteQrcode(uid, { force })
    if (!r.ok && !r.inviteCode) return fail(res, 400, r.msg || '生成失败')
    ok(res, r)
  } catch (e) {
    fail(res, 500, e.message || '生成小程序码失败')
  }
})

app.post('/api/traffic/v1/invite/unlock', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, require('./services/inviteService').unlockDue(uid))
})

/** 仅允许尚未绑定邀请人的用户绑定一次；登录后前端不展示入口 */
app.post('/api/traffic/v1/invite/bind', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const code = (req.body && (req.body.inviteCode || req.body.invite)) || ''
  const r = require('./services/inviteService').tryBind(uid, code)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

/** P2：微信运动 */
app.get(
  '/api/traffic/v1/steps/status',
  wrap(async (req, res) => {
    const uid = await requireUserAsync(req, res)
    if (!uid) return
    ok(res, await require('./services/stepsService').statusAsync(uid))
  })
)

app.post('/api/traffic/v1/steps/sync', async (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const body = req.body || {}
  try {
    if (body.code && String(body.code) !== 'demo') {
      await authService.refreshSessionKey(uid, body.code).catch((e) => {
        console.warn('[steps/sync] refreshSessionKey', e && e.message)
      })
    }
  } catch (e) {
    console.warn('[steps/sync] session_key', e && e.message)
  }
  try {
    // await 刷新 session_key 之后禁止直接 deasync：套 runSync，否则 Node20 栈溢出 → 502
    const r = await dbMod.runSync(() => require('./services/stepsService').sync(uid, body))
    if (!r.ok) return fail(res, 400, r.msg || '同步失败')
    ok(res, r)
  } catch (e) {
    console.error('[steps/sync]', e && e.message)
    if (isBusyError(e)) return fail(res, 503, '服务繁忙，请稍后')
    fail(res, 500, (e && e.message) || 'steps sync failed')
  }
})

app.post('/api/traffic/v1/steps/claim', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const actionId = (req.body && req.body.actionId) || ''
  const r = require('./services/stepsService').claim(uid, actionId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.get('/api/traffic/v1/steps/history', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  try {
    ok(
      res,
      require('./services/stepsService').history(uid, {
        days: Number(req.query.days || 30),
      })
    )
  } catch (e) {
    fail(res, 500, e.message || 'steps history failed')
  }
})

/** P2：IAA 激励视频 */
app.get('/api/traffic/v1/iaa/status', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, require('./services/iaaService').status(uid))
})

app.post('/api/traffic/v1/iaa/claim', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const r = require('./services/iaaService').claim(uid, req.body || {})
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

/** P2：订阅出站 flush（运营巡检 / 定时） */
app.post('/api/traffic/v1/admin/subscribe/flush', (req, res) => {
  const r = require('./services/subscribeService').flush({
    limit: Number((req.body && req.body.limit) || 50),
  })
  ok(res, r)
})

app.get('/api/traffic/v1/admin/subscribe/stats', (_req, res) => {
  ok(res, require('./services/subscribeService').outboxStats())
})

/** —— Admin —— */
app.get(
  '/api/traffic/v1/admin/config',
  wrap(async (req, res) => {
    // 运营台编辑用「入库相对路径」原稿；纯 async，避免 deasync 占满连接导致整页卡死
    const normalizeAdmin = (cfg) => {
      if (!cfg) return cfg
      const base = baseUrl(req)
      return JSON.parse(
        JSON.stringify(cfg)
          .replace(new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/uploads/`, 'g'), '/uploads/')
          .replace(
            cos.CDN_HOST
              ? new RegExp(`${String(cos.CDN_HOST).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'g')
              : /$^/,
            '/uploads/'
          )
      )
    }
    const [draft, published] = await Promise.all([
      configService.getDraftAsync(),
      configService.getPublishedAsync(),
    ])
    ok(res, {
      draft: normalizeAdmin(draft),
      published: normalizeAdmin(published),
    })
  })
)

app.put('/api/traffic/v1/admin/config', (req, res) => {
  const body = req.body && (req.body.config || req.body)
  const check = validateConfig(body)
  if (!check.ok) return fail(res, 400, check.errors.join('; '))
  const base = baseUrl(req)
  const normalized = JSON.parse(
    JSON.stringify(body)
      .replace(new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/uploads/`, 'g'), '/uploads/')
      .replace(
        cos.CDN_HOST
          ? new RegExp(`${cos.CDN_HOST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'g')
          : /$^/,
        '/uploads/'
      )
  )
  configService.saveDraft(normalized)
  ok(res, { version: normalized.version }, '草稿已保存')
})

app.post(
  '/api/traffic/v1/admin/publish',
  wrap((req, res) => {
    const draft = configService.getDraft()
    const check = validateConfig(draft)
    if (!check.ok) return fail(res, 400, check.errors.join('; '))
    const published = configService.publish()
    ok(res, { version: published.version, publishedAt: published.publishedAt }, '已发布')
  })
)

app.post('/api/traffic/v1/admin/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return fail(res, 400, '未收到文件')
    const folder = (req.body && req.body.folder) || 'icons'
    const compressed = await compressImage(req.file.buffer, req.file.mimetype)
    const ext = compressed.mime === 'image/webp' ? 'webp' : compressed.mime === 'image/png' ? 'png' : 'jpg'
    const baseName = (req.file.originalname || 'bin').replace(/\.[^.]+$/, '').replace(/[^\w.\-]+/g, '_')
    const safe = `${baseName}.${ext}`
    const key = `qmyx/${folder}/${Date.now()}_${safe}`
    const put = await cos.putObject({
      key,
      buffer: compressed.buffer,
      mime: compressed.mime,
      originalName: safe,
    })
    const storagePath = mediaUrl.toStoragePath(put.path) || `/uploads/${put.cosKey}`
    const proxyUrl = mediaUrl.adminProxyUrl(storagePath)
    // await 之后禁止同步 DB（deasync + Node20 → async hook 崩溃 → 整站 503）
    if (typeof configService.registerAssetAsync === 'function') {
      await configService.registerAssetAsync({
        cosKey: put.cosKey,
        purpose: folder,
        mime: put.mime,
        bytes: put.bytes,
        etag: put.etag,
      })
    }
    if (req.body && req.body.iconId) {
      const iconId = String(req.body.iconId).trim()
      const label = String(req.body.iconLabel || iconId)
      const t = dbMod.nowIso()
      const [rows] = await dbMod.queryAsync(`SELECT id FROM icon_asset WHERE id=?`, [iconId])
      if (rows && rows[0]) {
        await dbMod.queryAsync(
          `UPDATE icon_asset SET label=?, purpose=?, path=?, updated_at=? WHERE id=?`,
          [label, folder, storagePath, t, iconId]
        )
      } else {
        await dbMod.queryAsync(
          `INSERT INTO icon_asset (id,label,purpose,path,updated_at) VALUES (?,?,?,?,?)`,
          [iconId, label, folder, storagePath, t]
        )
      }
    }
    mediaService.warmKeysAsync([put.cosKey])
    ok(res, {
      path: storagePath,
      url: proxyUrl,
      proxyUrl,
      cosKey: put.cosKey,
      etag: put.etag,
      folder,
      mode: put.mode,
      warning: put.warning || '',
      bytes: put.bytes || compressed.bytes,
      originalBytes: req.file.size,
      compressed: !!compressed.compressed,
    })
  } catch (e) {
    console.error('[upload]', e && e.message)
    fail(res, 500, e.message || '上传失败')
  }
})

/** 媒体代理：小程序 callContainer / 管理台预览读 COS */
app.get('/api/traffic/v1/media/file', async (req, res) => {
  try {
    const key = String(req.query.key || '')
    const file = await mediaService.getFile(key)
    const envelope = String(req.query.envelope || req.query.format || '') === '1' || req.query.format === 'json'
    if (envelope) {
      return ok(res, {
        key: file.key,
        mime: file.mime,
        bytes: file.bytes,
        etag: file.etag,
        cached: !!file.cached,
        base64: file.buffer.toString('base64'),
      })
    }
    res.setHeader('Content-Type', file.mime || 'application/octet-stream')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    if (file.etag) res.setHeader('ETag', file.etag)
    res.setHeader('Content-Disposition', 'inline')
    res.send(file.buffer)
  } catch (e) {
    fail(res, e.status || 404, e.message || '媒体不存在')
  }
})

/** —— 运营后台扩展 API —— */
app.get(
  '/api/traffic/v1/admin/stats',
  wrap(async (req, res) => {
    // setImmediate 干净栈跑同步统计，避免占满 SyncGate 后堵死其它页
    const data = await dbMod.runSync(() =>
      adminService.statsOverview({
        range: req.query.range || req.query.period || 'today',
        from: req.query.from || '',
        to: req.query.to || '',
      })
    )
    ok(res, data)
  })
)

app.get(
  '/api/traffic/v1/admin/users',
  wrap(async (req, res) => {
    ok(
      res,
      await adminService.listUsersAsync({
        q: req.query.q || '',
        status: req.query.status || '',
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 20),
      })
    )
  })
)

app.get('/api/traffic/v1/admin/users/:id', (req, res) => {
  const r = adminService.getUserDetail(Number(req.params.id), {
    tab: req.query.tab || 'overview',
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || 20),
    direction: req.query.direction || '',
  })
  if (!r.ok) return fail(res, 404, r.msg)
  ok(res, r)
})

app.patch(
  '/api/traffic/v1/admin/users/:id',
  wrap((req, res) => {
    const r = adminService.updateUser(Number(req.params.id), req.body || {})
    if (!r.ok) return fail(res, 404, r.msg)
    ok(res, r.user)
  })
)

/** —— 系统设置 · 测试账号沙箱 —— */
app.get('/api/traffic/v1/admin/test-accounts', (_req, res) => {
  try {
    const svc = require('./services/testAccountService')
    ok(res, { list: svc.listSandboxes() })
  } catch (e) {
    fail(res, 500, e.message || 'list failed')
  }
})

app.get('/api/traffic/v1/admin/test-accounts/search', (req, res) => {
  // 验票管理员 / 测试账号共用：q 为空返回最近用户
  try {
    const svc = require('./services/testAccountService')
    ok(res, { list: svc.searchUsers(req.query.q || '', Number(req.query.limit || 30)) })
  } catch (e) {
    fail(res, 500, e.message || 'search failed')
  }
})

app.get('/api/traffic/v1/admin/test-accounts/:id', (req, res) => {
  try {
    const r = require('./services/testAccountService').getDetail(Number(req.params.id))
    if (!r.ok) return fail(res, 404, r.msg)
    ok(res, r)
  } catch (e) {
    fail(res, 500, e.message || 'detail failed')
  }
})

app.post('/api/traffic/v1/admin/test-accounts/:id/grant', (req, res) => {
  try {
    const r = require('./services/testAccountService').applyGrant(Number(req.params.id), req.body || {})
    if (!r.ok) return fail(res, 400, r.msg)
    ok(res, r)
  } catch (e) {
    console.error('[test-accounts/grant]', e && e.message)
    fail(res, 500, e.message || 'grant failed')
  }
})

app.post('/api/traffic/v1/admin/test-accounts/:id/clear', (req, res) => {
  try {
    const r = require('./services/testAccountService').clearSandbox(Number(req.params.id), req.body || {})
    if (!r.ok) return fail(res, 400, r.msg)
    ok(res, r)
  } catch (e) {
    console.error('[test-accounts/clear]', e && e.message)
    fail(res, 500, e.message || 'clear failed')
  }
})

app.get(
  '/api/traffic/v1/admin/products',
  wrap(async (req, res) => {
    ok(res, { list: await adminService.listProductsAsync() })
  })
)

/** 兑换经营 · SKU 下拉（须挂在 :id 路由之前） */
app.get(
  '/api/traffic/v1/admin/products/picker',
  wrap(async (req, res) => {
    const list = await require('./services/offerService').pickerListAsync({
      kind: req.query.kind || '',
      q: req.query.q || '',
      status: req.query.status != null ? req.query.status : 'on',
      limit: Number(req.query.limit || 200),
      listed: req.query.listed || '',
      minStock: req.query.minStock != null && req.query.minStock !== '' ? Number(req.query.minStock) : null,
      includeId: req.query.includeId || '',
    })
    ok(res, { list })
  })
)

app.put(
  '/api/traffic/v1/admin/products',
  wrap((req, res) => {
    const body = { ...(req.body || {}), _baseUrl: baseUrl(req) }
    const r = adminService.upsertProduct(body)
    if (!r.ok) return fail(res, 400, r.msg)
    ok(
      res,
      {
        ...r.item,
        draftSynced: r.draftSynced !== false,
        draftError: r.draftError || null,
      },
      r.draftSynced === false ? r.msg || '商品已保存（草稿未同步）' : 'ok'
    )
  })
)

app.delete(
  '/api/traffic/v1/admin/products/:id',
  wrap((req, res) => {
    ok(res, adminService.deleteProduct(req.params.id))
  })
)

app.get('/api/traffic/v1/admin/products/:id/bindings', (req, res) => {
  ok(res, require('./services/offerService').channelBindings(req.params.id))
})

app.post(
  '/api/traffic/v1/admin/products/:id/sort',
  wrap((req, res) => {
    const direction = String((req.body && req.body.direction) || 'up')
    const r = adminService.moveProductSort(req.params.id, direction === 'down' ? 'down' : 'up')
    if (!r.ok) return fail(res, 400, r.msg)
    ok(res, r)
  })
)

app.get(
  '/api/traffic/v1/lottery/rules',
  wrap(async (req, res) => {
    try {
      const uid = req.authResolved ? req.authUserId : authUser(req)
      const ops = require('./services/opsService')
      // 优先内存/async ops；避免 riskSnapshot 同步扫库拖死
      if (typeof ops.clientLotteryRulesAsync === 'function') {
        ok(res, await ops.clientLotteryRulesAsync(uid))
      } else {
        ok(res, ops.clientLotteryRules(uid))
      }
    } catch (e) {
      fail(res, 500, e.message || 'rules failed')
    }
  })
)

/** 文章：C 端详情 / 公告列表 */
app.get(
  '/api/traffic/v1/articles/notices',
  wrap(async (_req, res) => {
    try {
      ok(res, { items: await require('./services/articleService').noticeFeedItemsAsync(20) })
    } catch (e) {
      fail(res, 500, e.message || 'articles failed')
    }
  })
)

/** 完整 HTML 文章页：供小程序 web-view 按原规格渲染（须先于 :id JSON 路由注册也可，路径更具体） */
app.get(
  '/api/traffic/v1/articles/:id/page.html',
  wrap(async (req, res) => {
    try {
      const html = await require('./services/articleService').renderPageHtmlAsync(req.params.id)
      if (!html) {
        res.status(404).type('html').send('<!DOCTYPE html><html><body>文章不存在或已下架</body></html>')
        return
      }
      res.setHeader('Cache-Control', 'public, max-age=60')
      res.type('html').send(html)
    } catch (e) {
      res
        .status(500)
        .type('html')
        .send(`<!DOCTYPE html><html><body>${String((e && e.message) || 'render failed')}</body></html>`)
    }
  })
)

app.get(
  '/api/traffic/v1/articles/:id',
  wrap(async (req, res) => {
    try {
      const a = await require('./services/articleService').getByIdAsync(req.params.id, {
        publishedOnly: true,
      })
      if (!a) return fail(res, 404, '文章不存在或已下架')
      ok(res, a)
    } catch (e) {
      fail(res, 500, e.message || 'article failed')
    }
  })
)

app.get(
  '/api/traffic/v1/admin/articles',
  wrap(async (_req, res) => {
    const list = await require('./services/articleService').listAdminAsync()
    ok(res, { list })
  })
)

app.put(
  '/api/traffic/v1/admin/articles',
  wrap(async (req, res) => {
    const r = await require('./services/articleService').upsertAsync(req.body || {})
    if (!r.ok) return fail(res, 400, r.msg)
    ok(res, r)
  })
)

app.delete(
  '/api/traffic/v1/admin/articles/:id',
  wrap(async (req, res) => {
    ok(res, await require('./services/articleService').removeAsync(req.params.id))
  })
)

/** 管理端完整抽奖参数（含概率/峰顶；勿给小程序） */
app.get('/api/traffic/v1/admin/lottery-rules', (_req, res) => {
  try {
    ok(res, require('./services/opsService').adminLotteryRules())
  } catch (e) {
    fail(res, 500, e.message || 'rules failed')
  }
})

app.put('/api/traffic/v1/admin/lottery-rules', (req, res) => {
  try {
    const body = req.body || {}
    const ops = require('./services/opsService')
    const next = ops.saveLotteryRules({
      customRules: body.customRules,
      energyCost: body.energyCost != null ? body.energyCost : body.lotteryEnergyCost,
      dailyDrawLimit: body.dailyDrawLimit != null ? body.dailyDrawLimit : body.dailyLimit,
      emptyRatePercent: body.emptyRatePercent,
      globalWinRate: body.globalWinRate,
      dailyWinUserCap: body.dailyWinUserCap,
      maxWinsPerUserPerDay: body.maxWinsPerUserPerDay,
      newAccountHours: body.newAccountHours,
      softMiss: body.softMiss,
      hardMiss: body.hardMiss,
      softBoost: body.softBoost,
    })
    ok(res, {
      lotteryPage: next.lotteryPage,
      lotteryPity: next.lotteryPity,
      preview: ops.clientLotteryRules(),
    })
  } catch (e) {
    fail(res, 400, e.message || '保存失败')
  }
})

app.get(
  '/api/traffic/v1/admin/lottery',
  wrap(async (_req, res) => {
    ok(res, { list: await adminService.listLotteryAsync() })
  })
)

app.put(
  '/api/traffic/v1/admin/lottery',
  wrap((req, res) => {
    const r = adminService.upsertLottery(req.body || {})
    if (!r.ok) return fail(res, 400, r.msg)
    ok(res, r.item)
  })
)

app.delete('/api/traffic/v1/admin/lottery/:id', (req, res) => {
  ok(res, adminService.deleteLottery(req.params.id))
})

app.get(
  '/api/traffic/v1/admin/tasks',
  wrap(async (_req, res) => {
    ok(res, { list: await adminService.listTasksAsync() })
  })
)

app.get('/api/traffic/v1/admin/task-actions', (_req, res) => {
  ok(res, { list: require('./services/taskService').getBuiltinActions() })
})

app.put('/api/traffic/v1/admin/tasks', (req, res) => {
  const r = adminService.upsertTask(req.body || {})
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, { ok: true, actionKey: r.actionKey, targetCount: r.targetCount })
})

app.delete('/api/traffic/v1/admin/tasks/:id', (req, res) => {
  ok(res, adminService.deleteTask(req.params.id))
})

app.get('/api/traffic/v1/admin/task-completions', (req, res) => {
  ok(
    res,
    adminService.listTaskCompletions({
      day: req.query.day || '',
      taskId: req.query.taskId || '',
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 50),
    })
  )
})

app.get(
  '/api/traffic/v1/admin/redeems',
  wrap(async (req, res) => {
    ok(
      res,
      await adminService.listRedeemsAsync({
        status: req.query.status || '',
        orderType: req.query.orderType || '',
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 30),
      })
    )
  })
)

app.patch('/api/traffic/v1/admin/redeems/:id', (req, res) => {
  const r = adminService.updateRedeem(Number(req.params.id), req.body || {})
  if (!r.ok) return fail(res, 404, r.msg)
  ok(res, { ok: true })
})

app.get('/api/traffic/v1/admin/icons', (req, res) => {
  ok(res, { list: adminService.listIcons(baseUrl(req)) })
})

app.put('/api/traffic/v1/admin/icons', (req, res) => {
  const r = adminService.upsertIcon({ ...(req.body || {}), _baseUrl: baseUrl(req) })
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, { ok: true })
})

app.delete('/api/traffic/v1/admin/icons/:id', (req, res) => {
  ok(res, adminService.deleteIcon(req.params.id))
})

app.get(
  '/api/traffic/v1/admin/finance',
  wrap(async (req, res) => {
    const data = await dbMod.runSync(() =>
      adminService.listFinance({
        entryType: req.query.entryType || '',
        from: req.query.from || '',
        to: req.query.to || '',
        category: req.query.category || '',
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 50),
      })
    )
    ok(res, data)
  })
)

app.post('/api/traffic/v1/admin/finance', (req, res) => {
  const b = req.body || {}
  const amountCent =
    b.amountCent != null ? Number(b.amountCent) : adminService.yuanToCent(b.amountYuan)
  if (!b.entryType || !amountCent) return fail(res, 400, '缺少 entryType 或金额')
  const id = adminService.addFinance({
    entryType: b.entryType,
    category: b.category || 'misc',
    amountCent,
    refType: b.refType || 'manual',
    refId: b.refId || '',
    note: b.note || '',
    day: b.day || '',
  })
  ok(res, { id })
})

/** 回填已支付微信订单漏记流水 */
app.post(
  '/api/traffic/v1/admin/finance/backfill-wx',
  wrap((_req, res) => {
    // 显式回填：可能较慢，勿与列表/看板绑在一起
    ok(res, adminService.backfillWxPayFinance())
  })
)

/** 客户端 catalog / 抽奖 / 任务 / 下单（与后台数据互通） */
app.get(
  '/api/traffic/v1/catalog',
  wrap(async (req, res) => {
    ok(res, await adminService.catalogForClientAsync(baseUrl(req)))
  })
)

app.post('/api/traffic/v1/lottery/draw', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const actionId = (req.body && req.body.actionId) || ''
  const poolId = (req.body && req.body.poolId) || 'default'
  try {
    const r = adminService.drawLottery(uid, { actionId, poolId })
    if (!r || !r.ok) return fail(res, 400, (r && r.msg) || '抽奖失败')
    ok(res, r)
  } catch (e) {
    console.error('[lottery/draw]', e && e.message)
    if (isBusyError(e)) return fail(res, 503, '服务繁忙，请稍后')
    fail(res, 500, (e && e.message) || '抽奖失败')
  }
})

app.get(
  '/api/traffic/v1/lottery/history',
  wrap(async (req, res) => {
    const uid = await requireUserAsync(req, res)
    if (!uid) return
    ok(
      res,
      await require('./services/lotteryService').historyAsync(uid, {
        page: req.query.page,
        pageSize: req.query.pageSize,
      })
    )
  })
)

app.get('/api/traffic/v1/me/seeds', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  try {
    require('./services/skuService').migrateKinds()
  } catch (_) {}
  ok(res, require('./services/skuService').listUserSeeds(uid))
})

app.get(
  '/api/traffic/v1/admin/skus',
  wrap(async (req, res) => {
    ok(
      res,
      await require('./services/skuService').listSkusAsync({
        kind: req.query.kind || '',
        status: req.query.status || '',
        q: req.query.q || '',
      })
    )
  })
)

app.get('/api/traffic/v1/offers/:id', (req, res) => {
  const channel = req.query.channel || ''
  ok(res, { offer: require('./services/offerService').resolveOffer(req.params.id, channel) })
})

app.put('/api/traffic/v1/admin/skus', (req, res) => {
  const r = require('./services/skuService').upsertSku(req.body || {})
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

/** 渠道上架：商城 / 兑好礼 */
app.get('/api/traffic/v1/admin/listings', (req, res) => {
  const channel = String(req.query.channel || 'mall')
  try {
    const listing = require('./services/listingService')
    listing.ensureReady()
    ok(res, { list: listing.listListingsAdmin(channel) })
  } catch (e) {
    fail(res, 500, e.message || 'listings failed')
  }
})

app.put('/api/traffic/v1/admin/listings', (req, res) => {
  const r = require('./services/listingService').upsertListing(req.body || {})
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.delete('/api/traffic/v1/admin/listings/:channel/:productId', (req, res) => {
  const r = require('./services/listingService').deleteListing(req.params.channel, req.params.productId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/admin/listings/:channel/:productId/sort', (req, res) => {
  const direction = String((req.body && req.body.direction) || 'up')
  const r = require('./services/listingService').moveListingSort(
    req.params.channel,
    req.params.productId,
    direction === 'down' ? 'down' : 'up'
  )
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.get('/api/traffic/v1/admin/lottery-pools', (_req, res) => {
  ok(res, require('./services/lotteryService').listPools())
})

app.put('/api/traffic/v1/admin/lottery-pools', (req, res) => {
  const r = require('./services/lotteryService').upsertPool(req.body || {})
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

/** 今日任务列表（进度 0/N、已完成/可领取，日切重置） */
app.get(
  '/api/traffic/v1/tasks/today',
  wrap(async (req, res) => {
    const uid = await requireUserAsync(req, res)
    if (!uid) return
    try {
      ok(res, await require('./services/taskService').listTodayAsync(uid))
    } catch (e) {
      fail(res, 500, (e && e.message) || 'tasks today failed')
    }
  })
)

app.post('/api/traffic/v1/tasks/complete', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const taskId = (req.body && req.body.taskId) || ''
  if (!taskId) return fail(res, 400, '缺少 taskId')
  try {
    const r = require('./services/taskService').complete(uid, taskId)
    if (!r.ok) return fail(res, 400, r.msg)
    ok(res, r)
  } catch (e) {
    fail(res, 500, (e && e.message) || 'task complete failed')
  }
})

/** 上报当日可统计行为：share / browse_mall / browse_festival */
app.post('/api/traffic/v1/tasks/action', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const actionKey = (req.body && (req.body.actionKey || req.body.action)) || ''
  if (!actionKey) return fail(res, 400, '缺少 actionKey')
  try {
    const r = require('./services/taskService').recordAction(uid, actionKey)
    if (!r.ok) return fail(res, 400, r.msg)
    ok(res, r)
  } catch (e) {
    fail(res, 500, (e && e.message) || 'task action failed')
  }
})

app.post('/api/traffic/v1/orders/create', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const body = req.body || {}
  if (body.orderType === 'festival' || body.ticketId) {
    try {
      const r = require('./services/festivalTicketService').createOrder(uid, body)
      if (!r.ok) return fail(res, 400, r.msg)
      return ok(res, r)
    } catch (e) {
      return fail(res, 500, (e && e.message) || 'festival order failed')
    }
  }
  const r = commerceService.placeOrder(uid, body)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

/** 汉服节票种价目 */
app.get(
  '/api/traffic/v1/festival/tickets',
  wrap(async (_req, res) => {
    try {
      const data = await require('./services/festivalTicketService').listTicketsAsync()
      ok(res, data)
    } catch (e) {
      console.warn('[festival/tickets]', e && e.message)
      // 降级默认价，避免首页/Tab 预载拖死
      try {
        const fallback = await dbMod.runSync(() =>
          require('./services/festivalTicketService').listTickets()
        )
        ok(res, fallback)
      } catch (e2) {
        fail(res, 500, (e2 && e2.message) || (e && e.message) || 'festival tickets failed')
      }
    }
  })
)

app.post(
  '/api/traffic/v1/festival/orders',
  wrap(async (req, res) => {
    const uid = requireUser(req, res)
    if (!uid) return
    try {
      const r = await dbMod.runSync(() =>
        require('./services/festivalTicketService').createOrder(uid, req.body || {})
      )
      if (!r.ok) return fail(res, 400, r.msg)
      ok(res, r)
    } catch (e) {
      fail(res, 500, (e && e.message) || 'festival order failed')
    }
  })
)

/** 我的汉服节电子票（自动补开已支付未出票订单） */
app.get(
  '/api/traffic/v1/festival/my-tickets',
  wrap(async (req, res) => {
    const uid = requireUser(req, res)
    if (!uid) return
    const fest = require('./services/festivalTicketService')
    try {
      const data = await fest.listMyTicketsAsync(uid)
      ok(res, data)
    } catch (e) {
      console.error('[festival] my-tickets', e && e.message)
      // 回退同步列表须走 runSync 干净栈，避免紧接 await 后 deasync 打崩进程
      try {
        const data = await dbMod.runSync(() => fest.listMyTickets(uid))
        ok(res, data)
      } catch (e2) {
        fail(res, 500, (e2 && e2.message) || (e && e.message) || 'my tickets failed')
      }
    }
  })
)

/** 电子票详情（本人） */
app.get('/api/traffic/v1/festival/tickets/:ticketNo', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  try {
    const pass = require('./services/festivalTicketService').getPassByTicketNo(req.params.ticketNo, uid)
    if (!pass) return fail(res, 404, '票不存在')
    ok(res, { ticket: pass })
  } catch (e) {
    fail(res, 500, (e && e.message) || 'ticket detail failed')
  }
})

/** 当前用户是否验票管理员（控制小程序入口） */
app.get(
  '/api/traffic/v1/festival/verify/access',
  wrap(async (req, res) => {
    const uid = requireUser(req, res)
    if (!uid) return
    try {
      const fest = require('./services/festivalTicketService')
      const allowed = await fest.isFestivalVerifierAsync(uid)
      ok(res, {
        allowed,
        today: fest.shanghaiDayKey(),
        tip: allowed ? '可扫码验票' : '仅验票管理员可见入口',
      })
    } catch (e) {
      console.warn('[festival/verify/access]', e && e.message)
      // 我的页每次 onShow 都会打；失败时隐藏入口即可，勿 500
      ok(res, { allowed: false, today: '', tip: '验票权限暂不可用' })
    }
  })
)

/**
 * 工作人员扫码验票（需登录且在验票管理员名单）
 * 业务失败也返回 200 + data.ok=false，便于前端展示票面信息
 */
app.post('/api/traffic/v1/festival/verify', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  try {
    const fest = require('./services/festivalTicketService')
    if (!fest.isFestivalVerifier(uid)) return fail(res, 403, '无验票权限，请联系运营配置「验票管理员」')
    const body = req.body || {}
    const code = body.code || body.verifyCode || body.ticketNo || ''
    const r = fest.verifyPass({
      code,
      by: `user:${uid}`,
      invalidate: !!(body.invalidate || body.void),
    })
    ok(res, r)
  } catch (e) {
    fail(res, 500, (e && e.message) || 'verify failed')
  }
})

/** 运营台核销（不校验验票管理员名单） */
app.post('/api/traffic/v1/admin/festival/verify', (req, res) => {
  try {
    const body = req.body || {}
    const code = body.code || body.verifyCode || body.ticketNo || ''
    const r = require('./services/festivalTicketService').verifyPass({
      code,
      by: `admin:${String(body.by || 'ops').slice(0, 40)}`,
      invalidate: !!(body.invalidate || body.void),
    })
    ok(res, r)
  } catch (e) {
    fail(res, 500, (e && e.message) || 'admin verify failed')
  }
})

/** 系统设置 · 验票管理员名单 */
app.get('/api/traffic/v1/admin/festival/verify-staff', (_req, res) => {
  try {
    const fest = require('./services/festivalTicketService')
    ok(res, {
      list: fest.listVerifyStaff(),
      ids: fest.readVerifyStaffIds(),
      eventYear: Number((require('./services/opsService').getOps().festival || {}).eventYear) || 2026,
    })
  } catch (e) {
    fail(res, 500, (e && e.message) || 'verify-staff failed')
  }
})

app.put('/api/traffic/v1/admin/festival/verify-staff', (req, res) => {
  try {
    const body = req.body || {}
    const fest = require('./services/festivalTicketService')
    const ids = Array.isArray(body.ids) ? body.ids : Array.isArray(body.verifyStaffIds) ? body.verifyStaffIds : []
    const r = fest.setVerifyStaffIds(ids)
    if (body.eventYear != null) {
      const y = Number(body.eventYear)
      if (Number.isFinite(y) && y >= 2024 && y <= 2100) {
        require('./services/opsService').saveOps({ festival: { eventYear: y } })
      }
    }
    ok(res, {
      list: r.list,
      ids: fest.readVerifyStaffIds(),
    })
  } catch (e) {
    fail(res, 500, (e && e.message) || 'save verify-staff failed')
  }
})

/** 购物车 */
app.get(
  '/api/traffic/v1/me/cart',
  wrap(async (req, res) => {
    const uid = await requireUserAsync(req, res)
    if (!uid) return
    try {
      ok(res, await require('./services/cartService').listCartAsync(uid))
    } catch (e) {
      fail(res, 500, e.message || 'cart failed')
    }
  })
)

function handleCartUpsert(req, res) {
  const uid = requireUser(req, res)
  if (!uid) return
  const body = req.body || {}
  const r = require('./services/cartService').upsertItem(
    uid,
    body.productId || body.id,
    body.qty != null ? body.qty : 1
  )
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r.cart)
}
// PUT body 在 callContainer 上不稳定，同时提供 POST
app.put('/api/traffic/v1/me/cart', handleCartUpsert)
app.post('/api/traffic/v1/me/cart', handleCartUpsert)

app.post('/api/traffic/v1/me/cart/merge', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const items = (req.body && req.body.items) || []
  const r = require('./services/cartService').mergeLocal(uid, items)
  ok(res, r.cart)
})

app.delete('/api/traffic/v1/me/cart/:productId', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, require('./services/cartService').removeItem(uid, req.params.productId).cart)
})
app.post('/api/traffic/v1/me/cart/:productId/remove', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, require('./services/cartService').removeItem(uid, req.params.productId).cart)
})

app.delete('/api/traffic/v1/me/cart', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, require('./services/cartService').clearCart(uid).cart)
})
app.post('/api/traffic/v1/me/cart/clear', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, require('./services/cartService').clearCart(uid).cart)
})

/** 微信支付配置探测（不含密钥明文） */
app.get('/api/traffic/v1/pay/wx/status', (_req, res) => {
  try {
    const wxPay = require('./services/wxPayService')
    ok(res, wxPay.status())
  } catch (e) {
    fail(res, 500, e.message)
  }
})

/** 小程序调起支付：返回 wx.requestPayment 参数；失败信息对商城/兑礼通用，勿提中奖凭证 */
/** 支付成功后主动查单入账（回调验签失败时的兜底） */
async function handleWxPayConfirm(req, res) {
  const uid = requireUser(req, res)
  if (!uid) return
  try {
    const orderNo =
      (req.body && (req.body.orderNo || req.body.outTradeNo)) ||
      req.query.orderNo ||
      req.query.outTradeNo ||
      ''
    const data = await require('./services/wxPayService').confirmPaidByQuery(uid, orderNo)
    ok(res, data)
  } catch (e) {
    const msg = (e && e.message) || '查单失败'
    fail(res, 400, msg)
  }
}
app.post('/api/traffic/v1/pay/wx/confirm', handleWxPayConfirm)
// 兼容别名：旧包/网关偶发 404 时前端可降级打这条
app.post('/api/traffic/v1/pay/confirm', handleWxPayConfirm)
app.post('/api/traffic/v1/me/orders/sync-pay', handleWxPayConfirm)

app.post('/api/traffic/v1/pay/wx/prepay', async (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const orderNo = (req.body && req.body.orderNo) || ''
  if (!orderNo) return fail(res, 400, '缺少 orderNo')
  try {
    const wxPay = require('./services/wxPayService')
    const data = await wxPay.createJsapiPrepay(uid, orderNo)
    ok(res, data)
  } catch (e) {
    const msg = (e && e.message) || '预下单失败'
    console.error('[wxpay prepay]', orderNo, msg)
    if (/DECODER|私钥无法解析|未配置商户私钥|微信支付未配置/i.test(msg)) {
      return fail(res, 503, '微信支付暂不可用，请稍后重试或联系客服')
    }
    fail(res, 400, msg)
  }
})

/** 微信支付结果回调（公网 HTTPS） */
app.post('/api/traffic/v1/pay/wx/notify', async (req, res) => {
  try {
    const wxPay = require('./services/wxPayService')
    const raw =
      req.rawBody != null
        ? Buffer.isBuffer(req.rawBody)
          ? req.rawBody.toString('utf8')
          : String(req.rawBody)
        : JSON.stringify(req.body || {})
    const result = await wxPay.handleNotify(req.headers, raw)
    res.json(result)
  } catch (e) {
    console.error('[wxpay notify]', e.message)
    res.status(500).json({ code: 'FAIL', message: e.message || '处理失败' })
  }
})

/** 微信退款结果回调 */
app.post('/api/traffic/v1/pay/wx/refund-notify', async (req, res) => {
  try {
    const wxPay = require('./services/wxPayService')
    const raw =
      req.rawBody != null
        ? Buffer.isBuffer(req.rawBody)
          ? req.rawBody.toString('utf8')
          : String(req.rawBody)
        : JSON.stringify(req.body || {})
    const result = await wxPay.handleRefundNotify(req.headers, raw)
    res.json(result)
  } catch (e) {
    console.error('[wxpay refund-notify]', e.message)
    res.status(500).json({ code: 'FAIL', message: e.message || '处理失败' })
  }
})

app.get('/api/traffic/v1/me/orders', async (req, res) => {
  const uid = await requireUserAsync(req, res)
  if (!uid) return
  try {
    // 列表只读：关单交给定时任务；微信补记最多 1 单，详情页再精修
    const data = await commerceService.listOrdersAsync(uid, {
      status: req.query.status || '',
      statusIn: req.query.statusIn || '',
      orderType: req.query.orderType || '',
      types: req.query.types || '',
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 50),
    })
    const list = Array.isArray(data.list) ? data.list : []
    let syncBudget = 1
    const synced = []
    for (const o of list) {
      if (
        syncBudget > 0 &&
        o &&
        o.needWxPay &&
        o.wxPrepayId &&
        (o.status === 'unpaid' || o.payStatus === 'prepay')
      ) {
        syncBudget -= 1
        try {
          synced.push(await commerceService.syncOrderPayIfNeeded(uid, o))
        } catch (_) {
          synced.push(o)
        }
      } else {
        synced.push(o)
      }
    }
    ok(res, { ...data, list: synced })
  } catch (e) {
    console.error('[orders] list', e && e.message)
    if (isBusyError(e)) return fail(res, 503, '服务繁忙，请稍后')
    fail(res, 500, (e && e.message) || '订单列表失败')
  }
})

app.get('/api/traffic/v1/me/orders/:id', async (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  try {
    // 整段走 queryAsync：async 路由里禁止 deasync 查单（支付后补记会 await 微信）
    let order = await commerceService.getOrderAsync(uid, req.params.id)
    if (!order) return fail(res, 404, '订单不存在')
    try {
      order = await commerceService.syncOrderPayIfNeeded(uid, order)
    } catch (e) {
      console.warn('[orders] detail sync pay', req.params.id, e && e.message)
    }
    ok(res, order)
  } catch (e) {
    console.error('[orders] detail', req.params.id, e && e.message)
    fail(res, 500, (e && e.message) || '订单查询失败')
  }
})

app.post('/api/traffic/v1/me/orders/:id/cancel', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  let id = Number(req.params.id)
  if (!id) {
    const byNo = commerceService.getOrderByNo(uid, req.params.id)
    id = byNo && byNo.id
  }
  if (!id) return fail(res, 404, '订单不存在')
  const r = commerceService.cancelOrder(uid, id)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/me/orders/:id/confirm', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  let id = Number(req.params.id)
  if (!id) {
    const byNo = commerceService.getOrderByNo(uid, req.params.id)
    id = byNo && byNo.id
  }
  if (!id) return fail(res, 404, '订单不存在')
  const r = commerceService.confirmOrder(uid, id)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.get(
  '/api/traffic/v1/me/addresses',
  wrap(async (req, res) => {
    const uid = await requireUserAsync(req, res)
    if (!uid) return
    ok(res, { list: await commerceService.listAddressesAsync(uid) })
  })
)

function handleSaveAddress(req, res) {
  const uid = requireUser(req, res)
  if (!uid) return
  // callContainer 偶发 body 空：兼容 data 包一层
  const body = (req.body && (req.body.data || req.body)) || {}
  const r = commerceService.saveAddress(uid, body)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r.address, '地址已保存')
}

// 小程序云托管对 POST 体更稳；保留 PUT 兼容
app.post('/api/traffic/v1/me/addresses', handleSaveAddress)
app.put('/api/traffic/v1/me/addresses', handleSaveAddress)

app.delete('/api/traffic/v1/me/addresses/:id', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const r = commerceService.deleteAddress(uid, Number(req.params.id))
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/me/addresses/:id/default', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const r = commerceService.setDefaultAddress(uid, Number(req.params.id))
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r.address)
})

app.get(
  '/api/traffic/v1/gifts',
  wrap(async (_req, res) => {
    const listing = require('./services/listingService')
    const list = (await listing.listGiftCatalogAsync()).map((o) => listing.mapGiftClient(o))
    ok(res, { list })
  })
)

/** —— 限时开兑 / 兑换动态 —— */
app.get(
  '/api/traffic/v1/flash/current',
  wrap(async (_req, res) => {
    try {
      ok(res, await require('./services/flashRedeemService').currentAsync())
    } catch (e) {
      console.warn('[flash/current]', e && e.message)
      // 降级空态，勿 500 拖死首页模块
      ok(res, {
        moduleTitle: '准点兑换',
        status: 'idle',
        title: '准点兑换',
        canRedeem: false,
        countdown: '00:00:00',
        countdownSec: 0,
        soldoutMsg: '',
        productId: '',
        productName: '',
        imageUrl: '',
        payLabel: '',
        payPoints: 0,
        payCashCent: 0,
        payCashYuan: 0,
      })
    }
  })
)

app.post(
  '/api/traffic/v1/flash/redeem',
  wrap(async (req, res) => {
    const uid = requireUser(req, res)
    if (!uid) return
    const r = await dbMod.runSync(() =>
      require('./services/flashRedeemService').redeem(uid, req.body || {})
    )
    if (!r.ok) return fail(res, 400, r.msg)
    ok(res, r)
  })
)

app.get(
  '/api/traffic/v1/flash/history',
  wrap(async (req, res) => {
    try {
      const data = await require('./services/flashRedeemService').historyAsync({
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 20),
      })
      ok(res, data)
    } catch (e) {
      fail(res, 500, e.message || 'flash history failed')
    }
  })
)

app.get(
  '/api/traffic/v1/activity/feed',
  wrap(async (req, res) => {
    try {
      const ops = await require('./services/opsService').getOpsAsync()
      const data = await require('./services/flashRedeemService').activityFeedAsync(
        Number(req.query.limit || 50),
        { allowDemo: !!ops.demoActivityFeed }
      )
      ok(res, data)
    } catch (e) {
      console.warn('[activity/feed]', e && e.message)
      ok(res, { items: [], list: [] })
    }
  })
)

app.get(
  '/api/traffic/v1/admin/flash-slots',
  wrap(async (_req, res) => {
    ok(res, { list: await require('./services/flashRedeemService').listSlotsAdminAsync() })
  })
)

app.put('/api/traffic/v1/admin/flash-slots', (req, res) => {
  const body = req.body || {}
  if (Array.isArray(body.list)) {
    const r = require('./services/flashRedeemService').upsertBatch(body.list)
    if (!r.ok) {
      const first = (r.results || []).find((x) => !x.ok)
      return fail(res, 400, (first && first.msg) || '批量保存失败')
    }
    return ok(res, r)
  }
  const r = require('./services/flashRedeemService').upsertSlot(body)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.get(
  '/api/traffic/v1/admin/home-popup',
  wrap(async (_req, res) => {
    const ops = await require('./services/opsService').getOpsAsync()
    ok(res, { ...(ops.homePopup || {}), demoActivityFeed: !!ops.demoActivityFeed })
  })
)

app.put('/api/traffic/v1/admin/home-popup', (req, res) => {
  const b = req.body || {}
  const patch = {
    homePopup: {
      enabled: b.enabled !== false,
      frequency: b.frequency === 'once' ? 'once' : 'daily',
      imageUrl: String(b.imageUrl || '').trim(),
      title: String(b.title || '').trim(),
      confirmText: String(b.confirmText || '去看看').trim(),
      confirmPath: String(b.confirmPath || 'gift').trim(),
      remark: String(b.remark || '').trim(),
    },
  }
  if (b.demoActivityFeed != null) patch.demoActivityFeed = !!b.demoActivityFeed
  const next = require('./services/opsService').saveOps(patch)
  ok(res, { ...(next.homePopup || {}), demoActivityFeed: !!next.demoActivityFeed })
})

/** 测试专用：指定票号强制按「今天」可验（不影响其它票） */
app.get(
  '/api/traffic/v1/admin/festival/test-force-today',
  wrap(async (_req, res) => {
    const fest = require('./services/festivalTicketService')
    const ops = await require('./services/opsService').getOpsAsync()
    const f = (ops && ops.festival) || {}
    const nos = Array.isArray(f.testForceTodayTicketNos) ? f.testForceTodayTicketNos : []
    ok(res, {
      today: fest.shanghaiDayKey(),
      ticketNos: nos,
      hint: '仅名单内票号按今天可验/展示；测完请清空。其它票日期逻辑不变。',
    })
  })
)

app.put('/api/traffic/v1/admin/festival/test-force-today', (req, res) => {
  const b = req.body || {}
  const raw = b.ticketNos != null ? b.ticketNos : b.ticketNo
  let list = []
  if (Array.isArray(raw)) list = raw
  else if (raw != null) list = String(raw).split(/[\s,;]+/)
  const ticketNos = [
    ...new Set(
      list
        .map((x) => String(x || '').trim().toUpperCase())
        .filter(Boolean)
    ),
  ]
  const next = require('./services/opsService').saveOps({
    festival: { testForceTodayTicketNos: ticketNos },
  })
  const fest = require('./services/festivalTicketService')
  ok(res, {
    today: fest.shanghaiDayKey(),
    ticketNos: (next.festival && next.festival.testForceTodayTicketNos) || ticketNos,
  })
})

/** 汉服节页：原生报名开关 + 票价（关则仅 HTML 富文本） */
app.get('/api/traffic/v1/admin/festival-ui', (_req, res) => {
  const ops = require('./services/opsService').getOps()
  const fest = require('./services/festivalTicketService')
  const f = ops.festival || {}
  ok(res, {
    registerEnabled: f.registerEnabled !== false,
    prices: fest.priceMap(),
    defaults: fest.DEFAULT_PRICE_YUAN,
  })
})

app.put(
  '/api/traffic/v1/admin/festival-ui',
  wrap((req, res) => {
    const b = req.body || {}
    const fest = require('./services/festivalTicketService')
    const patch = {
      festival: {
        registerEnabled:
          b.registerEnabled !== false && b.registerEnabled !== 0 && b.registerEnabled !== '0',
      },
    }
    if (b.prices && typeof b.prices === 'object') {
      const nextPrices = { ...(fest.DEFAULT_PRICE_YUAN || {}) }
      Object.keys(nextPrices).forEach((id) => {
        const v = Number(b.prices[id])
        if (Number.isFinite(v) && v > 0) nextPrices[id] = v
      })
      // 未单独配联报时，用两日之和
      if (!(Number(b.prices.fest_adult_both) > 0)) {
        nextPrices.fest_adult_both = Number(
          (Number(nextPrices.fest_adult_28) + Number(nextPrices.fest_adult_29)).toFixed(2)
        )
      }
      if (!(Number(b.prices.fest_child_both) > 0)) {
        nextPrices.fest_child_both = Number(
          (Number(nextPrices.fest_child_28) + Number(nextPrices.fest_child_29)).toFixed(2)
        )
      }
      patch.festival.prices = nextPrices
    }
    const next = require('./services/opsService').saveOps(patch)
    const prices = fest.priceMap()
    let htmlSync = null
    if (patch.festival && patch.festival.prices) {
      try {
        htmlSync = require('./services/festivalHtmlPriceSync').syncFestivalHtmlPrices(prices)
      } catch (e) {
        htmlSync = { error: (e && e.message) || 'html sync failed' }
        console.warn('[festival-ui] html price sync', e && e.message)
      }
    }
    ok(res, {
      registerEnabled: next.festival.registerEnabled !== false,
      prices,
      htmlSync,
    })
  })
)

/** —— 运营风控 / 内容 / 渠道 / 履约 —— */
app.get(
  '/api/traffic/v1/admin/risk',
  wrap(async (_req, res) => {
    ok(res, await opsService.riskSnapshotAsync())
  })
)

app.put('/api/traffic/v1/admin/risk', wrap(async (req, res) => {
  const b = req.body || {}
  const patch = {
    risk: {
      dailyIncentiveBudgetCent:
        b.dailyIncentiveBudgetCent != null
          ? Number(b.dailyIncentiveBudgetCent)
          : adminService.yuanToCent(b.dailyBudgetYuan),
      monthlyIncentiveBudgetCent:
        b.monthlyIncentiveBudgetCent != null
          ? Number(b.monthlyIncentiveBudgetCent)
          : adminService.yuanToCent(b.monthlyBudgetYuan),
      perUserDailyRedeemLimit: Number(b.perUserDailyRedeemLimit),
      perUserDailyLotteryLimit: Number(b.perUserDailyLotteryLimit),
      bigPrizeDailyCap: Number(b.bigPrizeDailyCap),
      fuseEnabled: b.fuseEnabled !== false,
      haltOnBudgetExceed: b.haltOnBudgetExceed !== false,
      allowCashRedeem: b.allowCashRedeem !== false,
      allowLotteryPhysical: b.allowLotteryPhysical !== false,
    },
  }
  patch.monetize = {}
  if (b.iaaEnabled != null) patch.monetize.iaaEnabled = !!b.iaaEnabled
  if (b.energyPerYuan != null) {
    patch.monetize.energyPerYuan = Math.max(1, Number(b.energyPerYuan) || 1000)
    patch.monetize.pointsToYuanRate = 1 / patch.monetize.energyPerYuan
  }
  if (b.lotteryEnergyCost != null) {
    patch.monetize.lotteryEnergyCost = Math.max(0, Number(b.lotteryEnergyCost) || 0)
  }
  if (!Object.keys(patch.monetize).length) delete patch.monetize
  await dbMod.runSync(() => {
    opsService.saveOps(patch)
    // 同步到已发布草稿 game.economy，便于 bootstrap
    try {
      const draft = configService.getDraft() || configService.getPublished() || {}
      if (!draft.game) draft.game = {}
      draft.game.economy = {
        ...(draft.game.economy || {}),
        energyPerYuan:
          (patch.monetize && patch.monetize.energyPerYuan) ||
          (draft.game.economy && draft.game.economy.energyPerYuan) ||
          1000,
        lotteryEnergyCost:
          (patch.monetize && patch.monetize.lotteryEnergyCost) != null
            ? patch.monetize.lotteryEnergyCost
            : (draft.game.economy && draft.game.economy.lotteryEnergyCost) != null
              ? draft.game.economy.lotteryEnergyCost
              : 50,
      }
      configService.saveDraft(draft)
    } catch (_) {}
  })
  ok(res, await opsService.riskSnapshotAsync())
}))

app.post('/api/traffic/v1/admin/risk/fuse', (req, res) => {
  const fused = !!(req.body && req.body.fused)
  ok(res, opsService.setFuse(fused, (req.body && req.body.reason) || ''))
})

app.get('/api/traffic/v1/admin/banners', (req, res) => {
  ok(res, { list: opsService.listBanners(req.query.pageKey || '', baseUrl(req)) })
})

app.put('/api/traffic/v1/admin/banners', (req, res) => {
  const r = opsService.upsertBanner({ ...(req.body || {}), _baseUrl: baseUrl(req) })
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r.item)
})

app.delete('/api/traffic/v1/admin/banners/:id', (req, res) => {
  ok(res, opsService.deleteBanner(req.params.id))
})

app.get('/api/traffic/v1/admin/copy', (_req, res) => {
  ok(res, { list: opsService.listCopy() })
})

app.put('/api/traffic/v1/admin/copy', (req, res) => {
  const r = opsService.upsertCopy(req.body || {})
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, { ok: true })
})

app.get(
  '/api/traffic/v1/admin/channels',
  wrap(async (_req, res) => {
    const [list, stats] = await Promise.all([
      opsService.listChannelsAsync(),
      opsService.channelStatsAsync(),
    ])
    ok(res, { list, stats })
  })
)

app.put('/api/traffic/v1/admin/channels', (req, res) => {
  const r = opsService.upsertChannel(req.body || {})
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, { ok: true })
})

app.get('/api/traffic/v1/admin/gifts', (_req, res) => {
  ok(res, { list: opsService.listGiftSkus() })
})

app.put('/api/traffic/v1/admin/gifts', (req, res) => {
  const r = opsService.upsertGiftSku(req.body || {})
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r.item || { ok: true })
})

app.post('/api/traffic/v1/admin/redeems/:id/ship', async (req, res) => {
  try {
    const r = await opsService.shipOrder(Number(req.params.id), {
      carrier: (req.body && req.body.carrier) || '',
      trackingNo: (req.body && req.body.trackingNo) || '',
    })
    if (!r.ok) return fail(res, 400, r.msg)
    ok(res, r)
  } catch (e) {
    console.error('[admin ship]', e && e.message)
    fail(res, 400, (e && e.message) || '发货失败')
  }
})

/** 核对：微信是否已开通发货管理 + 是否完成商户结算确认 + 订单详情 path */
app.get('/api/traffic/v1/admin/wx/trade-managed', async (req, res) => {
  try {
    const r = await require('./services/wxShippingService').tradeManagedStatus()
    ok(res, r)
  } catch (e) {
    console.error('[admin trade-managed]', e && e.message)
    fail(res, 400, (e && e.message) || '查询失败')
  }
})

/** 主动写入订单详情 path（等同后台「订单信息录入」） */
app.post('/api/traffic/v1/admin/wx/order-detail-path', async (req, res) => {
  try {
    const ship = require('./services/wxShippingService')
    const r = await ship.ensureMsgJumpPath({ force: true })
    const st = await ship.tradeManagedStatus()
    ok(res, { ensure: r, status: st })
  } catch (e) {
    console.error('[admin order-detail-path]', e && e.message)
    fail(res, 400, (e && e.message) || '设置失败')
  }
})

/** 运营台发起微信退款（记支出） */
app.post('/api/traffic/v1/admin/redeems/:id/refund', async (req, res) => {
  try {
    const [rows] = await dbMod.queryAsync(`SELECT * FROM redeem_order WHERE id=? LIMIT 1`, [
      Number(req.params.id),
    ])
    const order = rows && rows[0]
    if (!order) return fail(res, 404, '订单不存在')
    const wxPay = require('./services/wxPayService')
    const amountCent =
      req.body && req.body.amountCent != null
        ? Number(req.body.amountCent)
        : req.body && req.body.amountYuan != null
          ? adminService.yuanToCent(req.body.amountYuan)
          : undefined
    const r = await wxPay.createRefund({
      orderNo: order.order_no,
      amountCent,
      reason: (req.body && req.body.reason) || '运营退款',
    })
    if (!r.ok) return fail(res, 400, r.msg || '退款失败')
    ok(res, r)
  } catch (e) {
    console.error('[admin refund]', e.message)
    if (isBusyError(e)) return fail(res, 503, '服务繁忙，请稍后')
    fail(res, 400, e.message || '退款失败')
  }
})

app.get('/api/traffic/v1/admin/audit', (req, res) => {
  ok(
    res,
    opsService.listAudit({
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 50),
    })
  )
})

app.post('/api/traffic/v1/feedback', wrap((req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const fb = require('./services/feedbackService')
  try {
    ok(res, fb.submit(uid, req.body || {}))
  } catch (e) {
    fail(res, 400, (e && e.message) || '提交失败')
  }
}))

app.get('/api/traffic/v1/feedback/mine', wrap((req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, require('./services/feedbackService').listMine(uid, { limit: Number(req.query.limit || 20) }))
}))

app.get('/api/traffic/v1/admin/feedback', wrap(async (req, res) => {
  ok(
    res,
    await require('./services/feedbackService').adminListAsync({
      status: req.query.status || '',
      limit: Number(req.query.limit || 50),
      offset: Number(req.query.offset || 0),
    })
  )
}))

app.post('/api/traffic/v1/admin/feedback/:id/reply', wrap((req, res) => {
  try {
    const row = require('./services/feedbackService').adminReply(req.params.id, {
      reply: (req.body && req.body.reply) || '',
      status: (req.body && req.body.status) || 'replied',
    })
    ok(res, row)
  } catch (e) {
    fail(res, 400, (e && e.message) || '回复失败')
  }
}))

app.post('/api/traffic/v1/admin/feedback/:id/status', wrap((req, res) => {
  try {
    ok(
      res,
      require('./services/feedbackService').adminSetStatus(req.params.id, (req.body && req.body.status) || '')
    )
  } catch (e) {
    fail(res, 400, (e && e.message) || '更新失败')
  }
}))

app.get(
  '/api/traffic/v1/risk',
  wrap(async (_req, res) => {
    const payload = await opsService.clientRiskPayloadAsync()
    ok(res, payload)
  })
)

app.get('/', (_req, res) => {
  res.redirect('/qmyx/')
})

app.get('/api/traffic/v1/admin/health/db', wrap(async (_req, res) => {
  const [[pingRows], [draftRows], [productRows]] = await Promise.all([
    dbMod.queryAsync('SELECT 1 AS ok'),
    dbMod.queryAsync('SELECT version, LENGTH(payload_json) AS n FROM config_draft WHERE id=1'),
    dbMod.queryAsync('SELECT COUNT(*) AS n FROM product'),
  ])
  const row = pingRows && pingRows[0]
  const draft = draftRows && draftRows[0]
  const products = productRows && productRows[0]
  ok(res, {
    dialect: dbMod.DIALECT,
    ping: row && row.ok === 1,
    draftVersion: draft && draft.version,
    draftBytes: draft && draft.n,
    productCount: products && products.n,
  })
}))

app.use((err, req, res, _next) => {
  console.error('[api:unhandled]', req.method, req.path, err && err.message)
  if (res.headersSent) return
  if (isBusyError(err)) return fail(res, 503, '服务繁忙，请稍后')
  fail(res, 500, (err && err.message) || '服务器错误')
})

function gracefulShutdown(signal) {
  if (_shuttingDown) return
  _shuttingDown = true
  console.log(`[shutdown] ${signal} received`)
  const done = () => {
    Promise.resolve(dbMod.closePool ? dbMod.closePool() : null)
      .catch(() => {})
      .finally(() => process.exit(0))
  }
  if (_httpServer) {
    _httpServer.close(() => done())
    setTimeout(done, 8000).unref()
  } else {
    done()
  }
}

function startServer() {
  // 必须 0.0.0.0，否则探针打 Pod IP 会 connection refused
  const host = process.env.CMS_BIND_HOST || '0.0.0.0'
  const deferBootMs = Math.max(0, Number(process.env.CMS_DEFER_BOOT_MS || 2500))
  _httpServer = app.listen(PORT, host, () => {
    console.log(`traffic-cms 运行在 http://${host}:${PORT}`)
    console.log(`运营台 http://127.0.0.1:${PORT}/qmyx/`)
    console.log(`公网/云托管见 deploy/CLOUD_HOSTING.md ；本地反代见 deploy/nginx-qmyx.conf.example`)
    console.log(`COS_MODE=${cos.MODE}`)
    try {
      const wx = require('./services/wxAuth')
      console.log(
        `wxAuth=${wx.BUILD_STAMP} cloud=${wx.inCloudContainer()} openApi=${wx.openApiBase()} build=${process.env.BUILD_ID || process.env.GIT_COMMIT || 'dev'}`
      )
    } catch (e) {
      console.warn('[boot] wxAuth stamp fail', e.message)
    }
    // 先让 Liveness/Readiness 通，再异步连库
    setTimeout(() => {
      bootDb(1).catch((e) => console.error('[boot] db', e && e.message))
    }, deferBootMs)
    const expireMs = Math.max(60, Number(process.env.ORDER_EXPIRE_INTERVAL_SEC || 300)) * 1000
    setInterval(() => {
      if (!dbBooted || _shuttingDown) return
      if (typeof dbMod.isCircuitOpen === 'function' && dbMod.isCircuitOpen()) return
      dbMod
        .runSync(() => commerceService.closeExpiredUnpaidOrders({ limit: 20 }))
        .then((r) => {
          if (r && r.closed) console.log('[orders] closed unpaid', r.closed)
        })
        .catch((e) => {
          if (e && e.code === 'DB_BUSY') return
          console.warn('[orders] expire job', e && e.message)
        })
    }, expireMs)
  })
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
}

/** entry.js 可只取 app；直接 node server.js 则自行 listen */
module.exports = { app, startServer, bootDb, get dbBooted() { return dbBooted } }

if (require.main === module || process.env.CMS_AUTO_START === '1') {
  startServer()
}

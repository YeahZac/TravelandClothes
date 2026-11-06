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
try {
  dbMod.open()
} catch (e) {
  console.error('[db] 启动失败:', e.message)
  process.exit(1)
}

app.use(cors())
app.use(
  express.json({
    limit: '4mb',
    verify: (req, _res, buf) => {
      if (req.originalUrl && req.originalUrl.includes('/pay/wx/notify')) {
        req.rawBody = buf
      }
    },
  })
)
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

/** 同步业务包装：把 deasync/SQL 异常收成 JSON，避免 Express 默认 HTML 500 */
function wrap(handler) {
  return (req, res, next) => {
    try {
      const out = handler(req, res, next)
      if (out && typeof out.then === 'function') {
        out.catch((e) => {
          console.error('[api]', req.method, req.path, e && e.message)
          if (!res.headersSent) fail(res, 500, (e && e.message) || '服务器错误')
        })
      }
    } catch (e) {
      console.error('[api]', req.method, req.path, e && e.message)
      if (!res.headersSent) fail(res, 500, (e && e.message) || '服务器错误')
    }
  }
}

function authUser(req) {
  const h = req.get('authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token || (req.body && req.body.token)
  return authService.userFromToken(token)
}

function requireUser(req, res) {
  const uid = authUser(req)
  if (!uid) {
    fail(res, 401, '未登录或 token 无效')
    return null
  }
  return uid
}

app.get('/ping', (_req, res) => {
  ok(res, {
    status: 'ok',
    service: 'traffic-cms',
    cosMode: cos.MODE,
    dialect: dbMod.DIALECT,
    db: dbMod.DIALECT === 'mysql' ? process.env.DB_NAME || 'travel_clothes' : dbMod.DB_PATH,
    build: process.env.BUILD_ID || process.env.GIT_COMMIT || 'dev',
  })
})

/** 轻量版本探测 —— 前端缓存失效依据 */
app.get('/api/traffic/v1/meta', (req, res) => {
  const m = configService.meta(baseUrl(req))
  if (!m) return fail(res, 503, '尚未发布配置')
  ok(res, m)
})

/** 小程序启动：全量壳层；?version= 相同则 304 */
app.get('/api/traffic/v1/bootstrap', (req, res) => {
  const published = configService.getPublished()
  if (!published) return fail(res, 503, '尚未发布配置')
  const clientVer = String(req.query.version || '')
  if (clientVer && clientVer === String(published.version)) {
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
  const catalog = adminService.catalogForClient(baseUrl(req))
  cfg.catalog = catalog
  if (!cfg.game) cfg.game = {}
  if (!cfg.game.lottery) cfg.game.lottery = catalog.lottery
  // 异步预热首屏常见图，不改 URL
  try {
    mediaService.warmKeysAsync(mediaService.collectKeysFromValue({ pages: cfg.pages, catalog }))
  } catch (_) {}
  let risk = null
  try {
    risk = require('./services/opsService').clientRiskPayload()
    cfg.risk = risk
  } catch (e) {}
  ok(res, {
    config: cfg,
    catalog,
    risk,
    meta: configService.meta(baseUrl(req)),
    platform: req.query.platform || 'mp-weixin',
    channel: req.query.channel || 'organic',
  })
})

app.get('/api/traffic/v1/config/:pageKey', (req, res) => {
  const published = configService.getPublished()
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

app.get('/api/traffic/v1/assets/manifest', (req, res) => {
  const man = configService.assetManifest()
  const m = configService.meta(baseUrl(req))
  ok(res, { ...man, meta: m })
})

/** 登录（多端 code → token） */
app.get('/api/traffic/v1/legal', (_req, res) => {
  ok(res, require('./services/legalService').listPublic())
})

app.get('/api/traffic/v1/legal/:docId', (req, res) => {
  const doc = require('./services/legalService').getPublic(req.params.docId)
  if (!doc) return fail(res, 404, '协议不存在')
  ok(res, doc)
})

app.post('/api/traffic/v1/auth/login', async (req, res) => {
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
      cloudOpenid,
      cloudUnionid,
      agreeLegal: body.agreeLegal,
      tosVersion: body.tosVersion,
      privacyVersion: body.privacyVersion,
    })
    ok(res, data)
  } catch (e) {
    fail(res, 400, e.message || '登录失败')
  }
})

app.post('/api/traffic/v1/auth/logout', (req, res) => {
  const h = req.get('authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.body && req.body.token) || ''
  authService.revokeToken(token)
  ok(res, { ok: true })
})

app.post('/api/traffic/v1/auth/profile', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const body = req.body || {}
  const data = authService.updateProfile(uid, {
    nickName: body.nickName || body.nickname,
    avatarUrl: body.avatarUrl || body.avatar_url,
  })
  ok(res, data)
})

app.get('/api/traffic/v1/auth/wx-meta', (_req, res) => {
  const cfg = authService.wxConfig()
  ok(res, {
    appId: cfg.appId,
    secretConfigured: !!cfg.secret,
    allowDemo: cfg.allowDemo,
  })
})

app.get('/api/traffic/v1/me', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const data = authService.me(uid)
  if (!data) return fail(res, 404, '用户不存在')
  ok(res, data)
})

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
app.post('/api/traffic/v1/checkin', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const r = require('./services/checkinService').checkin(uid)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.get('/api/traffic/v1/checkin/status', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, require('./services/checkinService').status(uid))
})

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
app.get('/api/traffic/v1/invite/summary', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, require('./services/inviteService').summary(uid))
})

app.post('/api/traffic/v1/invite/unlock', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, require('./services/inviteService').unlockDue(uid))
})

app.post('/api/traffic/v1/invite/bind', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const code = (req.body && (req.body.inviteCode || req.body.invite)) || ''
  const r = require('./services/inviteService').tryBind(uid, code)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

/** P2：微信运动 */
app.get('/api/traffic/v1/steps/status', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, require('./services/stepsService').status(uid))
})

app.post('/api/traffic/v1/steps/sync', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const r = require('./services/stepsService').sync(uid, req.body || {})
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/steps/claim', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const actionId = (req.body && req.body.actionId) || ''
  const r = require('./services/stepsService').claim(uid, actionId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
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
app.get('/api/traffic/v1/admin/config', (req, res) => {
  ok(res, {
    draft: configService.absolutize(configService.getDraft()),
    published: configService.absolutize(configService.getPublished()),
  })
})

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
    const put = await Promise.resolve(
      cos.putObject({
        key,
        buffer: compressed.buffer,
        mime: compressed.mime,
        originalName: safe,
      })
    )
    const storagePath = mediaUrl.toStoragePath(put.path) || `/uploads/${put.cosKey}`
    const proxyUrl = mediaUrl.adminProxyUrl(storagePath)
    configService.registerAsset({
      cosKey: put.cosKey,
      purpose: folder,
      mime: put.mime,
      bytes: put.bytes,
      etag: put.etag,
    })
    if (req.body && req.body.iconId) {
      adminService.upsertIcon({
        id: req.body.iconId,
        label: req.body.iconLabel || req.body.iconId,
        purpose: folder,
        path: storagePath,
      })
    }
    // 预热缓存，方便立刻预览
    mediaService.warmKeysAsync([put.cosKey])
    ok(res, {
      // 入库用相对路径；预览用同域代理（勿写公网 CDN）
      path: storagePath,
      url: proxyUrl,
      proxyUrl,
      cosKey: put.cosKey,
      etag: put.etag,
      folder,
      mode: put.mode,
      bytes: put.bytes || compressed.bytes,
      originalBytes: req.file.size,
      compressed: !!compressed.compressed,
    })
  } catch (e) {
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
app.get('/api/traffic/v1/admin/stats', (_req, res) => {
  ok(res, adminService.statsOverview())
})

app.get('/api/traffic/v1/admin/users', (req, res) => {
  ok(
    res,
    adminService.listUsers({
      q: req.query.q || '',
      status: req.query.status || '',
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 20),
    })
  )
})

app.patch('/api/traffic/v1/admin/users/:id', (req, res) => {
  const r = adminService.updateUser(Number(req.params.id), req.body || {})
  if (!r.ok) return fail(res, 404, r.msg)
  ok(res, r.user)
})

app.get(
  '/api/traffic/v1/admin/products',
  wrap((req, res) => {
    ok(res, { list: adminService.listProducts(baseUrl(req)) })
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

app.get('/api/traffic/v1/admin/lottery', (_req, res) => {
  ok(res, { list: adminService.listLottery() })
})

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

app.get('/api/traffic/v1/admin/tasks', (_req, res) => {
  ok(res, { list: adminService.listTasks() })
})

app.put('/api/traffic/v1/admin/tasks', (req, res) => {
  const r = adminService.upsertTask(req.body || {})
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, { ok: true })
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

app.get('/api/traffic/v1/admin/redeems', (req, res) => {
  ok(
    res,
    adminService.listRedeems({
      status: req.query.status || '',
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 30),
    })
  )
})

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

app.get('/api/traffic/v1/admin/finance', (req, res) => {
  ok(
    res,
    adminService.listFinance({
      entryType: req.query.entryType || '',
      from: req.query.from || '',
      to: req.query.to || '',
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 50),
    })
  )
})

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

/** 客户端 catalog / 抽奖 / 任务 / 下单（与后台数据互通） */
app.get('/api/traffic/v1/catalog', (req, res) => {
  ok(res, adminService.catalogForClient(baseUrl(req)))
})

app.post('/api/traffic/v1/lottery/draw', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const r = adminService.drawLottery(uid)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/tasks/complete', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const taskId = (req.body && req.body.taskId) || ''
  if (!taskId) return fail(res, 400, '缺少 taskId')
  const r = adminService.completeTask(uid, taskId)
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.post('/api/traffic/v1/orders/create', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const r = commerceService.placeOrder(uid, req.body || {})
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
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

/** 小程序调起支付：返回 wx.requestPayment 参数 */
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
    fail(res, 400, e.message || '预下单失败')
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

app.get('/api/traffic/v1/me/orders', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(
    res,
    commerceService.listOrders(uid, {
      status: req.query.status || '',
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 20),
    })
  )
})

app.get('/api/traffic/v1/me/orders/:id', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const order =
    commerceService.getOrderById(uid, Number(req.params.id)) ||
    commerceService.getOrderByNo(uid, req.params.id)
  if (!order) return fail(res, 404, '订单不存在')
  ok(res, order)
})

app.post('/api/traffic/v1/me/orders/:id/cancel', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const r = commerceService.cancelOrder(uid, Number(req.params.id))
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
})

app.get('/api/traffic/v1/me/addresses', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  ok(res, { list: commerceService.listAddresses(uid) })
})

app.put('/api/traffic/v1/me/addresses', (req, res) => {
  const uid = requireUser(req, res)
  if (!uid) return
  const r = commerceService.saveAddress(uid, req.body || {})
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r.address)
})

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

app.get('/api/traffic/v1/gifts', (_req, res) => {
  ok(res, { list: commerceService.listGifts() })
})

/** —— 运营风控 / 内容 / 渠道 / 履约 —— */
app.get('/api/traffic/v1/admin/risk', (_req, res) => {
  ok(res, opsService.riskSnapshot())
})

app.put('/api/traffic/v1/admin/risk', (req, res) => {
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
  if (b.iaaEnabled != null) {
    patch.monetize = { iaaEnabled: !!b.iaaEnabled }
  }
  opsService.saveOps(patch)
  ok(res, opsService.riskSnapshot())
})

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

app.get('/api/traffic/v1/admin/channels', (_req, res) => {
  ok(res, { list: opsService.listChannels(), stats: opsService.channelStats() })
})

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

app.post('/api/traffic/v1/admin/redeems/:id/ship', (req, res) => {
  const r = opsService.shipOrder(Number(req.params.id), {
    carrier: (req.body && req.body.carrier) || '',
    trackingNo: (req.body && req.body.trackingNo) || '',
  })
  if (!r.ok) return fail(res, 400, r.msg)
  ok(res, r)
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

app.get('/api/traffic/v1/risk', (_req, res) => {
  ok(res, opsService.clientRiskPayload())
})

app.get('/', (_req, res) => {
  res.redirect('/qmyx/')
})

app.get('/api/traffic/v1/admin/health/db', wrap((_req, res) => {
  const d = dbMod.open()
  const row = d.prepare('SELECT 1 AS ok').get()
  const draft = d.prepare('SELECT version, LENGTH(payload_json) AS n FROM config_draft WHERE id=1').get()
  const products = d.prepare('SELECT COUNT(*) AS n FROM product').get()
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
  if (!res.headersSent) fail(res, 500, (err && err.message) || '服务器错误')
})

app.listen(PORT, () => {
  console.log(`traffic-cms 运行在 http://127.0.0.1:${PORT}`)
  console.log(`运营台 http://127.0.0.1:${PORT}/qmyx/`)
  const dbInfo = require('./db')
  console.log(`db dialect=${dbInfo.DIALECT} path/host=${dbInfo.DIALECT === 'mysql' ? process.env.DB_HOST : dbInfo.DB_PATH}`)
  console.log(`公网/云托管见 deploy/CLOUD_HOSTING.md ；本地反代见 deploy/nginx-qmyx.conf.example`)
  console.log(`COS_MODE=${cos.MODE}`)
})

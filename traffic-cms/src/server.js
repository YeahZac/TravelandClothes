const path = require('path')
const fs = require('fs')
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const { validateConfig } = require('./validate')
const cos = require('./cos')
const dbMod = require('./db')
const configService = require('./services/configService')
const authService = require('./services/authService')
const jarService = require('./services/jarService')

const app = express()
const PORT = process.env.PORT || 3100
const ROOT = path.join(__dirname, '..')

cos.ensureFolderTree()
try {
  dbMod.open()
  console.log(`[db] SQLite ready → ${dbMod.DB_PATH}`)
} catch (e) {
  console.error('[db] 启动失败:', e.message)
  process.exit(1)
}

app.use(cors())
app.use(express.json({ limit: '4mb' }))
app.use('/uploads', express.static(cos.UPLOAD_ROOT))
app.use('/admin', express.static(path.join(ROOT, 'public/admin')))

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
  ok(res, { status: 'ok', service: 'traffic-cms', cosMode: cos.MODE, db: dbMod.DB_PATH })
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
  const cfg = configService.absolutize(published, baseUrl(req))
  ok(res, {
    config: cfg,
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
  const slice = configService.absolutize(
    {
      version: published.version,
      brand: published.brand,
      pageKey: req.params.pageKey,
      page,
      dicts: published.dicts,
      assets: published.assets,
      copy: published.copy,
      game: published.game,
    },
    baseUrl(req)
  )
  ok(res, slice)
})

app.get('/api/traffic/v1/assets/manifest', (req, res) => {
  const man = configService.assetManifest()
  const m = configService.meta(baseUrl(req))
  ok(res, { ...man, meta: m })
})

/** 登录（多端 code → token） */
app.post('/api/traffic/v1/auth/login', (req, res) => {
  const body = req.body || {}
  const data = authService.login({
    platform: body.platform || 'mp-weixin',
    code: body.code || 'demo',
  })
  ok(res, data)
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
  ok(res, jarService.saveSubscribe(uid, (req.body && req.body.grants) || []))
})

/** —— Admin —— */
app.get('/api/traffic/v1/admin/config', (req, res) => {
  ok(res, {
    draft: configService.absolutize(configService.getDraft(), baseUrl(req)),
    published: configService.absolutize(configService.getPublished(), baseUrl(req)),
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

app.post('/api/traffic/v1/admin/publish', (req, res) => {
  const draft = configService.getDraft()
  const check = validateConfig(draft)
  if (!check.ok) return fail(res, 400, check.errors.join('; '))
  const published = configService.publish()
  ok(res, { version: published.version, publishedAt: published.publishedAt }, '已发布')
})

app.post('/api/traffic/v1/admin/upload', upload.single('file'), (req, res) => {
  if (!req.file) return fail(res, 400, '未收到文件')
  const folder = (req.body && req.body.folder) || 'icons'
  const safe = (req.file.originalname || 'bin').replace(/[^\w.\-]+/g, '_')
  const key = `qmyx/${folder}/${Date.now()}_${safe}`
  const put = cos.putObject({
    key,
    buffer: req.file.buffer,
    mime: req.file.mimetype,
    originalName: safe,
  })
  configService.registerAsset({
    cosKey: put.cosKey,
    purpose: folder,
    mime: put.mime,
    bytes: put.bytes,
    etag: put.etag,
  })
  ok(res, {
    path: put.path,
    url: `${baseUrl(req)}${put.path}`,
    cosKey: put.cosKey,
    etag: put.etag,
    folder,
  })
})

app.get('/', (_req, res) => {
  res.redirect('/admin/')
})

app.listen(PORT, () => {
  console.log(`traffic-cms 运行在 http://127.0.0.1:${PORT}`)
  console.log(`管理页 http://127.0.0.1:${PORT}/admin/`)
  console.log(`COS_MODE=${cos.MODE}  uploads=${cos.UPLOAD_ROOT}`)
})

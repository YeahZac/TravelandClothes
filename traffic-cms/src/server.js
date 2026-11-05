const path = require('path')
const fs = require('fs')
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const store = require('./store')
const { validateConfig } = require('./validate')

const app = express()
const PORT = process.env.PORT || 3100
const ROOT = path.join(__dirname, '..')
const UPLOADS = path.join(ROOT, 'uploads')

if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true })

app.use(cors())
app.use(express.json({ limit: '4mb' }))
app.use('/uploads', express.static(UPLOADS))
app.use('/admin', express.static(path.join(ROOT, 'public/admin')))

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\-]+/g, '_')
      cb(null, `${Date.now()}_${safe}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
})

function baseUrl(req) {
  const host = req.get('host')
  const proto = req.protocol || 'http'
  return `${proto}://${host}`
}

app.get('/ping', (_req, res) => {
  res.json({ code: 0, data: { status: 'ok', service: 'traffic-cms' }, msg: 'ok' })
})

/** 小程序启动：完整壳层配置 */
app.get('/api/traffic/v1/bootstrap', (req, res) => {
  const published = store.getPublished()
  if (!published) {
    return res.status(503).json({ code: 503, msg: '尚未发布配置', data: null })
  }
  const cfg = store.absolutize(published, baseUrl(req))
  res.json({
    code: 0,
    msg: 'ok',
    data: {
      config: cfg,
      platform: req.query.platform || 'mp-weixin',
      channel: req.query.channel || 'organic',
    },
  })
})

app.get('/api/traffic/v1/config/:pageKey', (req, res) => {
  const published = store.getPublished()
  if (!published) {
    return res.status(503).json({ code: 503, msg: '尚未发布配置', data: null })
  }
  const page = published.pages && published.pages[req.params.pageKey]
  if (!page) {
    return res.status(404).json({ code: 404, msg: 'page 不存在', data: null })
  }
  const slice = store.absolutize(
    {
      version: published.version,
      brand: published.brand,
      pageKey: req.params.pageKey,
      page,
      dicts: published.dicts,
      assets: published.assets,
      copy: published.copy,
    },
    baseUrl(req)
  )
  res.json({ code: 0, msg: 'ok', data: slice })
})

app.get('/api/traffic/v1/admin/config', (req, res) => {
  const draft = store.getDraft()
  res.json({
    code: 0,
    msg: 'ok',
    data: {
      draft: store.absolutize(draft, baseUrl(req)),
      published: store.absolutize(store.getPublished(), baseUrl(req)),
    },
  })
})

app.put('/api/traffic/v1/admin/config', (req, res) => {
  const body = req.body && (req.body.config || req.body)
  const check = validateConfig(body)
  if (!check.ok) {
    return res.status(400).json({ code: 400, msg: check.errors.join('; '), data: null })
  }
  // 存相对路径，便于迁移环境
  const normalized = JSON.parse(
    JSON.stringify(body).replace(
      new RegExp(`${baseUrl(req).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/uploads/`, 'g'),
      '/uploads/'
    )
  )
  store.saveDraft(normalized)
  res.json({ code: 0, msg: '草稿已保存', data: { version: normalized.version } })
})

app.post('/api/traffic/v1/admin/publish', (req, res) => {
  const draft = store.getDraft()
  const check = validateConfig(draft)
  if (!check.ok) {
    return res.status(400).json({ code: 400, msg: check.errors.join('; '), data: null })
  }
  const published = store.publish()
  res.json({
    code: 0,
    msg: '已发布',
    data: { version: published.version, publishedAt: published.publishedAt },
  })
})

app.post('/api/traffic/v1/admin/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ code: 400, msg: '未收到文件', data: null })
  }
  const rel = `/uploads/${req.file.filename}`
  res.json({
    code: 0,
    msg: 'ok',
    data: { path: rel, url: `${baseUrl(req)}${rel}` },
  })
})

app.get('/', (_req, res) => {
  res.redirect('/admin/')
})

app.listen(PORT, () => {
  console.log(`traffic-cms 运行在 http://127.0.0.1:${PORT}`)
  console.log(`管理页 http://127.0.0.1:${PORT}/admin/`)
})

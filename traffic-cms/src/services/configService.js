const fs = require('fs')
const path = require('path')
const dbMod = require('../db')
const cos = require('../cos')

const ROOT = path.join(__dirname, '../..')
const DATA = path.join(ROOT, 'data')

function syncJsonMirror(kind, payload) {
  try {
    const file = path.join(DATA, kind === 'published' ? 'published.json' : 'draft.json')
    if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true })
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8')
  } catch (e) {
    // 云托管只读盘或权限问题时，库内草稿仍有效，不阻断发布
    console.warn('[config] json mirror skip:', e.message)
  }
}

/** 版本号递增：优先整数主版本，避免 Number('6.2')+1 → 7.2 */
function nextVersion(v) {
  const s = String(v == null ? '0' : v).trim()
  if (/^\d+$/.test(s)) return String(Number(s) + 1)
  const m = /^(\d+)(?:\.(\d+))?/.exec(s)
  if (m) {
    const major = Number(m[1] || 0)
    const minor = m[2] != null ? Number(m[2]) : null
    if (minor != null && Number.isFinite(minor)) return `${major}.${minor + 1}`
    return String(major + 1)
  }
  return '1'
}

/** 发布配置内存缓存：DB 抖动时仍能 200 响应 bootstrap/meta，避免整站掉进小程序 fallback */
let publishedMem = { at: 0, cfg: null }
const PUBLISHED_TTL_MS = Math.max(2000, Number(process.env.PUBLISHED_CACHE_TTL_MS || 15000))

/** 镜像文件兜底（云托管镜像内带 published.json；库未就绪时仍可给小程序壳层） */
function loadPublishedFromFile() {
  try {
    const file = path.join(DATA, 'published.json')
    if (!fs.existsSync(file)) return null
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!cfg || typeof cfg !== 'object') return null
    const next = ensureQuickGridDefaults(cfg)
    next.__source = 'file-fallback'
    return next
  } catch (e) {
    console.warn('[config] loadPublishedFromFile', e && e.message)
    return null
  }
}

function cachePublished(cfg) {
  if (!cfg) return null
  const next = ensureQuickGridDefaults(cfg)
  publishedMem = { at: Date.now(), cfg: next }
  return next
}

function getPublished() {
  const now = Date.now()
  if (publishedMem.cfg && now - publishedMem.at < PUBLISHED_TTL_MS) return publishedMem.cfg
  try {
    const db = dbMod.open()
    const row = db.prepare('SELECT version, payload_json, published_at FROM config_published WHERE id = 1').get()
    if (!row) {
      const fileCfg = publishedMem.cfg || loadPublishedFromFile()
      return fileCfg ? cachePublished(fileCfg) : null
    }
    const cfg = JSON.parse(row.payload_json)
    cfg.version = row.version
    cfg.publishedAt = row.published_at
    return cachePublished(cfg)
  } catch (e) {
    console.warn('[config] getPublished fallback', e && e.message)
    if (publishedMem.cfg) return publishedMem.cfg
    const fileCfg = loadPublishedFromFile()
    if (fileCfg) return cachePublished(fileCfg)
    throw e
  }
}

/** async：禁止在 await 路由里用 sync getPublished（deasync） */
async function getPublishedAsync() {
  const now = Date.now()
  if (publishedMem.cfg && now - publishedMem.at < PUBLISHED_TTL_MS) return publishedMem.cfg
  try {
    const [rows] = await dbMod.queryAsync(
      'SELECT version, payload_json, published_at FROM config_published WHERE id = 1'
    )
    const row = rows && rows[0]
    if (!row) return publishedMem.cfg || loadPublishedFromFile()
    const cfg = JSON.parse(row.payload_json)
    cfg.version = row.version
    cfg.publishedAt = row.published_at
    return cachePublished(cfg)
  } catch (e) {
    console.warn('[config] getPublishedAsync', e && e.message)
    if (publishedMem.cfg) return publishedMem.cfg
    const fileCfg = loadPublishedFromFile()
    return fileCfg ? cachePublished(fileCfg) : null
  }
}

async function warmPublishedAsync() {
  const cfg = await getPublishedAsync()
  if (cfg) return cfg
  return loadPublishedFromFile()
}

function invalidatePublishedCache() {
  publishedMem = { at: 0, cfg: null }
}

const DEFAULT_QUICK_ITEMS = [
  {
    id: 'q_lottery',
    name: '幸运抽奖',
    iconKey: 'lottery',
    iconUrl: '',
    linkKey: 'lottery',
    enabled: true,
    sortOrder: 0,
    remark: '首页黄金位默认',
  },
  {
    id: 'q_gift',
    name: '兑好礼',
    iconKey: 'gift',
    iconUrl: '',
    linkKey: 'gift',
    enabled: true,
    sortOrder: 1,
    remark: '首页黄金位默认',
  },
  {
    id: 'q_steps',
    name: '换步数',
    iconKey: 'steps',
    iconUrl: '',
    linkKey: 'energy',
    enabled: true,
    sortOrder: 2,
    remark: '首页黄金位默认',
  },
  {
    id: 'q_invite',
    name: '邀好友',
    iconKey: 'invite',
    iconUrl: '',
    linkKey: 'invite',
    enabled: true,
    sortOrder: 3,
    remark: '首页黄金位默认',
  },
]

const ENTRY_PATH_TO_LINK = {
  '/pages/gift/list': 'gift',
  '/pages/lottery/index': 'lottery',
  '/pages/invite/index': 'invite',
  '/pages/energy/index': 'energy',
  '/pages/steps/history': 'energy',
}

/**
 * 以首页四宫格（黄金位）名称为准，同步其它入口（我的菜单 / 任务列表等）同 linkKey 的展示名。
 * 避免「兑好礼」入口内页却写「兑礼中心」这类分裂文案。
 */
function syncEntryTitlesFromQuickGrid(cfg) {
  if (!cfg || typeof cfg !== 'object') return cfg
  if (!cfg.pages) return cfg
  const mods = (cfg.pages.home && cfg.pages.home.modules) || []
  const quick = mods.find((m) => m && (m.id === 'home_quick' || m.type === 'quick_grid'))
  const items = (quick && quick.payload && quick.payload.items) || []
  const byKey = {}
  items.forEach((it) => {
    if (!it) return
    const key = String(it.linkKey || '').trim()
    const name = String(it.name || it.title || '').trim()
    if (key && name) byKey[key] = name
  })
  if (!Object.keys(byKey).length) return cfg

  Object.keys(cfg.pages).forEach((pageKey) => {
    const page = cfg.pages[pageKey]
    if (!page || !Array.isArray(page.modules)) return
    page.modules.forEach((mod) => {
      if (!mod || !mod.payload || !Array.isArray(mod.payload.items)) return
      if (mod.type === 'quick_grid' || mod.id === 'home_quick') return
      mod.payload.items.forEach((it) => {
        if (!it) return
        let key = String(it.linkKey || '').trim()
        if (!key && it.path) {
          const p = String(it.path).split('?')[0]
          key = ENTRY_PATH_TO_LINK[p] || ''
        }
        if (!key && it.action) key = String(it.action).trim()
        const name = byKey[key]
        if (!name) return
        if (Object.prototype.hasOwnProperty.call(it, 'title') || it.title != null || mod.type === 'menu_group' || mod.type === 'task_list') {
          it.title = name
        }
        if (Object.prototype.hasOwnProperty.call(it, 'name') || it.name != null) {
          it.name = name
        }
      })
    })
  })
  return cfg
}

/** 首页四宫格为空时种入默认可改删项（不覆盖已有配置） */
function ensureQuickGridDefaults(cfg) {
  if (!cfg || typeof cfg !== 'object') return cfg
  if (!cfg.pages) cfg.pages = {}
  if (!cfg.pages.home) cfg.pages.home = { modules: [] }
  const mods = Array.isArray(cfg.pages.home.modules) ? cfg.pages.home.modules : []
  cfg.pages.home.modules = mods
  let mod = mods.find((m) => m && (m.id === 'home_quick' || m.type === 'quick_grid'))
  if (!mod) {
    mod = {
      id: 'home_quick',
      type: 'quick_grid',
      title: '',
      payload: { columns: 4, items: [] },
    }
    mods.unshift(mod)
  }
  if (!mod.payload) mod.payload = { columns: 4, items: [] }
  if (!Array.isArray(mod.payload.items) || !mod.payload.items.length) {
    mod.payload.items = DEFAULT_QUICK_ITEMS.map((x) => ({ ...x }))
  }
  return syncEntryTitlesFromQuickGrid(cfg)
}

function getDraft() {
  const db = dbMod.open()
  const row = db.prepare('SELECT version, payload_json FROM config_draft WHERE id = 1').get()
  if (!row) return ensureQuickGridDefaults(getPublished() || { pages: {} })
  const cfg = JSON.parse(row.payload_json)
  cfg.version = row.version
  return ensureQuickGridDefaults(cfg)
}

/** async：运营台 /admin/config 等路由禁止再走 sync getDraft（deasync 易占满连接） */
async function getDraftAsync() {
  try {
    const [rows] = await dbMod.queryAsync('SELECT version, payload_json FROM config_draft WHERE id = 1')
    const row = rows && rows[0]
    if (!row) {
      const pub = (await getPublishedAsync()) || { pages: {} }
      return ensureQuickGridDefaults(pub)
    }
    const cfg = JSON.parse(row.payload_json)
    cfg.version = row.version
    return ensureQuickGridDefaults(cfg)
  } catch (e) {
    console.warn('[config] getDraftAsync', e && e.message)
    try {
      return ensureQuickGridDefaults((await getPublishedAsync()) || { pages: {} })
    } catch (_) {
      return ensureQuickGridDefaults(loadPublishedFromFile() || { pages: {} })
    }
  }
}

function saveDraft(cfg) {
  ensureQuickGridDefaults(cfg)
  const db = dbMod.open()
  const now = dbMod.nowIso()
  const version = String(cfg.version || '0')
  const payload = JSON.stringify(cfg)
  db.prepare(
    `INSERT INTO config_draft (id, version, payload_json, updated_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET version=excluded.version, payload_json=excluded.payload_json, updated_at=excluded.updated_at`
  ).run(version, payload, now)
  syncJsonMirror('draft', cfg)
  return cfg
}

function writePublished(next) {
  const db = dbMod.open()
  const now = dbMod.nowIso()
  const payload = JSON.stringify(next)
  db.prepare(
    `INSERT INTO config_published (id, version, payload_json, published_at, updated_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET version=excluded.version, payload_json=excluded.payload_json,
       published_at=excluded.published_at, updated_at=excluded.updated_at`
  ).run(next.version, payload, next.publishedAt, now)
  try {
    db.prepare(
      `INSERT INTO config_history (version, payload_json, published_at) VALUES (?, ?, ?)`
    ).run(next.version, payload, next.publishedAt)
  } catch (_) {}
  syncJsonMirror('published', next)
  publishedMem = { at: Date.now(), cfg: ensureQuickGridDefaults(next) }
  return next
}

function publish() {
  const draft = ensureQuickGridDefaults(getDraft())
  if (!draft) throw new Error('无草稿可发布')
  const next = {
    ...draft,
    version: nextVersion(draft.version),
    publishedAt: dbMod.nowIso(),
  }
  writePublished(next)
  saveDraft(next)
  return next
}

/**
 * 商城商品保存后即时生效：把 mall goods_grid / catalog.products 写入已发布配置并升版本，
 * 无需运营再点「发布」。
 */
function publishMallSnapshot(mallItems) {
  const items = Array.isArray(mallItems) ? mallItems : []
  const draft = getDraft() || getPublished()
  if (!draft) throw new Error('无配置可写入')
  if (!draft.pages) draft.pages = {}
  if (!draft.pages.mall) draft.pages.mall = { modules: [] }
  const mods = draft.pages.mall.modules || []
  let idx = mods.findIndex((m) => m.type === 'goods_grid')
  if (idx < 0) {
    mods.push({
      id: 'mall_goods',
      type: 'goods_grid',
      title: '精选好物',
      payload: { items: [] },
    })
    idx = mods.length - 1
    draft.pages.mall.modules = mods
  }
  mods[idx].payload = mods[idx].payload || {}
  mods[idx].payload.items = items
  delete mods[idx].payload.categories
  if (!draft.catalog) draft.catalog = {}
  draft.catalog.products = items
  saveDraft(draft)

  const pub = getPublished() || { ...draft }
  if (!pub.pages) pub.pages = {}
  if (!pub.pages.mall) pub.pages.mall = { modules: [] }
  const pmods = pub.pages.mall.modules || []
  let pidx = pmods.findIndex((m) => m.type === 'goods_grid')
  if (pidx < 0) {
    pmods.push({
      id: 'mall_goods',
      type: 'goods_grid',
      title: '精选好物',
      payload: { items: [] },
    })
    pidx = pmods.length - 1
    pub.pages.mall.modules = pmods
  }
  pmods[pidx].payload = pmods[pidx].payload || {}
  pmods[pidx].payload.items = items
  delete pmods[pidx].payload.categories
  if (!pub.catalog) pub.catalog = {}
  pub.catalog.products = items
  pub.version = nextVersion(pub.version || draft.version || '0')
  pub.publishedAt = dbMod.nowIso()
  return writePublished(pub)
}

/**
 * 下发给小程序的配置：清空 /static；保留 /uploads/qmyx/... 相对路径（由 callContainer 媒体代理加载）
 * 禁止改写成 tcloudbase / CDN 公网直链。
 */
function absolutize(cfg) {
  if (!cfg) return cfg
  const raw = JSON.stringify(cfg)
  const replaced = raw
    .replace(/"\/static\/[^"]*"/g, '""')
    .replace(/"(\/cos\/[^"]+)"/g, (_, p) => {
      const key = p.replace(/^\/cos\//, '')
      return `"/uploads/${key.replace(/^\/+/, '')}"`
    })
    .replace(/"(qmyx\/[^"]+)"/g, (_, key) => `"/uploads/${key}"`)
  const cfg2 = JSON.parse(replaced)
  // 商城分类条（推荐/新品/节庆/低价）是壳层占位，商品表没有对应筛选，下发时去掉
  const mods = (((cfg2.pages || {}).mall || {}).modules) || []
  mods.forEach((m) => {
    if (m && m.type === 'goods_grid' && m.payload) delete m.payload.categories
  })
  return cfg2
}

function metaFromPub(pub, baseUrl) {
  if (!pub) return null
  const assetBase = cos.CDN_HOST || `${baseUrl}/uploads`
  return {
    version: String(pub.version),
    publishedAt: pub.publishedAt || null,
    assetBase,
    cdnHost: cos.CDN_HOST || null,
    cosMode: cos.MODE,
    degraded: pub.__source === 'file-fallback',
  }
}

function meta(baseUrl) {
  return metaFromPub(getPublished(), baseUrl)
}

async function metaAsync(baseUrl) {
  const pub = (await getPublishedAsync()) || loadPublishedFromFile()
  return metaFromPub(pub, baseUrl)
}

function registerAsset({ cosKey, purpose, mime, bytes, etag }) {
  const db = dbMod.open()
  db.prepare(
    `INSERT INTO asset_object (cos_key, purpose, mime, bytes, etag, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(cos_key) DO UPDATE SET purpose=excluded.purpose, mime=excluded.mime,
       bytes=excluded.bytes, etag=excluded.etag`
  ).run(cosKey, purpose || 'misc', mime || 'application/octet-stream', bytes || 0, etag || '', dbMod.nowIso())
}

/** async 路由专用：禁止在 await 之后调用同步 registerAsset（deasync 会打崩 Node20） */
async function registerAssetAsync({ cosKey, purpose, mime, bytes, etag }) {
  await dbMod.queryAsync(
    `INSERT INTO asset_object (cos_key, purpose, mime, bytes, etag, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(cos_key) DO UPDATE SET purpose=excluded.purpose, mime=excluded.mime,
       bytes=excluded.bytes, etag=excluded.etag`,
    [
      cosKey,
      purpose || 'misc',
      mime || 'application/octet-stream',
      bytes || 0,
      etag || '',
      dbMod.nowIso(),
    ]
  )
}

function assetManifest() {
  const db = dbMod.open()
  const rows = db.prepare(
    `SELECT cos_key, purpose, mime, bytes, etag, created_at FROM asset_object ORDER BY id DESC LIMIT 500`
  ).all()
  return {
    count: rows.length,
    items: rows.map((r) => ({
      key: r.cos_key,
      path: cos.relativeUrl(r.cos_key),
      purpose: r.purpose,
      mime: r.mime,
      bytes: r.bytes,
      etag: r.etag,
      createdAt: r.created_at,
    })),
  }
}

module.exports = {
  getPublished,
  getPublishedAsync,
  warmPublishedAsync,
  loadPublishedFromFile,
  invalidatePublishedCache,
  getDraft,
  getDraftAsync,
  saveDraft,
  publish,
  absolutize,
  meta,
  metaAsync,
  metaFromPub,
  registerAsset,
  registerAssetAsync,
  assetManifest,
  publishMallSnapshot,
  nextVersion,
  ensureQuickGridDefaults,
  DEFAULT_QUICK_ITEMS,
  syncEntryTitlesFromQuickGrid,
}

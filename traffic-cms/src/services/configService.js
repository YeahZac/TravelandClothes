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

function getPublished() {
  const db = dbMod.open()
  const row = db.prepare('SELECT version, payload_json, published_at FROM config_published WHERE id = 1').get()
  if (!row) return null
  const cfg = JSON.parse(row.payload_json)
  cfg.version = row.version
  cfg.publishedAt = row.published_at
  return cfg
}

function getDraft() {
  const db = dbMod.open()
  const row = db.prepare('SELECT version, payload_json FROM config_draft WHERE id = 1').get()
  if (!row) return getPublished()
  const cfg = JSON.parse(row.payload_json)
  cfg.version = row.version
  return cfg
}

function saveDraft(cfg) {
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

function publish() {
  const draft = getDraft()
  if (!draft) throw new Error('无草稿可发布')
  const next = {
    ...draft,
    version: nextVersion(draft.version),
    publishedAt: dbMod.nowIso(),
  }
  const db = dbMod.open()
  const now = dbMod.nowIso()
  const payload = JSON.stringify(next)
  db.prepare(
    `INSERT INTO config_published (id, version, payload_json, published_at, updated_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET version=excluded.version, payload_json=excluded.payload_json,
       published_at=excluded.published_at, updated_at=excluded.updated_at`
  ).run(next.version, payload, next.publishedAt, now)
  db.prepare(
    `INSERT INTO config_history (version, payload_json, published_at) VALUES (?, ?, ?)`
  ).run(next.version, payload, next.publishedAt)
  saveDraft(next)
  syncJsonMirror('published', next)
  return next
}

/** 把 /uploads|/cos 相对路径拼成绝对；优先 CDN */
function absolutize(cfg, baseUrl) {
  if (!cfg) return cfg
  const cdn = cos.CDN_HOST
  const raw = JSON.stringify(cfg)
  const replaced = raw
    .replace(/"(\/uploads\/[^"]+)"/g, (_, p) => {
      if (cdn && p.startsWith('/uploads/qmyx/')) {
        const key = p.replace(/^\/uploads\//, '')
        return `"${cdn}/${key}"`
      }
      return `"${baseUrl}${p}"`
    })
    .replace(/"(\/cos\/[^"]+)"/g, (_, p) => {
      const key = p.replace(/^\/cos\//, '')
      return `"${cos.publicUrl(key, baseUrl)}"`
    })
  return JSON.parse(replaced)
}

function meta(baseUrl) {
  const pub = getPublished()
  if (!pub) return null
  const assetBase =
    cos.CDN_HOST ||
    `${baseUrl}/uploads`
  return {
    version: String(pub.version),
    publishedAt: pub.publishedAt || null,
    assetBase,
    cdnHost: cos.CDN_HOST || null,
    cosMode: cos.MODE,
  }
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
  getDraft,
  saveDraft,
  publish,
  absolutize,
  meta,
  registerAsset,
  assetManifest,
}

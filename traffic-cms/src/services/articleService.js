/**
 * CMS 文章：公告列表 + Banner 跳转详情
 * blocks: [{ type: 'text'|'image'|'html', content|url }]
 */
const dbMod = require('../db')
const mediaUrl = require('../mediaUrl')

let schemaReady = false

function db() {
  return dbMod.open()
}
function now() {
  return dbMod.nowIso()
}

const CMS_ARTICLE_MYSQL = `CREATE TABLE IF NOT EXISTS cms_article (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  summary VARCHAR(512) NOT NULL DEFAULT '',
  tag VARCHAR(32) NOT NULL DEFAULT '',
  cover_url VARCHAR(512) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'on',
  sort_order INT NOT NULL DEFAULT 0,
  use_as_notice INT NOT NULL DEFAULT 0,
  blocks_json MEDIUMTEXT NOT NULL,
  published_at VARCHAR(40) NOT NULL DEFAULT '',
  updated_at VARCHAR(40) NOT NULL
)`

const CMS_ARTICLE_SQLITE = `CREATE TABLE IF NOT EXISTS cms_article (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'on',
  sort_order INTEGER NOT NULL DEFAULT 0,
  use_as_notice INTEGER NOT NULL DEFAULT 0,
  blocks_json TEXT NOT NULL DEFAULT '[]',
  published_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
)`

function ensureSchema() {
  if (schemaReady) return
  const d = db()
  d.prepare(dbMod.DIALECT === 'mysql' ? CMS_ARTICLE_MYSQL : CMS_ARTICLE_SQLITE).run()
  schemaReady = true
}

async function ensureSchemaAsync() {
  if (schemaReady) return
  await dbMod.queryAsync(dbMod.DIALECT === 'mysql' ? CMS_ARTICLE_MYSQL : CMS_ARTICLE_SQLITE)
  schemaReady = true
}

function sanitizeBlocks(raw) {
  let list = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch (_) {
      list = []
    }
  }
  if (!Array.isArray(list)) return []
  return list
    .map((b, i) => {
      const type = String((b && b.type) || '').toLowerCase()
      if (type === 'text') {
        return { type: 'text', content: String((b && b.content) || '').slice(0, 20000) }
      }
      if (type === 'image') {
        const url =
          mediaUrl.toStoragePath((b && (b.url || b.src || b.content)) || '') ||
          String((b && (b.url || b.src)) || '').trim()
        if (!url) return null
        return { type: 'image', url }
      }
      if (type === 'html' || type === 'code') {
        return { type: 'html', content: String((b && b.content) || '').slice(0, 50000) }
      }
      return null
    })
    .filter(Boolean)
    .slice(0, 80)
}

function mapRow(row, { withBlocks = true } = {}) {
  if (!row) return null
  const cover = mediaUrl.clientMediaPath(row.cover_url) || row.cover_url || ''
  const out = {
    id: row.id,
    title: row.title || '',
    summary: row.summary || '',
    tag: row.tag || '',
    coverUrl: cover,
    status: row.status || 'on',
    sortOrder: Number(row.sort_order) || 0,
    useAsNotice: !!Number(row.use_as_notice),
    publishedAt: require('./chinaDay').formatChinaDateTime(row.published_at),
    updatedAt: row.updated_at || '',
  }
  if (withBlocks) {
    const blocks = sanitizeBlocks(row.blocks_json)
    out.blocks = blocks.map((b) => {
      if (b.type === 'image') {
        return { type: 'image', url: mediaUrl.clientMediaPath(b.url) || b.url }
      }
      return b
    })
  }
  return out
}

function listAdmin() {
  ensureSchema()
  return db()
    .prepare(`SELECT * FROM cms_article ORDER BY sort_order ASC, updated_at DESC`)
    .all()
    .map((r) => mapRow(r, { withBlocks: true }))
}

async function listAdminAsync() {
  await ensureSchemaAsync()
  const [rows] = await dbMod.queryAsync(
    `SELECT * FROM cms_article ORDER BY sort_order ASC, updated_at DESC`
  )
  return (rows || []).map((r) => mapRow(r, { withBlocks: true }))
}

function listPublishedBrief({ noticeOnly = false, limit = 50 } = {}) {
  ensureSchema()
  const n = Math.min(100, Math.max(1, Number(limit) || 50))
  let rows
  if (noticeOnly) {
    rows = db()
      .prepare(
        `SELECT * FROM cms_article WHERE status='on' AND use_as_notice=1
         ORDER BY sort_order ASC, updated_at DESC LIMIT ?`
      )
      .all(n)
  } else {
    rows = db()
      .prepare(
        `SELECT * FROM cms_article WHERE status='on'
         ORDER BY sort_order ASC, updated_at DESC LIMIT ?`
      )
      .all(n)
  }
  return rows.map((r) => mapRow(r, { withBlocks: false }))
}

function getById(id, { publishedOnly = false } = {}) {
  ensureSchema()
  const row = db().prepare(`SELECT * FROM cms_article WHERE id=?`).get(String(id || ''))
  if (!row) return null
  if (publishedOnly && row.status !== 'on') return null
  return mapRow(row, { withBlocks: true })
}

function upsert(body = {}) {
  ensureSchema()
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const title = String(body.title || '').trim()
  if (!title) return { ok: false, msg: '缺少标题' }
  const blocks = sanitizeBlocks(body.blocks)
  const cover =
    mediaUrl.normalizeStoredMedia(body.coverUrl || body.cover_url || '') ||
    String(body.coverUrl || body.cover_url || '').trim()
  const t = now()
  const status = body.status === 'off' ? 'off' : 'on'
  const useAsNotice = body.useAsNotice === true || body.useAsNotice === 1 || body.use_as_notice === 1 ? 1 : 0
  const sortOrder = Number(body.sortOrder != null ? body.sortOrder : body.sort_order) || 0
  const summary = String(body.summary || '').slice(0, 512)
  const tag = String(body.tag || '').slice(0, 32)
  const publishedAt = status === 'on' ? body.publishedAt || t : String(body.publishedAt || '')
  const d = db()
  const exists = d.prepare(`SELECT id FROM cms_article WHERE id=?`).get(id)
  const blocksJson = JSON.stringify(blocks)
  if (exists) {
    d.prepare(
      `UPDATE cms_article SET title=?, summary=?, tag=?, cover_url=?, status=?, sort_order=?,
       use_as_notice=?, blocks_json=?, published_at=?, updated_at=? WHERE id=?`
    ).run(title, summary, tag, cover, status, sortOrder, useAsNotice, blocksJson, publishedAt, t, id)
  } else {
    d.prepare(
      `INSERT INTO cms_article (id,title,summary,tag,cover_url,status,sort_order,use_as_notice,blocks_json,published_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, title, summary, tag, cover, status, sortOrder, useAsNotice, blocksJson, publishedAt || t, t)
  }
  return { ok: true, article: getById(id) }
}

function remove(id) {
  ensureSchema()
  db().prepare(`DELETE FROM cms_article WHERE id=?`).run(String(id || ''))
  return { ok: true }
}

/** 公告条目 → content_feed items */
function noticeFeedItems(limit = 8) {
  return listPublishedBrief({ noticeOnly: true, limit }).map((a) => ({
    id: a.id,
    type: a.tag === '政策' || /政策|规则/.test(a.tag) ? 'policy' : 'news',
    tag: a.tag || '公告',
    title: a.title,
    summary: a.summary || '',
    time: a.publishedAt ? String(a.publishedAt).slice(0, 16) : '置顶',
    linkKey: `article:${a.id}`,
    link: {
      type: 'page',
      path: '/pages/content/detail',
      params: { id: a.id, title: a.title },
    },
  }))
}

/** 注入首页 content_feed：有公告文章则覆盖 payload.items */
function injectNoticesIntoConfig(cfg) {
  if (!cfg || !cfg.pages || !cfg.pages.home) return cfg
  const mods = cfg.pages.home.modules
  if (!Array.isArray(mods)) return cfg
  const items = noticeFeedItems(8)
  mods.forEach((m) => {
    if (!m || m.type !== 'content_feed') return
    m.payload = m.payload || {}
    // 没有勾「用作首页公告」的上架文章时清空，避免配置里的示例公告露出来
    m.payload.items = items
  })
  return cfg
}

function articleLinkPath(id, title = '') {
  const q = [`id=${encodeURIComponent(id)}`]
  if (title) q.push(`title=${encodeURIComponent(title)}`)
  return `/pages/content/detail?${q.join('&')}`
}

module.exports = {
  ensureSchema,
  ensureSchemaAsync,
  listAdmin,
  listAdminAsync,
  listPublishedBrief,
  getById,
  upsert,
  remove,
  noticeFeedItems,
  injectNoticesIntoConfig,
  articleLinkPath,
  sanitizeBlocks,
}

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
  // MySQL：表已在 openAsync/migrateMysqlAsync 建好；热路径禁止 deasync CREATE
  if (dbMod.DIALECT === 'mysql') {
    schemaReady = true
    return
  }
  const d = db()
  d.prepare(CMS_ARTICLE_SQLITE).run()
  schemaReady = true
}

async function ensureSchemaAsync() {
  if (schemaReady) return
  await dbMod.queryAsync(dbMod.DIALECT === 'mysql' ? CMS_ARTICLE_MYSQL : CMS_ARTICLE_SQLITE)
  schemaReady = true
}

/** 去掉脚本与内联事件，保留样式与结构，供小程序 web-view / rich-text 使用 */
function stripDangerousHtml(html) {
  return String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(['"])[\s\S]*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
}

function isFullHtmlDocument(html) {
  const s = String(html || '')
  return (
    /<!DOCTYPE\s+html/i.test(s) ||
    /<html[\s>]/i.test(s) ||
    /<body[\s>]/i.test(s) ||
    /<style[\s>]/i.test(s) ||
    /<link\b[^>]*rel=["']?stylesheet/i.test(s)
  )
}

/**
 * 把运营粘贴的整页 HTML 拆成：pageHtml（web-view 原规格）+ richHtml（rich-text 兜底正文）
 */
function prepareHtmlBlock(raw) {
  const cleaned = stripDangerousHtml(String(raw || '').slice(0, 800000)).trim()
  if (!cleaned) {
    return { type: 'html', renderMode: 'richtext', content: '', richHtml: '', pageHtml: '' }
  }
  const styles = []
  let work = cleaned.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
    styles.push(String(css || '').trim())
    return ''
  })
  const links = []
  work = work.replace(/<link\b[^>]*>/gi, (tag) => {
    if (/rel=["']?stylesheet/i.test(tag) && /href=/i.test(tag)) links.push(tag)
    return ''
  })
  let title = ''
  const titleMatch = work.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch) title = String(titleMatch[1] || '').trim()
  work = work.replace(/<head\b[\s\S]*?<\/head>/gi, '')
  let body = work
  const bodyMatch = work.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) body = bodyMatch[1]
  else {
    body = work
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .replace(/<\/?html\b[^>]*>/gi, '')
  }
  body = String(body || '').trim()
  const richHtml = body
    .replace(/<\/?(html|head|body|meta|title|link)\b[^>]*>/gi, '')
    .trim()
  const styleBlock = styles.length ? `<style>${styles.join('\n')}</style>` : ''
  const linkBlock = links.join('\n')
  const pageHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
<title>${title ? title.replace(/</g, '') : '详情'}</title>
${linkBlock}
${styleBlock}
</head>
<body>
${body || richHtml}
</body>
</html>`
  const renderMode = isFullHtmlDocument(cleaned) || styles.length || links.length ? 'page' : 'richtext'
  return {
    type: 'html',
    renderMode,
    content: cleaned,
    richHtml: richHtml || cleaned,
    pageHtml,
  }
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
    .map((b) => {
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
        // 整页 HTML（含 style）常超 50KB；上限对齐 express.json 4mb 余量
        const prepared = prepareHtmlBlock((b && b.content) || '')
        // 入库只存原始清理后的 content，避免 JSON 膨胀；读出时再展开
        return { type: 'html', content: prepared.content }
      }
      return null
    })
    .filter(Boolean)
    .slice(0, 80)
}

function expandHtmlBlocks(blocks) {
  return (blocks || []).map((b) => {
    if (!b || b.type !== 'html') return b
    const prepared = prepareHtmlBlock(b.content)
    return {
      type: 'html',
      renderMode: prepared.renderMode,
      content: prepared.content,
      richHtml: prepared.richHtml,
    }
  })
}

function articleNeedsPageRender(article) {
  const blocks = (article && article.blocks) || []
  return blocks.some((b) => b && b.type === 'html' && b.renderMode === 'page')
}

/** 供小程序 web-view 打开的完整 HTML 页 */
function renderPageHtml(id) {
  const article = getById(id, { publishedOnly: true })
  if (!article) return null
  const parts = []
  ;(article.blocks || []).forEach((b) => {
    if (!b) return
    if (b.type === 'text' && b.content) {
      parts.push(`<section style="padding:16px;font-size:16px;line-height:1.7;color:#333;white-space:pre-wrap">${String(b.content)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</section>`)
      return
    }
    if (b.type === 'image' && b.url) {
      const src = String(b.url).replace(/"/g, '&quot;')
      parts.push(`<section style="padding:12px"><img src="${src}" style="max-width:100%;height:auto;display:block;margin:0 auto" /></section>`)
      return
    }
    if (b.type === 'html') {
      const prepared = prepareHtmlBlock(b.content)
      if (prepared.renderMode === 'page') {
        parts.push(prepared.pageHtml)
      } else if (prepared.richHtml) {
        parts.push(`<section style="padding:16px">${prepared.richHtml}</section>`)
      }
    }
  })
  if (!parts.length) {
    const summary = String(article.summary || '').trim()
    if (summary) {
      parts.push(`<section style="padding:16px;font-size:16px;line-height:1.7">${summary
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</section>`)
    }
  }
  // 若仅有一个完整文档块，直接返回，避免套娃 html
  if (parts.length === 1 && /<!DOCTYPE\s+html/i.test(parts[0])) return parts[0]
  const title = String(article.title || '详情').replace(/</g, '')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
<title>${title}</title>
<style>
  html,body{margin:0;padding:0;background:#fff;color:#121826;-webkit-text-size-adjust:100%;}
  img{max-width:100%;height:auto}
</style>
</head>
<body>
${parts.join('\n')}
</body>
</html>`
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
    const blocks = expandHtmlBlocks(sanitizeBlocks(row.blocks_json)).map((b) => {
      if (b.type === 'image') {
        return { type: 'image', url: mediaUrl.clientMediaPath(b.url) || b.url }
      }
      return b
    })
    out.blocks = blocks
    out.renderMode = articleNeedsPageRender({ blocks }) ? 'page' : 'native'
    if (out.renderMode === 'page') {
      out.pagePath = `/api/traffic/v1/articles/${encodeURIComponent(out.id)}/page.html`
    }
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

/** 首页下方列表仅认标签「公告」；其它标签文章只供 Banner 等跳转引用 */
function isHomeNoticeTag(tag) {
  return String(tag || '').trim() === '公告'
}

function listPublishedBrief({ noticeOnly = false, limit = 50 } = {}) {
  ensureSchema()
  const n = Math.min(100, Math.max(1, Number(limit) || 50))
  let rows
  if (noticeOnly) {
    // 上架 + 用作首页公告 + 标签必须是「公告」
    rows = db()
      .prepare(
        `SELECT * FROM cms_article
         WHERE status='on' AND use_as_notice=1 AND TRIM(tag)='公告'
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
  const sortOrder = Number(body.sortOrder != null ? body.sortOrder : body.sort_order) || 0
  const summary = String(body.summary || '').slice(0, 512)
  const tag = String(body.tag || '').slice(0, 32)
  // 非「公告」标签禁止进首页列表，即便勾了用作首页公告
  let useAsNotice = body.useAsNotice === true || body.useAsNotice === 1 || body.use_as_notice === 1 ? 1 : 0
  if (!isHomeNoticeTag(tag)) useAsNotice = 0
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

/** 运营台保存文章：纯 async，大 HTML 块不走 deasync */
async function upsertAsync(body = {}) {
  await ensureSchemaAsync()
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
  const sortOrder = Number(body.sortOrder != null ? body.sortOrder : body.sort_order) || 0
  const summary = String(body.summary || '').slice(0, 512)
  const tag = String(body.tag || '').slice(0, 32)
  let useAsNotice = body.useAsNotice === true || body.useAsNotice === 1 || body.use_as_notice === 1 ? 1 : 0
  if (!isHomeNoticeTag(tag)) useAsNotice = 0
  const publishedAt = status === 'on' ? body.publishedAt || t : String(body.publishedAt || '')
  const blocksJson = JSON.stringify(blocks)
  const [existRows] = await dbMod.queryAsync(`SELECT id FROM cms_article WHERE id=?`, [id])
  const exists = existRows && existRows[0]
  if (exists) {
    await dbMod.queryAsync(
      `UPDATE cms_article SET title=?, summary=?, tag=?, cover_url=?, status=?, sort_order=?,
       use_as_notice=?, blocks_json=?, published_at=?, updated_at=? WHERE id=?`,
      [title, summary, tag, cover, status, sortOrder, useAsNotice, blocksJson, publishedAt, t, id]
    )
  } else {
    await dbMod.queryAsync(
      `INSERT INTO cms_article (id,title,summary,tag,cover_url,status,sort_order,use_as_notice,blocks_json,published_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, title, summary, tag, cover, status, sortOrder, useAsNotice, blocksJson, publishedAt || t, t]
    )
  }
  const [rows] = await dbMod.queryAsync(`SELECT * FROM cms_article WHERE id=?`, [id])
  return { ok: true, article: mapRow(rows && rows[0], { withBlocks: true }) }
}

function remove(id) {
  ensureSchema()
  db().prepare(`DELETE FROM cms_article WHERE id=?`).run(String(id || ''))
  return { ok: true }
}

async function removeAsync(id) {
  await ensureSchemaAsync()
  await dbMod.queryAsync(`DELETE FROM cms_article WHERE id=?`, [String(id || '')])
  return { ok: true }
}

/** 首页公告条目 → content_feed items（仅标签「公告」） */
function noticeFeedItems(limit = 8) {
  return listPublishedBrief({ noticeOnly: true, limit }).map((a) => ({
    id: a.id,
    type: 'news',
    tag: '公告',
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

/** 注入首页 content_feed：仅「公告」标签文章；其它文章留给 Banner 等跳转 */
function injectNoticesIntoConfig(cfg) {
  if (!cfg || !cfg.pages || !cfg.pages.home) return cfg
  const mods = cfg.pages.home.modules
  if (!Array.isArray(mods)) return cfg
  const items = noticeFeedItems(8)
  mods.forEach((m) => {
    if (!m || m.type !== 'content_feed') return
    m.payload = m.payload || {}
    // 无合格公告时清空，避免配置里的示例/其它标签文章露出来
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
  upsertAsync,
  remove,
  removeAsync,
  noticeFeedItems,
  injectNoticesIntoConfig,
  articleLinkPath,
  sanitizeBlocks,
  prepareHtmlBlock,
  renderPageHtml,
  isFullHtmlDocument,
}

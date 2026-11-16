/**
 * 用户意见反馈：小程序提交，运营台查看/回复/结案。
 */
const dbMod = require('../db')

let ready = false

function ensureSchema() {
  if (ready) return
  if (dbMod.DIALECT === 'mysql') {
    ready = true
    return
  }
  const d = dbMod.open()
  if (dbMod.DIALECT === 'mysql') {
    d.prepare(
      `CREATE TABLE IF NOT EXISTS user_feedback (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL DEFAULT 0,
        contact VARCHAR(128) NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        images_json TEXT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'open',
        admin_reply TEXT,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        replied_at VARCHAR(40) NOT NULL DEFAULT '',
        KEY idx_fb_user (user_id),
        KEY idx_fb_status (status),
        KEY idx_fb_created (created_at)
      )`
    ).run()
  } else {
    d.exec(`
      CREATE TABLE IF NOT EXISTS user_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 0,
        contact TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        images_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'open',
        admin_reply TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        replied_at TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_fb_user ON user_feedback(user_id);
      CREATE INDEX IF NOT EXISTS idx_fb_status ON user_feedback(status);
    `)
  }
  ready = true
}

function parseImages(raw) {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw
    return Array.isArray(arr) ? arr.map((x) => String(x || '').slice(0, 512)).filter(Boolean).slice(0, 3) : []
  } catch (_) {
    return []
  }
}

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    contact: row.contact || '',
    content: row.content || '',
    images: parseImages(row.images_json),
    status: row.status || 'open',
    adminReply: row.admin_reply || '',
    createdAt: require('./chinaDay').formatChinaDateTime(row.created_at),
    updatedAt: row.updated_at || '',
    repliedAt: row.replied_at || '',
    nickName: row.nick_name || '',
  }
}

function submit(userId, { content = '', contact = '', images = [] } = {}) {
  ensureSchema()
  const text = String(content || '').trim()
  if (text.length < 5) throw new Error('请至少填写 5 个字')
  if (text.length > 1000) throw new Error('反馈内容请控制在 1000 字内')
  const imgs = parseImages(images)
  const now = dbMod.nowIso()
  const info = dbMod
    .open()
    .prepare(
      `INSERT INTO user_feedback (user_id, contact, content, images_json, status, admin_reply, created_at, updated_at, replied_at)
       VALUES (?, ?, ?, ?, 'open', '', ?, ?, '')`
    )
    .run(userId || 0, String(contact || '').slice(0, 128), text, JSON.stringify(imgs), now, now)
  return { id: info.lastInsertRowid || info.insertId, ok: true }
}

function listMine(userId, { limit = 20 } = {}) {
  ensureSchema()
  const n = Math.min(50, Math.max(1, Number(limit) || 20))
  const rows = dbMod
    .open()
    .prepare(
      `SELECT id, user_id, contact, content, images_json, status, admin_reply, created_at, updated_at, replied_at
       FROM user_feedback WHERE user_id=? ORDER BY id DESC LIMIT ?`
    )
    .all(userId, n)
  return { list: rows.map(mapRow) }
}

function adminList({ status = '', limit = 50, offset = 0 } = {}) {
  ensureSchema()
  const lim = Math.min(200, Math.max(1, Number(limit) || 50))
  const off = Math.max(0, Number(offset) || 0)
  const d = dbMod.open()
  let rows
  if (status) {
    rows = d
      .prepare(
        `SELECT f.*, u.nick_name FROM user_feedback f
         LEFT JOIN user_account u ON u.id = f.user_id
         WHERE f.status=? ORDER BY f.id DESC LIMIT ? OFFSET ?`
      )
      .all(String(status), lim, off)
  } else {
    rows = d
      .prepare(
        `SELECT f.*, u.nick_name FROM user_feedback f
         LEFT JOIN user_account u ON u.id = f.user_id
         ORDER BY f.id DESC LIMIT ? OFFSET ?`
      )
      .all(lim, off)
  }
  const total = d.prepare(`SELECT COUNT(*) AS n FROM user_feedback`).get().n
  return { list: rows.map(mapRow), total }
}

function adminReply(id, { reply = '', status = 'replied' } = {}) {
  ensureSchema()
  const fid = Number(id)
  if (!fid) throw new Error('无效反馈')
  const d = dbMod.open()
  const row = d.prepare(`SELECT id FROM user_feedback WHERE id=?`).get(fid)
  if (!row) throw new Error('反馈不存在')
  const now = dbMod.nowIso()
  const st = status === 'closed' ? 'closed' : reply ? 'replied' : 'open'
  d.prepare(
    `UPDATE user_feedback SET admin_reply=?, status=?, updated_at=?, replied_at=? WHERE id=?`
  ).run(String(reply || '').slice(0, 2000), st, now, reply ? now : '', fid)
  return mapRow(
    d
      .prepare(
        `SELECT f.*, u.nick_name FROM user_feedback f
         LEFT JOIN user_account u ON u.id = f.user_id WHERE f.id=?`
      )
      .get(fid)
  )
}

function adminSetStatus(id, status) {
  ensureSchema()
  const fid = Number(id)
  const st = String(status || '')
  if (!['open', 'replied', 'closed'].includes(st)) throw new Error('状态无效')
  const d = dbMod.open()
  const row = d.prepare(`SELECT id FROM user_feedback WHERE id=?`).get(fid)
  if (!row) throw new Error('反馈不存在')
  const now = dbMod.nowIso()
  d.prepare(`UPDATE user_feedback SET status=?, updated_at=? WHERE id=?`).run(st, now, fid)
  return { ok: true, id: fid, status: st }
}

module.exports = {
  ensureSchema,
  submit,
  listMine,
  adminList,
  adminReply,
  adminSetStatus,
}

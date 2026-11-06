/**
 * 媒体 DB 回落：COS 失败时把 ≤2MB 图片写入 media_blob。
 * 读写必须走 async（queryAsync），禁止在 async 路由里用 deasync 同步门面。
 */
const dbMod = require('../db')
const crypto = require('crypto')

function db() {
  return dbMod.open()
}

function ensureTable() {
  const d = db()
  if (dbMod.DIALECT === 'mysql') {
    d.prepare(
      `CREATE TABLE IF NOT EXISTS media_blob (
        cos_key VARCHAR(512) NOT NULL PRIMARY KEY,
        mime VARCHAR(128) NOT NULL,
        etag VARCHAR(128) NOT NULL DEFAULT '',
        bytes INT NOT NULL DEFAULT 0,
        body LONGBLOB NOT NULL,
        updated_at VARCHAR(40) NOT NULL
      )`
    ).run()
  } else {
    d.prepare(
      `CREATE TABLE IF NOT EXISTS media_blob (
        cos_key TEXT PRIMARY KEY,
        mime TEXT NOT NULL,
        etag TEXT NOT NULL DEFAULT '',
        bytes INTEGER NOT NULL DEFAULT 0,
        body BLOB NOT NULL,
        updated_at TEXT NOT NULL
      )`
    ).run()
  }
}

let ready = false
function readyTable() {
  if (ready) return
  ensureTable()
  ready = true
}

async function ensureTableAsync() {
  if (ready) return
  if (dbMod.DIALECT === 'mysql') {
    await dbMod.queryAsync(
      `CREATE TABLE IF NOT EXISTS media_blob (
        cos_key VARCHAR(512) NOT NULL PRIMARY KEY,
        mime VARCHAR(128) NOT NULL,
        etag VARCHAR(128) NOT NULL DEFAULT '',
        bytes INT NOT NULL DEFAULT 0,
        body LONGBLOB NOT NULL,
        updated_at VARCHAR(40) NOT NULL
      )`
    )
  } else {
    readyTable()
    return
  }
  ready = true
}

/** @deprecated 仅同步上下文可用；async 路由请用 putBlobAsync */
function putBlob({ cosKey, buffer, mime }) {
  readyTable()
  const key = String(cosKey || '').replace(/^\/+/, '')
  if (!key || !Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('media_blob 参数无效')
  }
  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error('图片超过 2MB，无法回落数据库存储')
  }
  const etag = crypto.createHash('md5').update(buffer).digest('hex')
  const t = dbMod.nowIso()
  const d = db()
  if (dbMod.DIALECT === 'mysql') {
    d.prepare(
      `INSERT INTO media_blob (cos_key, mime, etag, bytes, body, updated_at)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE mime=VALUES(mime), etag=VALUES(etag), bytes=VALUES(bytes),
         body=VALUES(body), updated_at=VALUES(updated_at)`
    ).run(key, mime || 'application/octet-stream', etag, buffer.length, buffer, t)
  } else {
    d.prepare(
      `INSERT INTO media_blob (cos_key, mime, etag, bytes, body, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(cos_key) DO UPDATE SET
         mime=excluded.mime, etag=excluded.etag, bytes=excluded.bytes,
         body=excluded.body, updated_at=excluded.updated_at`
    ).run(key, mime || 'application/octet-stream', etag, buffer.length, buffer, t)
  }
  return { cosKey: key, mime: mime || 'application/octet-stream', etag, bytes: buffer.length, mode: 'db' }
}

async function putBlobAsync({ cosKey, buffer, mime }) {
  await ensureTableAsync()
  const key = String(cosKey || '').replace(/^\/+/, '')
  if (!key || !Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('media_blob 参数无效')
  }
  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error('图片超过 2MB，无法回落数据库存储')
  }
  const etag = crypto.createHash('md5').update(buffer).digest('hex')
  const t = dbMod.nowIso()
  const m = mime || 'application/octet-stream'
  if (dbMod.DIALECT === 'mysql') {
    await dbMod.queryAsync(
      `INSERT INTO media_blob (cos_key, mime, etag, bytes, body, updated_at)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE mime=VALUES(mime), etag=VALUES(etag), bytes=VALUES(bytes),
         body=VALUES(body), updated_at=VALUES(updated_at)`,
      [key, m, etag, buffer.length, buffer, t]
    )
  } else {
    putBlob({ cosKey: key, buffer, mime: m })
  }
  return { cosKey: key, mime: m, etag, bytes: buffer.length, mode: 'db' }
}

/** @deprecated 仅同步上下文可用；async 路由请用 getBlobAsync */
function getBlob(cosKey) {
  readyTable()
  const key = String(cosKey || '').replace(/^\/+/, '')
  if (!key) return null
  const row = db().prepare(`SELECT cos_key, mime, etag, bytes, body FROM media_blob WHERE cos_key=?`).get(key)
  if (!row || !row.body) return null
  const buffer = Buffer.isBuffer(row.body) ? row.body : Buffer.from(row.body)
  return {
    cosKey: row.cos_key,
    buffer,
    mime: row.mime || 'application/octet-stream',
    bytes: row.bytes || buffer.length,
    etag: row.etag || '',
    mode: 'db',
  }
}

async function getBlobAsync(cosKey) {
  await ensureTableAsync()
  const key = String(cosKey || '').replace(/^\/+/, '')
  if (!key) return null
  if (dbMod.DIALECT !== 'mysql') {
    return getBlob(key)
  }
  const [rows] = await dbMod.queryAsync(
    `SELECT cos_key, mime, etag, bytes, body FROM media_blob WHERE cos_key=?`,
    [key]
  )
  const row = rows && rows[0]
  if (!row || !row.body) return null
  const buffer = Buffer.isBuffer(row.body) ? row.body : Buffer.from(row.body)
  return {
    cosKey: row.cos_key,
    buffer,
    mime: row.mime || 'application/octet-stream',
    bytes: row.bytes || buffer.length,
    etag: row.etag || '',
    mode: 'db',
  }
}

module.exports = {
  ensureTable,
  putBlob,
  getBlob,
  putBlobAsync,
  getBlobAsync,
}

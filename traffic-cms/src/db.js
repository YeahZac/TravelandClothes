/**
 * SQLite 封装（better-sqlite3）。首次启动执行 schema.sql，并从 JSON 迁移 published/draft。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DATA = path.join(ROOT, 'data')
const SCHEMA = path.join(ROOT, 'sql', 'schema.sql')
const DB_PATH = process.env.DB_PATH || path.join(DATA, 'qmyx.sqlite')

let Database
try {
  Database = require('better-sqlite3')
} catch (e) {
  Database = null
}

let db = null

function ensureDataDir() {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true })
}

function open() {
  if (db) return db
  if (!Database) {
    throw new Error(
      '缺少 better-sqlite3，请在 traffic-cms 目录执行: npm install better-sqlite3'
    )
  }
  ensureDataDir()
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  const sql = fs.readFileSync(SCHEMA, 'utf8')
  db.exec(sql)
  migrateFromJsonIfNeeded()
  return db
}

function migrateFromJsonIfNeeded() {
  const row = db.prepare('SELECT id FROM config_published WHERE id = 1').get()
  if (row) return
  const publishedFile = path.join(DATA, 'published.json')
  const draftFile = path.join(DATA, 'draft.json')
  const now = new Date().toISOString()
  if (fs.existsSync(publishedFile)) {
    const pub = JSON.parse(fs.readFileSync(publishedFile, 'utf8'))
    db.prepare(
      `INSERT INTO config_published (id, version, payload_json, published_at, updated_at)
       VALUES (1, ?, ?, ?, ?)`
    ).run(String(pub.version || '1'), JSON.stringify(pub), pub.publishedAt || now, now)
  }
  if (fs.existsSync(draftFile)) {
    const draft = JSON.parse(fs.readFileSync(draftFile, 'utf8'))
    db.prepare(
      `INSERT INTO config_draft (id, version, payload_json, updated_at)
       VALUES (1, ?, ?, ?)`
    ).run(String(draft.version || '0'), JSON.stringify(draft), now)
  }
}

function nowIso() {
  return new Date().toISOString()
}

module.exports = {
  open,
  nowIso,
  DB_PATH,
  hasNative: !!Database,
}

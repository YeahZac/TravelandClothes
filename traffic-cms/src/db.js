/**
 * 数据库双引擎：
 * - 无 DB_HOST / 本地：better-sqlite3
 * - 云托管（DB_HOST=CynosDB）：mysql2 + deasync 同步门面 → 原库 travel_clothes
 *
 * 业务代码继续用同步 prepare().get/all/run；启动时 open() 即可。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DATA = path.join(ROOT, 'data')
const SCHEMA_SQLITE = path.join(ROOT, 'sql', 'schema.sql')
const SCHEMA_MYSQL = path.join(ROOT, 'sql', 'schema.mysql.sql')
const DB_PATH = process.env.DB_PATH || path.join(DATA, 'qmyx.sqlite')

function useMysql() {
  const host = String(process.env.DB_HOST || '').trim()
  if (!host) return false
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false
  if (/^\$\{/.test(host)) return false
  return true
}

const DIALECT = useMysql() ? 'mysql' : 'sqlite'

let Database = null
if (DIALECT === 'sqlite') {
  try {
    Database = require('better-sqlite3')
  } catch (e) {
    Database = null
  }
}

let deasync = null
const DB_QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS || 12000)

function withTimeout(promise, ms, label) {
  const limit = Math.max(1000, Number(ms) || DB_QUERY_TIMEOUT_MS)
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`DB timeout ${limit}ms${label ? `: ${label}` : ''}`))
    }, limit)
    Promise.resolve(promise).then(
      (v) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

function syncAwait(promise, label) {
  if (!deasync) deasync = require('deasync')
  let done = false
  let value
  let error
  withTimeout(promise, DB_QUERY_TIMEOUT_MS, label)
    .then((v) => {
      value = v
      done = true
    })
    .catch((e) => {
      error = e
      done = true
    })
  deasync.loopWhile(() => !done)
  if (error) throw error
  return value
}

let _db = null
let _pool = null
let _seeded = false

function ensureDataDir() {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true })
}

function nowIso() {
  return new Date().toISOString()
}

function splitStatements(sqlText) {
  return String(sqlText || '')
    .split(/;\s*(?=\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s && !/^\s*--/.test(s))
}

function convertSql(sql) {
  let s = String(sql)
  s = s.replace(/INSERT OR IGNORE INTO/gi, 'INSERT IGNORE INTO')
  s = s.replace(/INSERT OR REPLACE INTO/gi, 'REPLACE INTO')
  // SQLite upsert → MySQL（云托管 CynosDB 不支持 ON CONFLICT / excluded）
  s = s.replace(/ON CONFLICT\s*\(([^)]+)\)\s*DO NOTHING/gi, '')
  s = s.replace(
    /ON CONFLICT\s*\(([^)]+)\)\s*DO UPDATE SET\s+/gi,
    'ON DUPLICATE KEY UPDATE '
  )
  s = s.replace(/\bexcluded\.(\w+)/gi, 'VALUES($1)')
  // SQLite CAST AS TEXT → MySQL CHAR
  s = s.replace(/CAST\((\w+)\s+AS\s+TEXT\)/gi, 'CAST($1 AS CHAR)')
  // SQLite → MySQL DDL（运行时 ensureTables / ALTER 也走这里）
  s = s.replace(/\bINTEGER PRIMARY KEY AUTOINCREMENT\b/gi, 'BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY')
  s = s.replace(/\bAUTOINCREMENT\b/gi, 'AUTO_INCREMENT')
  // TEXT/BLOB 禁止 DEFAULT：有默认值的改成 VARCHAR
  s = s.replace(/\bTEXT(\s+NOT NULL\s+DEFAULT\s+'[^']*')/gi, 'VARCHAR(512)$1')
  s = s.replace(/\bBLOB(\s+NOT NULL\s+DEFAULT\s+'[^']*')/gi, 'VARCHAR(512)$1')
  // 裸 TEXT 列（无 DEFAULT）在 ALTER ADD 场景也改 VARCHAR，避免再踩坑
  s = s.replace(
    /ADD COLUMN\s+(\w+)\s+TEXT(\s+NOT NULL\s+DEFAULT\s+'[^']*')?/gi,
    (_, name, tail) => `ADD COLUMN ${name} VARCHAR(512)${tail || " NOT NULL DEFAULT ''"}`
  )
  return s
}

/** 列名列表（兼容 SQLite PRAGMA / MySQL information_schema） */
function columnNames(adapter, table) {
  return adapter
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => String(c.name || c.NAME || c.COLUMN_NAME || '').toLowerCase())
    .filter(Boolean)
}

/** 幂等加列；MySQL 用 VARCHAR，避免 TEXT DEFAULT 报错 */
function addColumnIfMissing(adapter, table, column, mysqlDef, sqliteDef) {
  const cols = columnNames(adapter, table)
  if (cols.includes(String(column).toLowerCase())) return false
  const def = DIALECT === 'mysql' ? mysqlDef : sqliteDef || mysqlDef
  try {
    adapter.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`)
    return true
  } catch (e) {
    if (e && (e.code === 'ER_DUP_FIELDNAME' || /duplicate column/i.test(e.message || ''))) return false
    throw e
  }
}

function mysqlConfig() {
  const CLOUD_DB_HOST = 'sh-cynosdbmysql-grp-gscxxq7o.sql.tencentcdb.com'
  const CLOUD_DB_PORT = 24154
  const inContainer = String(process.env.PORT) === '80'
  let host = String(process.env.DB_HOST || '').trim()
  let port = Number(process.env.DB_PORT || 0)
  if (inContainer && (!host || host === 'localhost')) {
    host = CLOUD_DB_HOST
    port = CLOUD_DB_PORT
  }
  if (!port) port = inContainer ? CLOUD_DB_PORT : Number(process.env.DB_PORT || 3306)
  return {
    host,
    port,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'travel_clothes',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 8),
    queueLimit: Number(process.env.DB_QUEUE_LIMIT || 20),
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
    charset: 'utf8mb4',
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    multipleStatements: true,
  }
}

function wrapMysqlPool(pool, queryFn) {
  const q = queryFn || ((sql, params) => pool.query(sql, params))

  function tableColumns(table) {
    const [rows] = syncAwait(
      q(
        `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
      )
    )
    return (rows || []).map((r) => ({
      name: String(r.name || r.NAME || r.COLUMN_NAME || ''),
    }))
  }

  return {
    dialect: 'mysql',
    prepare(sql) {
      const rawSql = convertSql(sql)
      const pragma = /^PRAGMA\s+table_info\((\w+)\)/i.exec(String(sql).trim())
      if (pragma) {
        return {
          get: () => null,
          all: () => tableColumns(pragma[1]),
          run: () => ({ changes: 0, lastInsertRowid: 0, insertId: 0 }),
        }
      }
      const label = rawSql.replace(/\s+/g, ' ').slice(0, 80)
      return {
        get: (...params) => {
          const [rows] = syncAwait(q(rawSql, params), label)
          return rows[0]
        },
        all: (...params) => {
          const [rows] = syncAwait(q(rawSql, params), label)
          return rows
        },
        run: (...params) => {
          const [result] = syncAwait(q(rawSql, params), label)
          return {
            changes: result.affectedRows || 0,
            lastInsertRowid: Number(result.insertId || 0),
            insertId: Number(result.insertId || 0),
          }
        },
      }
    },
    exec(sql) {
      for (const part of splitStatements(convertSql(sql))) {
        try {
          syncAwait(q(part))
        } catch (e) {
          if (
            e &&
            (e.code === 'ER_DUP_FIELDNAME' ||
              e.code === 'ER_DUP_KEYNAME' ||
              e.code === 'ER_TABLE_EXISTS_ERROR' ||
              e.code === 'ER_DUP_ENTRY')
          ) {
            continue
          }
          // CREATE INDEX 重复
          if (e && /Duplicate key name/i.test(e.message || '')) continue
          throw e
        }
      }
    },
    transaction(fn) {
      return (...args) => {
        const conn = syncAwait(pool.getConnection())
        const prev = _db
        _db = wrapMysqlPool(pool, (sql, params) => conn.query(sql, params))
        try {
          syncAwait(conn.beginTransaction())
          const out = fn(...args)
          syncAwait(conn.commit())
          return out
        } catch (e) {
          try {
            syncAwait(conn.rollback())
          } catch (_) {}
          throw e
        } finally {
          _db = prev
          conn.release()
        }
      }
    },
  }
}

function migrateMysql(pool) {
  const sqlPath = fs.existsSync(SCHEMA_MYSQL) ? SCHEMA_MYSQL : SCHEMA_SQLITE
  const sql = fs.readFileSync(sqlPath, 'utf8')
  for (const part of splitStatements(sql)) {
    try {
      syncAwait(pool.query(convertSql(part)))
    } catch (e) {
      if (
        e &&
        (e.code === 'ER_TABLE_EXISTS_ERROR' ||
          e.code === 'ER_DUP_KEYNAME' ||
          e.code === 'ER_DUP_FIELDNAME' ||
          e.code === 'ER_BLOB_KEY_WITHOUT_LENGTH' ||
          /Duplicate key name/i.test(e.message || ''))
      ) {
        continue
      }
      // 索引先于表 / 旧库缺表：不阻断启动
      if (e && e.code === 'ER_NO_SUCH_TABLE' && /^CREATE\s+INDEX/i.test(part)) {
        continue
      }
      console.warn('[db] mysql migrate:', e.code || e.message, part.slice(0, 60).replace(/\s+/g, ' '))
    }
  }
}

function migrateFromJsonIfNeeded(adapter) {
  const row = adapter.prepare('SELECT id FROM config_published WHERE id = 1').get()
  if (row) return
  const publishedFile = path.join(DATA, 'published.json')
  const draftFile = path.join(DATA, 'draft.json')
  const now = new Date().toISOString()
  if (fs.existsSync(publishedFile)) {
    const pub = JSON.parse(fs.readFileSync(publishedFile, 'utf8'))
    adapter
      .prepare(
        `INSERT INTO config_published (id, version, payload_json, published_at, updated_at)
         VALUES (1, ?, ?, ?, ?)`
      )
      .run(String(pub.version || '1'), JSON.stringify(pub), pub.publishedAt || now, now)
  }
  if (fs.existsSync(draftFile)) {
    const draft = JSON.parse(fs.readFileSync(draftFile, 'utf8'))
    adapter
      .prepare(`INSERT INTO config_draft (id, version, payload_json, updated_at) VALUES (1, ?, ?, ?)`)
      .run(String(draft.version || '0'), JSON.stringify(draft), now)
  }
}

function runSeeds() {
  if (_seeded) return
  _seeded = true
  try {
    const adminService = require('./services/adminService')
    adminService.seedIfEmpty()
    adminService.seedDemoFinanceIfEmpty()
    require('./services/commerceService').seedGiftProducts()
    require('./services/opsService').seedOps()
    try {
      require('./services/currencyService').mergeAllWallets()
    } catch (e2) {
      console.warn('[db] energy merge skipped:', e2.message)
    }
  } catch (e) {
    console.warn('[db] admin seed skipped:', e.message)
  }
}

function open() {
  if (_db) return _db

  if (DIALECT === 'mysql') {
    const mysql = require('mysql2/promise')
    const cfg = mysqlConfig()
    _pool = mysql.createPool(cfg)
    console.log(`[db] MySQL → ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database} (travel_clothes 共存)`)
    migrateMysql(_pool)
    _db = wrapMysqlPool(_pool)
    migrateFromJsonIfNeeded(_db)
  } else {
    if (!Database) {
      throw new Error('缺少 better-sqlite3，请执行: npm install better-sqlite3')
    }
    ensureDataDir()
    const raw = new Database(DB_PATH)
    raw.pragma('journal_mode = WAL')
    raw.pragma('foreign_keys = ON')
    raw.exec(fs.readFileSync(SCHEMA_SQLITE, 'utf8'))
    _db = raw
    console.log(`[db] SQLite ready → ${DB_PATH}`)
    migrateFromJsonIfNeeded({
      prepare: (sql) => raw.prepare(sql),
      exec: (sql) => raw.exec(sql),
    })
  }

  runSeeds()
  return _db
}

/**
 * 真正的异步查询（不走 deasync）。
 * 在 async 路由里 await 之后禁止再用 prepare().get/run，否则 Node20 会 async hook 崩溃 → 503。
 */
async function queryAsync(sql, params = []) {
  open()
  const rawSql = convertSql(sql)
  if (DIALECT === 'mysql') {
    if (!_pool) throw new Error('MySQL pool 未初始化')
    return withTimeout(_pool.query(rawSql, params), DB_QUERY_TIMEOUT_MS, rawSql.slice(0, 60))
  }
  const stmt = _db.prepare(String(sql))
  const list = Array.isArray(params) ? params : [params]
  if (/^\s*select/i.test(String(sql))) {
    try {
      return [stmt.all(...list)]
    } catch (_) {
      const row = stmt.get(...list)
      return [row ? [row] : []]
    }
  }
  const result = stmt.run(...list)
  return [
    {
      affectedRows: result.changes || 0,
      insertId: result.lastInsertRowid || 0,
    },
  ]
}

function getPool() {
  open()
  return _pool
}

module.exports = {
  open,
  nowIso,
  DB_PATH,
  DIALECT,
  useMysql,
  convertSql,
  columnNames,
  addColumnIfMissing,
  queryAsync,
  getPool,
  hasNative: DIALECT === 'sqlite' ? !!Database : true,
}

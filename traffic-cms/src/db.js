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
// 查询超时须明显短于 HTTP 墙钟，避免 handler 还占着 SyncGate 槽位时前端已 15s 超时
const DB_QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS || 5000)
const DB_DDL_TIMEOUT_MS = Number(process.env.DB_DDL_TIMEOUT_MS || 4000)
const DB_POOL_SIZE = Number(process.env.DB_POOL_SIZE || 24)
const DB_QUEUE_LIMIT = Number(process.env.DB_QUEUE_LIMIT || 16)
// deasync.loopWhile 会处理新请求；>1 会产生递归嵌套等待，最终所有槽位都无法回收。
// 同步兼容层必须严格单通道，新增/高频路径应使用 queryAsync。
const DB_SYNC_MAX = 1
const CIRCUIT_FAIL_THRESHOLD = Number(process.env.DB_CIRCUIT_FAILS || 12)
const CIRCUIT_WINDOW_MS = Number(process.env.DB_CIRCUIT_WINDOW_MS || 30000)
const CIRCUIT_OPEN_MS = Number(process.env.DB_CIRCUIT_OPEN_MS || 10000)

/** 稳定性内核：SyncGate + 熔断观测 */
const _stab = {
  syncInflight: 0,
  syncMax: DB_SYNC_MAX,
  circuitOpenUntil: 0,
  failTs: [],
  timeoutCount: 0,
  busyCount: 0,
  schemasWarmed: false,
}

function dbBusyError(msg) {
  const e = new Error(msg || 'DB_BUSY')
  e.code = 'DB_BUSY'
  return e
}

function isCircuitOpen() {
  return Date.now() < _stab.circuitOpenUntil
}

function recordDbFailure(kind) {
  const now = Date.now()
  if (kind === 'timeout') _stab.timeoutCount += 1
  if (kind === 'busy') {
    _stab.busyCount += 1
    // 闸门满只计数，不参与熔断——否则运营台连点会把整站 async 读也熔死
    return
  }
  _stab.failTs.push(now)
  _stab.failTs = _stab.failTs.filter((t) => now - t <= CIRCUIT_WINDOW_MS)
  if (_stab.failTs.length >= CIRCUIT_FAIL_THRESHOLD) {
    _stab.circuitOpenUntil = now + CIRCUIT_OPEN_MS
    _stab.failTs = []
    console.warn(
      `[db] circuit OPEN ${CIRCUIT_OPEN_MS}ms (timeouts=${_stab.timeoutCount} busy=${_stab.busyCount})`
    )
  }
}

function acquireSyncSlot(label) {
  if (isCircuitOpen()) {
    throw dbBusyError(`DB_BUSY circuit open${label ? `: ${label}` : ''}`)
  }
  if (_stab.syncInflight >= _stab.syncMax) {
    recordDbFailure('busy')
    throw dbBusyError(`DB_BUSY sync gate full (${_stab.syncInflight}/${_stab.syncMax})`)
  }
  _stab.syncInflight += 1
}

function releaseSyncSlot() {
  if (_stab.syncInflight > 0) _stab.syncInflight -= 1
}

function timeoutForLabel(label) {
  const s = String(label || '')
  if (
    /information_schema|CREATE TABLE|ALTER TABLE|CREATE INDEX|PRAGMA|ADD COLUMN|user_account columns/i.test(
      s
    )
  ) {
    return DB_DDL_TIMEOUT_MS
  }
  return DB_QUERY_TIMEOUT_MS
}

function withTimeout(promise, ms, label) {
  const limit = Math.max(1000, Number(ms) || DB_QUERY_TIMEOUT_MS)
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      const err = new Error(`DB timeout ${limit}ms${label ? `: ${label}` : ''}`)
      err.code = 'DB_TIMEOUT'
      reject(err)
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

function syncAwait(startPromise, label) {
  if (!deasync) deasync = require('deasync')
  // 必须先占槽，再启动 SQL。之前调用方先执行 q(...) 再进此函数，
  // 闸门满时虽然返回 DB_BUSY，但查询已经进入 mysql2 队列，最终耗尽整个池。
  acquireSyncSlot(label)
  let done = false
  let value
  let error
  let promise
  try {
    promise = typeof startPromise === 'function' ? startPromise() : startPromise
  } catch (e) {
    releaseSyncSlot()
    throw e
  }
  // 超时后底层 query 仍可能晚到 reject；先吞掉，避免 unhandledRejection 刷屏
  Promise.resolve(promise).catch(() => {})
  withTimeout(promise, timeoutForLabel(label), label)
    .then((v) => {
      value = v
      done = true
    })
    .catch((e) => {
      error = e
      done = true
    })
  try {
    deasync.loopWhile(() => !done)
  } finally {
    releaseSyncSlot()
  }
  if (error) {
    if (error.code === 'DB_TIMEOUT' || /DB timeout/i.test(error.message || '')) {
      recordDbFailure('timeout')
    }
    throw error
  }
  return value
}

function getStabilityStats() {
  return {
    dialect: DIALECT,
    inflight: _stab.syncInflight,
    syncMax: _stab.syncMax,
    circuitOpen: isCircuitOpen(),
    circuitOpenUntil: _stab.circuitOpenUntil || 0,
    timeoutCount: _stab.timeoutCount,
    busyCount: _stab.busyCount,
    poolSize: DB_POOL_SIZE,
    queueLimit: DB_QUEUE_LIMIT,
    schemasWarmed: _stab.schemasWarmed,
    seeded: _seeded,
  }
}

function markSchemasWarmed() {
  _stab.schemasWarmed = true
}

function isSchemasWarmed() {
  return _stab.schemasWarmed || DIALECT !== 'mysql'
}

let _db = null
let _pool = null
let _seeded = false
let _closing = false

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
  // 常见键列：MySQL 禁止 TEXT/BLOB 直接进 PRIMARY KEY / KEY（需前缀长度）
  s = s.replace(/\b(day_key|source|status|platform|openid|channel)\s+TEXT\b/gi, '$1 VARCHAR(64)')
  return s
}

/**
 * 在「干净」的同步栈里跑 deasync DB（禁止紧接在 await/Promise.then 之后）。
 * Node20 + mysql2 + deasync：async 延续里 syncAwait 会 Maximum call stack / async hook 损坏。
 */
function runSync(fn) {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        resolve(fn())
      } catch (e) {
        reject(e)
      }
    })
  })
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
    // 宁可快速失败，不无限排队把进程拖死；SyncGate 另限 deasync 并发
    connectionLimit: DB_POOL_SIZE,
    queueLimit: DB_QUEUE_LIMIT,
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
      () => q(
        `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
      ),
      `information_schema ${table}`
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
          const [rows] = syncAwait(() => q(rawSql, params), label)
          return rows[0]
        },
        all: (...params) => {
          const [rows] = syncAwait(() => q(rawSql, params), label)
          return rows
        },
        run: (...params) => {
          const [result] = syncAwait(() => q(rawSql, params), label)
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
          syncAwait(() => q(part), part.replace(/\s+/g, ' ').slice(0, 80))
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
        const conn = syncAwait(() => pool.getConnection(), 'get connection')
        const prev = _db
        _db = wrapMysqlPool(pool, (sql, params) => conn.query(sql, params))
        try {
          syncAwait(() => conn.beginTransaction(), 'begin transaction')
          const out = fn(...args)
          syncAwait(() => conn.commit(), 'commit transaction')
          return out
        } catch (e) {
          try {
            syncAwait(() => conn.rollback(), 'rollback transaction')
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
      syncAwait(() => pool.query(convertSql(part)), part.replace(/\s+/g, ' ').slice(0, 80))
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

/** 云托管启动用：纯 async 迁移，禁止 deasync（Node20 会打崩进程） */
async function migrateMysqlAsync(pool) {
  // 先做一次连通性检查；DB 不可达时不要把几十条 DDL 各等一遍超时。
  await withTimeout(pool.query('SELECT 1 AS ok'), DB_QUERY_TIMEOUT_MS, 'connectivity')
  const sqlPath = fs.existsSync(SCHEMA_MYSQL) ? SCHEMA_MYSQL : SCHEMA_SQLITE
  const sql = fs.readFileSync(sqlPath, 'utf8')
  for (const part of splitStatements(sql)) {
    try {
      await withTimeout(pool.query(convertSql(part)), DB_QUERY_TIMEOUT_MS, part.slice(0, 60))
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
      if (e && e.code === 'ER_NO_SUCH_TABLE' && /^CREATE\s+INDEX/i.test(part)) continue
      console.warn('[db] mysql migrate async:', e.code || e.message, part.slice(0, 60).replace(/\s+/g, ' '))
    }
  }
}

/** MySQL 核心种子：仅用 Promise API，保证空库也能提供发布配置和 ops。 */
async function seedCoreMysqlAsync() {
  const now = new Date().toISOString()
  const publishedFile = path.join(DATA, 'published.json')
  const draftFile = path.join(DATA, 'draft.json')
  const [pubRows] = await withTimeout(
    _pool.query('SELECT id FROM config_published WHERE id=1'),
    DB_QUERY_TIMEOUT_MS,
    'seed config_published'
  )
  if (!(pubRows && pubRows[0]) && fs.existsSync(publishedFile)) {
    const pub = JSON.parse(fs.readFileSync(publishedFile, 'utf8'))
    await withTimeout(
      _pool.query(
        `INSERT INTO config_published (id,version,payload_json,published_at,updated_at)
         VALUES (1,?,?,?,?)`,
        [String(pub.version || '1'), JSON.stringify(pub), pub.publishedAt || now, now]
      ),
      DB_QUERY_TIMEOUT_MS,
      'seed published json'
    )
  }
  const [draftRows] = await withTimeout(
    _pool.query('SELECT id FROM config_draft WHERE id=1'),
    DB_QUERY_TIMEOUT_MS,
    'seed config_draft'
  )
  if (!(draftRows && draftRows[0]) && fs.existsSync(draftFile)) {
    const draft = JSON.parse(fs.readFileSync(draftFile, 'utf8'))
    await withTimeout(
      _pool.query(
        'INSERT INTO config_draft (id,version,payload_json,updated_at) VALUES (1,?,?,?)',
        [String(draft.version || '0'), JSON.stringify(draft), now]
      ),
      DB_QUERY_TIMEOUT_MS,
      'seed draft json'
    )
  }
  await withTimeout(
    _pool.query(
      `INSERT IGNORE INTO ops_config (id,payload_json,updated_at) VALUES (1,'{}',?)`,
      [now]
    ),
    DB_QUERY_TIMEOUT_MS,
    'seed ops_config'
  )
  _seeded = true
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

/** Date.now() 毫秒写入 INT 会 Out of range，旧库需升 BIGINT */
function migrateJarEpochColumns(adapter) {
  if (DIALECT !== 'mysql' || !adapter) return
  const cols = ['next_harvest_at', 'water_ready_at', 'fertilize_ready_at', 'light_ready_at']
  for (const col of cols) {
    try {
      adapter.exec(
        `ALTER TABLE jar_state MODIFY COLUMN ${col} BIGINT NOT NULL DEFAULT 0`
      )
    } catch (e) {
      if (e && (e.code === 'ER_BAD_FIELD_ERROR' || /Unknown column/i.test(e.message || ''))) continue
      console.warn('[db] jar epoch migrate', col, e.code || e.message)
    }
  }
}

/** 纯 async：禁止在 await 之后用 sync adapter.exec（deasync） */
async function migrateJarEpochColumnsAsync() {
  if (DIALECT !== 'mysql' || !_pool) return
  const cols = ['next_harvest_at', 'water_ready_at', 'fertilize_ready_at', 'light_ready_at']
  for (const col of cols) {
    try {
      await withTimeout(
        _pool.query(`ALTER TABLE jar_state MODIFY COLUMN ${col} BIGINT NOT NULL DEFAULT 0`),
        DB_QUERY_TIMEOUT_MS,
        `jar_epoch ${col}`
      )
    } catch (e) {
      if (e && (e.code === 'ER_BAD_FIELD_ERROR' || /Unknown column/i.test(e.message || ''))) continue
      console.warn('[db] jar epoch async', col, e.code || e.message)
    }
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

/**
 * @param {{ skipMigrate?: boolean, skipSeed?: boolean }} [opts]
 * skipMigrate：仅建池（云托管 entry 用），迁移走 openAsync
 */
function open(opts = {}) {
  if (_db) return _db

  if (DIALECT === 'mysql') {
    // MySQL 的同步门面只建连接池；迁移和种子只能由 openAsync 执行。
    const skipMigrate = opts.skipMigrate !== false
    const skipSeed = opts.skipSeed !== false
    const mysql = require('mysql2/promise')
    const cfg = mysqlConfig()
    _pool = mysql.createPool(cfg)
    console.log(`[db] MySQL → ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database} (travel_clothes 共存)`)
    if (!skipMigrate) migrateMysql(_pool)
    _db = wrapMysqlPool(_pool)
    if (!skipMigrate) {
      migrateJarEpochColumns(_db)
      migrateFromJsonIfNeeded(_db)
    }
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

  if (DIALECT !== 'mysql' && !opts.skipSeed && !opts.skipMigrate) runSeeds()
  return _db
}

/** 旧库补 user_account 列：纯 async，禁止热路径 deasync information_schema */
async function ensureUserAccountColumnsAsync() {
  if (DIALECT !== 'mysql' || !_pool) return
  const alters = [
    ['session_key', `VARCHAR(128) NOT NULL DEFAULT ''`],
    ['unionid', `VARCHAR(128) NOT NULL DEFAULT ''`],
    ['status', `VARCHAR(16) NOT NULL DEFAULT 'active'`],
    ['remark', `VARCHAR(255) NOT NULL DEFAULT ''`],
    ['inviter_id', `INT NULL`],
    ['gender', `VARCHAR(16) NOT NULL DEFAULT ''`],
    ['province', `VARCHAR(64) NOT NULL DEFAULT ''`],
    ['city', `VARCHAR(64) NOT NULL DEFAULT ''`],
    ['district', `VARCHAR(64) NOT NULL DEFAULT ''`],
    ['last_active_at', `VARCHAR(40) NOT NULL DEFAULT ''`],
    ['active_count', `INT NOT NULL DEFAULT 0`],
  ]
  let have = new Set()
  try {
    const [rows] = await withTimeout(
      _pool.query(
        `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_account'`
      ),
      DB_QUERY_TIMEOUT_MS,
      'user_account columns'
    )
    have = new Set((rows || []).map((r) => String(r.name || r.NAME || '').toLowerCase()).filter(Boolean))
  } catch (e) {
    console.warn('[db] user_account columns', e && e.message)
    return
  }
  for (const [col, def] of alters) {
    if (have.has(col)) continue
    try {
      await withTimeout(
        _pool.query(`ALTER TABLE user_account ADD COLUMN ${col} ${def}`),
        DB_QUERY_TIMEOUT_MS,
        `ADD ${col}`
      )
    } catch (e) {
      if (e && (e.code === 'ER_DUP_FIELDNAME' || /duplicate column/i.test(e.message || ''))) continue
      console.warn('[db] ADD user_account.' + col, e.code || (e && e.message))
    }
  }
  try {
    const auth = require('./services/authService')
    if (typeof auth.markUserColumnsReady === 'function') auth.markUserColumnsReady()
  } catch (_) {}
  try {
    const admin = require('./services/adminService')
    if (typeof admin.markUserColumnsReady === 'function') admin.markUserColumnsReady()
  } catch (_) {}
}

/** 云托管启动：建池 + async 迁移，全程不走 deasync（含种子） */
async function openAsync() {
  if (_db && _seeded) return _db
  if (DIALECT === 'mysql') {
    open({ skipMigrate: true, skipSeed: true })
    await migrateMysqlAsync(_pool)
    await migrateJarEpochColumnsAsync()
    await ensureUserAccountColumnsAsync()
    await seedCoreMysqlAsync()
    return _db
  }
  return open()
}

/**
 * 真正的异步查询（不走 deasync）。
 * 在 async 路由里 await 之后禁止再用 prepare().get/run，否则 Node20 会 async hook 崩溃 → 503。
 */
async function queryAsync(sql, params = []) {
  if (_closing) throw dbBusyError('DB_BUSY closing')
  // MySQL 懒开池禁止同步 migrate（Node20 + deasync 会打崩）；迁移只走 openAsync
  if (!_db) {
    if (DIALECT === 'mysql') open({ skipMigrate: true, skipSeed: true })
    else open()
  }
  const rawSql = convertSql(sql)
  if (DIALECT === 'mysql') {
    if (!_pool) throw new Error('MySQL pool 未初始化')
    // queryAsync 不因 sync 熔断而拒绝——运营台读路径依赖它保活
    try {
      return await withTimeout(
        _pool.query(rawSql, params),
        timeoutForLabel(rawSql),
        rawSql.slice(0, 60)
      )
    } catch (e) {
      if (e && (e.code === 'DB_TIMEOUT' || /DB timeout/i.test(e.message || ''))) {
        recordDbFailure('timeout')
      }
      throw e
    }
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

async function closePool() {
  _closing = true
  if (_pool && typeof _pool.end === 'function') {
    try {
      await _pool.end()
    } catch (e) {
      console.warn('[db] pool end', e && e.message)
    }
  }
  _pool = null
  _db = null
}

module.exports = {
  open,
  openAsync,
  closePool,
  nowIso,
  DB_PATH,
  DIALECT,
  useMysql,
  convertSql,
  columnNames,
  addColumnIfMissing,
  ensureUserAccountColumnsAsync,
  queryAsync,
  runSync,
  getPool,
  runSeeds,
  getStabilityStats,
  markSchemasWarmed,
  isSchemasWarmed,
  isCircuitOpen,
  dbBusyError,
  hasNative: DIALECT === 'sqlite' ? !!Database : true,
}

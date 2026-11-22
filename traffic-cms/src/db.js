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
// 查询超时须明显短于 HTTP 墙钟，避免 handler 还占着 SyncGate 槽位时前端已超时
const DB_QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS || 3500)
const DB_DDL_TIMEOUT_MS = Number(process.env.DB_DDL_TIMEOUT_MS || 4000)
const DB_POOL_SIZE = Number(process.env.DB_POOL_SIZE || 24)
const DB_QUEUE_LIMIT = Number(process.env.DB_QUEUE_LIMIT || 16)
// deasync.loopWhile 会处理新请求；>1 会产生递归嵌套等待，最终所有槽位都无法回收。
// 同步兼容层必须严格单通道；C 端/运营台热读一律 queryAsync，禁止再扩 SyncGate。
const DB_SYNC_MAX = 1
/** 单次 syncAwait 墙钟上限（含 deasync）；须 ≥ 查询超时，防止 Promise 超时回调未进环时永久占闸 */
const DB_SYNC_WALL_MS = Number(process.env.DB_SYNC_WALL_MS || DB_QUERY_TIMEOUT_MS + 1500)
/** 事务整段占闸上限；超时强制释放，避免整站点击无响应 */
const DB_TX_WALL_MS = Number(process.env.DB_TX_WALL_MS || 12000)
/** 观测到 holder 超过此时长，acquire 时强制清闸（僵尸槽） */
const DB_STALE_HOLDER_MS = Number(process.env.DB_STALE_HOLDER_MS || 15000)
/** 熔断要钝：短暂抖动不该让步数/支付整站 10 秒全部 DB_BUSY */
const CIRCUIT_FAIL_THRESHOLD = Number(process.env.DB_CIRCUIT_FAILS || 24)
const CIRCUIT_WINDOW_MS = Number(process.env.DB_CIRCUIT_WINDOW_MS || 30000)
const CIRCUIT_OPEN_MS = Number(process.env.DB_CIRCUIT_OPEN_MS || 4000)
/**
 * 短窗内超时：只做熔断 + 有节制的池回收，禁止轻易 process.exit。
 * 旧阈值 4/20s 在冷启+迁移+hedged 前端并发下几乎必触发自杀 → 云托管 502 风暴。
 */
const DB_TIMEOUT_STORM_N = Number(process.env.DB_TIMEOUT_STORM_N || 24)
const DB_TIMEOUT_STORM_MS = Number(process.env.DB_TIMEOUT_STORM_MS || 30000)
/** 真要退出：还须连续两次风暴窗口，且不在 boot/migrate */
const DB_TIMEOUT_STORM_EXIT = process.env.DB_TIMEOUT_STORM_EXIT === '1'
let _timeoutStormTs = []
let _poolRecycleScheduled = false
let _lastPoolRecycleAt = 0
let _stormExitArmed = false
/** boot/migrate 期间禁止关池：关了会出现「Pool is closed」刷屏 + 二次风暴 */
let _bootPhase = false
let _migrating = false

/** 稳定性内核：SyncGate + 熔断观测 */
const _stab = {
  syncInflight: 0,
  syncMax: DB_SYNC_MAX,
  syncHolder: '',
  syncHolderSince: 0,
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

/**
 * 池回收默认关闭。
 * 实测：超时风暴里 end()/createPool 会把所有在途 query 打成 Pool is closed，
 * 下一拍就是整页 /me、steps、ops 同时 3500ms 超时（见 test-sever-180 23:42 日志）。
 * 仅显式 DB_POOL_RECYCLE=1 或 pool-closed 时才重建。
 */
const DB_POOL_RECYCLE = process.env.DB_POOL_RECYCLE === '1'

function schedulePoolRecycle(reason) {
  if (DIALECT !== 'mysql' || !_pool) return
  if (_bootPhase || _migrating) {
    console.warn(`[db] skip pool recycle during boot/migrate reason=${reason || ''}`)
    return
  }
  const forced = String(reason || '') === 'pool-closed'
  if (!forced && !DB_POOL_RECYCLE) return
  const now = Date.now()
  if (_poolRecycleScheduled || now - _lastPoolRecycleAt < 120000) return
  _poolRecycleScheduled = true
  _lastPoolRecycleAt = now
  console.error(`[db] schedule pool recycle reason=${reason || 'timeout'}`)
  setImmediate(() => {
    if (_bootPhase || _migrating) {
      _poolRecycleScheduled = false
      return
    }
    const old = _pool
    try {
      const mysql = require('mysql2/promise')
      _pool = mysql.createPool(mysqlConfig())
      _db = wrapMysqlPool(_pool)
    } catch (e) {
      console.error('[db] pool recreate failed', e && e.message)
      _poolRecycleScheduled = false
      return
    }
    _poolRecycleScheduled = false
    if (old && typeof old.end === 'function') {
      setTimeout(() => {
        try {
          old.end(() => {})
        } catch (_) {}
      }, 8000)
    }
  })
}

let _lastStormLogAt = 0
function noteTimeoutStorm(label) {
  const now = Date.now()
  _timeoutStormTs.push(now)
  _timeoutStormTs = _timeoutStormTs.filter((t) => now - t <= DB_TIMEOUT_STORM_MS)
  if (_bootPhase || _migrating) return
  // 超时风暴里绝不关池——那是二次放大的元凶
  if (_timeoutStormTs.length < DB_TIMEOUT_STORM_N) {
    _stormExitArmed = false
    return
  }
  if (now - _lastStormLogAt > 5000) {
    _lastStormLogAt = now
    console.error(
      `[db] TIMEOUT STORM n=${_timeoutStormTs.length} window=${DB_TIMEOUT_STORM_MS}ms (exit=${
        DB_TIMEOUT_STORM_EXIT ? 'armed' : 'disabled'
      } recycle=off)`
    )
  }
  if (!DB_TIMEOUT_STORM_EXIT) return
  if (!_stormExitArmed) {
    _stormExitArmed = true
    _timeoutStormTs = []
    return
  }
  console.error('[db] TIMEOUT STORM confirmed → process.exit(1)')
  setTimeout(() => {
    try {
      process.exit(1)
    } catch (_) {}
  }, 30)
}

function recordDbFailure(kind) {
  const now = Date.now()
  if (kind === 'timeout') {
    _stab.timeoutCount += 1
    noteTimeoutStorm('timeout')
  }
  if (kind === 'busy' || kind === 'stale') {
    _stab.busyCount += 1
    // 闸门满 / 自愈清槽只计数，不参与熔断与风暴自杀
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

/** 事务期间持闸嵌套深度：>0 时 syncAwait 不再反复 acquire/release，避免全局 _db 被别人踩 */
let _syncHoldDepth = 0

function forceClearStaleSyncSlot(reason) {
  const heldMs = _stab.syncHolderSince ? Math.max(0, Date.now() - _stab.syncHolderSince) : 0
  const holder = _stab.syncHolder || ''
  console.error(
    `[db] FORCE clear SyncGate inflight=${_stab.syncInflight} heldMs=${heldMs} holder=${holder.slice(
      0,
      80
    )} reason=${reason || 'stale'}`
  )
  _stab.syncInflight = 0
  _stab.syncHolder = ''
  _stab.syncHolderSince = 0
  _syncHoldDepth = 0
  // 自愈清槽不是真实 SQL 超时，不能计入 TIMEOUT STORM
  recordDbFailure('stale')
}

function acquireSyncSlot(label) {
  if (isCircuitOpen()) {
    throw dbBusyError(`DB_BUSY circuit open${label ? `: ${label}` : ''}`)
  }
  if (_stab.syncInflight >= _stab.syncMax) {
    const heldMs = _stab.syncHolderSince ? Math.max(0, Date.now() - _stab.syncHolderSince) : 0
    if (heldMs >= DB_STALE_HOLDER_MS) {
      // 僵尸占闸：Promise 超时未打断 deasync 时会出现「点击全无响应」
      forceClearStaleSyncSlot(`stale>${DB_STALE_HOLDER_MS}ms want=${String(label || '').slice(0, 40)}`)
    } else {
      recordDbFailure('busy')
      const holder = _stab.syncHolder ? ` holder=${_stab.syncHolder.slice(0, 60)}` : ''
      throw dbBusyError(
        `DB_BUSY sync gate full (${_stab.syncInflight}/${_stab.syncMax})${holder}${
          label ? ` want=${String(label).slice(0, 60)}` : ''
        }`
      )
    }
  }
  _stab.syncInflight += 1
  _stab.syncHolder = String(label || '').slice(0, 80)
  _stab.syncHolderSince = Date.now()
}

function releaseSyncSlot() {
  if (_stab.syncInflight > 0) _stab.syncInflight -= 1
  if (_stab.syncInflight <= 0) {
    _stab.syncInflight = 0
    _stab.syncHolder = ''
    _stab.syncHolderSince = 0
  }
}

function isSyncGateBusy() {
  return _stab.syncInflight >= _stab.syncMax || isCircuitOpen()
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

/**
 * MySQL 默认不用 deasync.node（会 FATAL Abort）。
 * 同步门面改走 Worker + Atomics.wait（运营台 adminSync / 遗留 sync SQL）。
 * C 端热路径仍应优先 queryAsync。DB_ALLOW_DEASYNC=1 可回退旧 deasync（不推荐）。
 */
const ALLOW_DEASYNC =
  DIALECT === 'sqlite' || String(process.env.DB_ALLOW_DEASYNC || '') === '1'
/** 用 Worker 桥接同步 SQL（MySQL 且未显式开 deasync） */
const USE_SYNC_WORKER = DIALECT === 'mysql' && !ALLOW_DEASYNC

let _syncWorker = null
let _syncWorkerReady = false
let _syncWorkerBootLogged = false

function ensureSyncWorker() {
  if (_syncWorker) return _syncWorker
  const { Worker } = require('worker_threads')
  const cfg = mysqlConfig()
  _syncWorker = new Worker(path.join(__dirname, 'syncMysqlWorker.js'), {
    workerData: {
      mysqlConfig: {
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        charset: 'utf8mb4',
        multipleStatements: true,
        connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
      },
      connectionLimit: 4,
    },
  })
  _syncWorker.on('error', (e) => {
    console.error('[db] sync worker error', e && e.message)
  })
  _syncWorker.on('exit', (code) => {
    console.warn('[db] sync worker exit', code)
    _syncWorker = null
    _syncWorkerReady = false
  })
  if (!_syncWorkerBootLogged) {
    _syncWorkerBootLogged = true
    console.log('[db] MySQL sync bridge: worker+Atomics (deasync off)')
  }
  _syncWorkerReady = true
  return _syncWorker
}

/**
 * 同步调用 Worker 执行 query/begin/commit/rollback。
 * 返回形态与 pool.query 一致：对 SELECT 为 rows 数组；对写为 ResultSetHeader。
 */
function workerCall(op, { sql = '', params = [], label = '' } = {}) {
  if (isCircuitOpen()) throw dbBusyError('DB_BUSY circuit open')
  const nested = _syncHoldDepth > 0
  if (!nested) acquireSyncSlot(label || op)
  else if (label) _stab.syncHolder = String(label).slice(0, 80)
  const queryLimit = timeoutForLabel(label || sql || op)
  const wallLimit = Math.max(queryLimit + 500, DB_SYNC_WALL_MS)
  const { receiveMessageOnPort, MessageChannel } = require('worker_threads')
  try {
    const worker = ensureSyncWorker()
    const lockSab = new SharedArrayBuffer(4)
    const lock = new Int32Array(lockSab)
    Atomics.store(lock, 0, 0)
    const { port1, port2 } = new MessageChannel()
    try {
      worker.postMessage({ op, sql, params, lockSab, port: port2 }, [port2])
      const deadline = Date.now() + wallLimit
      while (Atomics.load(lock, 0) === 0) {
        const left = deadline - Date.now()
        if (left <= 0) {
          const err = new Error(`DB wall timeout ${wallLimit}ms${label ? `: ${label}` : ''}`)
          err.code = 'DB_TIMEOUT'
          recordDbFailure('timeout')
          throw err
        }
        Atomics.wait(lock, 0, 0, Math.min(1000, left))
      }
      let got = receiveMessageOnPort(port1)
      // 偶发：notify 先于 message 入队，自旋几下再取
      for (let i = 0; !got && i < 50; i++) {
        Atomics.wait(lock, 0, 1, 2)
        got = receiveMessageOnPort(port1)
      }
      const msg = got && got.message
      if (!msg || !msg.ok) {
        const err = new Error((msg && msg.error && msg.error.message) || 'sync worker failed')
        if (msg && msg.error && msg.error.code) err.code = msg.error.code
        if (err.code === 'DB_TIMEOUT' || /timeout/i.test(err.message || '')) recordDbFailure('timeout')
        throw err
      }
      return msg.rows
    } finally {
      try {
        port1.close()
      } catch (_) {}
    }
  } finally {
    if (!nested) releaseSyncSlot()
  }
}

function syncAwait(startPromise, label) {
  // Worker 桥：wrapMysqlPool 已直接 workerCall；此处仅服务显式 begin/commit 等遗留
  if (USE_SYNC_WORKER) {
    const lab = String(label || '')
    if (/^begin transaction/i.test(lab)) return workerCall('begin', { label: lab })
    if (/^commit transaction/i.test(lab)) return workerCall('commit', { label: lab })
    if (/^rollback transaction/i.test(lab)) return workerCall('rollback', { label: lab })
    // 无法从 Promise 工厂抽出 SQL → 禁止静默走主线程 deasync
    throw dbBusyError(`DB_BUSY use worker query${label ? `: ${label}` : ''}`)
  }
  if (!deasync) deasync = require('deasync')
  // 必须先占槽，再启动 SQL。之前调用方先执行 q(...) 再进此函数，
  // 闸门满时虽然返回 DB_BUSY，但查询已经进入 mysql2 队列，最终耗尽整个池。
  // 事务外层已持闸时不再嵌套抢槽，保证整段 transaction 独占 SyncGate + 全局 _db。
  const nested = _syncHoldDepth > 0
  if (!nested) acquireSyncSlot(label)
  else if (label) _stab.syncHolder = String(label).slice(0, 80)
  let done = false
  let value
  let error
  let promise
  const queryLimit = timeoutForLabel(label)
  const wallLimit = Math.max(queryLimit + 500, DB_SYNC_WALL_MS)
  const deadline = Date.now() + wallLimit
  try {
    promise = typeof startPromise === 'function' ? startPromise() : startPromise
  } catch (e) {
    if (!nested) releaseSyncSlot()
    throw e
  }
  // 超时后底层 query 仍可能晚到 reject；先吞掉，避免 unhandledRejection 刷屏
  Promise.resolve(promise).catch(() => {})
  withTimeout(promise, queryLimit, label)
    .then((v) => {
      value = v
      done = true
    })
    .catch((e) => {
      error = e
      done = true
    })
  try {
    // 墙钟兜底：不能只靠 Promise/setTimeout——deasync 卡死时回调可能进不了环，
    // 曾出现 SELECT product 占闸数分钟 → 小程序点击全无响应。
    deasync.loopWhile(() => {
      if (done) return false
      if (Date.now() >= deadline) {
        const err = new Error(`DB wall timeout ${wallLimit}ms${label ? `: ${label}` : ''}`)
        err.code = 'DB_TIMEOUT'
        error = err
        done = true
        return false
      }
      return true
    })
  } finally {
    if (!nested) releaseSyncSlot()
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
  const heldMs = _stab.syncHolderSince ? Math.max(0, Date.now() - _stab.syncHolderSince) : 0
  return {
    dialect: DIALECT,
    inflight: _stab.syncInflight,
    syncMax: _stab.syncMax,
    syncHolder: _stab.syncHolder || '',
    syncHolderMs: heldMs,
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

/**
 * 僵尸 SyncGate 自愈：deasync 若永久卡在 loopWhile，墙钟/清槽都救不了事件环上的那次调用。
 * 超过阈值直接退出，让云托管拉起新实例（比整站点击假死更可接受）。
 */
const DB_ZOMBIE_EXIT_MS = Number(process.env.DB_ZOMBIE_EXIT_MS || Math.max(DB_STALE_HOLDER_MS * 2, 30000))
/** 默认只清槽，不 process.exit（exit 会在 min=1 时制造冷启连环超时） */
const DB_ZOMBIE_EXIT = process.env.DB_ZOMBIE_EXIT === '1'
let _zombieWatchStarted = false
function startSyncZombieWatchdog() {
  if (_zombieWatchStarted || DIALECT !== 'mysql') return
  _zombieWatchStarted = true
  setInterval(() => {
    if (_stab.syncInflight <= 0 || !_stab.syncHolderSince) return
    const heldMs = Date.now() - _stab.syncHolderSince
    if (heldMs < DB_ZOMBIE_EXIT_MS) return
    console.error(
      `[db] ZOMBIE SyncGate clear heldMs=${heldMs} holder=${String(_stab.syncHolder || '').slice(0, 80)} exit=${DB_ZOMBIE_EXIT}`
    )
    try {
      forceClearStaleSyncSlot(`zombie-exit>${DB_ZOMBIE_EXIT_MS}ms`)
    } catch (_) {}
    if (!DB_ZOMBIE_EXIT) return
    setTimeout(() => {
      try {
        process.exit(1)
      } catch (_) {}
    }, 50)
  }, 2000).unref?.()
}
startSyncZombieWatchdog()

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

/** 列名内存缓存：热路径禁止每次 information_schema */
const _columnCache = new Map()

/** 列名列表（兼容 SQLite PRAGMA / MySQL information_schema） */
function columnNames(adapter, table) {
  const key = String(table || '')
  if (_columnCache.has(key)) return _columnCache.get(key)
  const cols = adapter
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => String(c.name || c.NAME || c.COLUMN_NAME || '').toLowerCase())
    .filter(Boolean)
  if (cols.length) _columnCache.set(key, cols)
  return cols
}

/** 幂等加列；MySQL 用 VARCHAR，避免 TEXT DEFAULT 报错。仅 boot/admin 调用，禁止进 C 端热路径 */
function addColumnIfMissing(adapter, table, column, mysqlDef, sqliteDef) {
  const cols = columnNames(adapter, table)
  if (cols.includes(String(column).toLowerCase())) return false
  const def = DIALECT === 'mysql' ? mysqlDef : sqliteDef || mysqlDef
  try {
    adapter.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`)
    _columnCache.delete(String(table || ''))
    return true
  } catch (e) {
    if (e && (e.code === 'ER_DUP_FIELDNAME' || /duplicate column/i.test(e.message || ''))) {
      _columnCache.delete(String(table || ''))
      return false
    }
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
  const viaWorker = USE_SYNC_WORKER && !queryFn

  function runSyncQuery(rawSql, params, label) {
    if (viaWorker) {
      const rows = workerCall('query', { sql: rawSql, params, label })
      return [rows]
    }
    return syncAwait(() => q(rawSql, params), label)
  }

  function tableColumns(table) {
    const [rows] = runSyncQuery(
      `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
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
          const [rows] = runSyncQuery(rawSql, params, label)
          return rows[0]
        },
        all: (...params) => {
          const [rows] = runSyncQuery(rawSql, params, label)
          return rows
        },
        run: (...params) => {
          const [result] = runSyncQuery(rawSql, params, label)
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
          runSyncQuery(part, [], part.replace(/\s+/g, ' ').slice(0, 80))
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
        // 整段事务独占 SyncGate：fn() 执行期全局 _db 指向事务连接，禁止他请求踩线
        acquireSyncSlot('mysql.transaction')
        _syncHoldDepth += 1
        const txDeadline = Date.now() + DB_TX_WALL_MS
        let conn
        const prev = _db
        const assertTxAlive = (phase) => {
          if (Date.now() <= txDeadline) return
          const err = new Error(`DB tx wall timeout ${DB_TX_WALL_MS}ms: ${phase}`)
          err.code = 'DB_TIMEOUT'
          throw err
        }
        try {
          if (viaWorker) {
            workerCall('begin', { label: 'begin transaction' })
            assertTxAlive('after begin')
            // worker 内单连接事务；prepare 仍走 workerCall('query')，worker 复用 txConn
            const out = fn(...args)
            assertTxAlive('after fn')
            workerCall('commit', { label: 'commit transaction' })
            return out
          }
          conn = syncAwait(() => pool.getConnection(), 'get connection')
          assertTxAlive('after getConnection')
          _db = wrapMysqlPool(pool, (sql, params) => conn.query(sql, params))
          syncAwait(() => conn.beginTransaction(), 'begin transaction')
          assertTxAlive('after begin')
          const out = fn(...args)
          assertTxAlive('after fn')
          syncAwait(() => conn.commit(), 'commit transaction')
          return out
        } catch (e) {
          if (viaWorker) {
            try {
              workerCall('rollback', { label: 'rollback transaction' })
            } catch (_) {}
          } else if (conn) {
            try {
              syncAwait(() => conn.rollback(), 'rollback transaction')
            } catch (_) {}
          }
          throw e
        } finally {
          _db = prev
          if (conn) {
            try {
              conn.release()
            } catch (_) {}
          }
          _syncHoldDepth = Math.max(0, _syncHoldDepth - 1)
          releaseSyncSlot()
        }
      }
    },
  }
}

function migrateMysql(pool) {
  const sqlPath = fs.existsSync(SCHEMA_MYSQL) ? SCHEMA_MYSQL : SCHEMA_SQLITE
  const sql = fs.readFileSync(sqlPath, 'utf8')
  const viaWorker = USE_SYNC_WORKER && process.env.SYNC_MYSQL_WORKER !== '0'
  for (const part of splitStatements(sql)) {
    try {
      if (viaWorker) {
        workerCall('query', {
          sql: convertSql(part),
          params: [],
          label: part.replace(/\s+/g, ' ').slice(0, 80),
        })
      } else {
        syncAwait(() => pool.query(convertSql(part)), part.replace(/\s+/g, ' ').slice(0, 80))
      }
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
  _migrating = true
  try {
    // 先做一次连通性检查；DB 不可达时不要把几十条 DDL 各等一遍超时。
    await withTimeout(pool.query('SELECT 1 AS ok'), DB_QUERY_TIMEOUT_MS, 'connectivity')

    // 热库快路径：核心表已在则跳过整份 schema 重放，避免每次重启几十条 CREATE 抢连接
    try {
      const [core] = await withTimeout(
        pool.query(
          `SELECT COUNT(*) AS n FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME IN ('user_account','config_published','ops_config','lottery_prize','lottery_draw')`
        ),
        DB_DDL_TIMEOUT_MS,
        'core tables check'
      )
      const n = Number((core && core[0] && core[0].n) || 0)
      if (n >= 5) {
        console.log(`[db] migrate skip schema replay (core tables=${n})`)
        return
      }
    } catch (e) {
      console.warn('[db] core tables check', e && (e.code || e.message))
    }

    const sqlPath = fs.existsSync(SCHEMA_MYSQL) ? SCHEMA_MYSQL : SCHEMA_SQLITE
    const sql = fs.readFileSync(sqlPath, 'utf8')
    for (const part of splitStatements(sql)) {
      // 迁移过程中若指针被切换（不该发生），立刻停，避免 Pool is closed 刷屏
      if (_pool && pool !== _pool) {
        console.warn('[db] migrate aborted: pool swapped')
        break
      }
      try {
        await withTimeout(
          pool.query(convertSql(part)),
          timeoutForLabel(part),
          part.slice(0, 60)
        )
      } catch (e) {
        if (
          e &&
          (e.code === 'ER_TABLE_EXISTS_ERROR' ||
            e.code === 'ER_DUP_KEYNAME' ||
            e.code === 'ER_DUP_FIELDNAME' ||
            e.code === 'ER_BLOB_KEY_WITHOUT_LENGTH' ||
            /Duplicate key name/i.test(e.message || '') ||
            /Pool is closed/i.test(e.message || ''))
        ) {
          continue
        }
        if (e && e.code === 'ER_NO_SUCH_TABLE' && /^CREATE\s+INDEX/i.test(part)) continue
        console.warn(
          '[db] mysql migrate async:',
          e.code || e.message,
          part.slice(0, 60).replace(/\s+/g, ' ')
        )
      }
    }
  } finally {
    _migrating = false
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
    _bootPhase = true
    try {
      open({ skipMigrate: true, skipSeed: true })
      await migrateMysqlAsync(_pool)
      await migrateJarEpochColumnsAsync()
      await ensureUserAccountColumnsAsync()
      await seedCoreMysqlAsync()
      return _db
    } finally {
      _bootPhase = false
      // 冷启产生的超时不带到业务期，避免一开流量就武装风暴
      _timeoutStormTs = []
      _stormExitArmed = false
    }
  }
  return open()
}

/**
 * 真正的异步查询（不走 deasync）。
 * 在 async 路由里 await 之后禁止再用 prepare().get/run，否则 Node20 会 async hook 崩溃 → 503。
 */
async function queryAsync(sql, params = []) {
  if (_closing) throw dbBusyError('DB_BUSY closing')
  // 熔断已开：立刻忙失败，禁止再排队等 3500ms 把超时风暴越打越大
  if (DIALECT === 'mysql' && isCircuitOpen()) {
    throw dbBusyError('DB_BUSY circuit open')
  }
  // MySQL 懒开池禁止同步 migrate（Node20 + deasync 会打崩）；迁移只走 openAsync
  if (!_db) {
    if (DIALECT === 'mysql') open({ skipMigrate: true, skipSeed: true })
    else open()
  }
  const rawSql = convertSql(sql)
  if (DIALECT === 'mysql') {
    if (!_pool) throw new Error('MySQL pool 未初始化')
    // 风暴窗口内缩短单查墙钟，尽快失败让调用方走缓存/降级
    let limit = timeoutForLabel(rawSql)
    if (_timeoutStormTs.length >= Math.floor(DB_TIMEOUT_STORM_N / 2)) {
      limit = Math.min(limit, 1500)
    }
    try {
      return await withTimeout(_pool.query(rawSql, params), limit, rawSql.slice(0, 60))
    } catch (e) {
      const msg = String((e && e.message) || '')
      if (e && (e.code === 'DB_TIMEOUT' || /DB timeout/i.test(msg))) {
        recordDbFailure('timeout')
      } else if (/Pool is closed|Cannot enqueue/i.test(msg)) {
        // 池已被切换/关闭：记 busy 并尝试一次有节制的重建，不计入风暴自杀
        recordDbFailure('busy')
        schedulePoolRecycle('pool-closed')
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

/**
 * MySQL 真异步事务：C 端写路径专用，禁止再套 deasync transaction。
 * fn 收到 { query(sql, params) }，query 返回 [rows|result] 与 queryAsync 同形。
 */
async function withTransactionAsync(fn) {
  if (DIALECT !== 'mysql') {
    // sqlite：短同步事务仍可用
    return open().transaction(() => fn({
      query: (sql, params = []) => {
        const stmt = open().prepare(String(sql))
        const list = Array.isArray(params) ? params : [params]
        if (/^\s*select/i.test(String(sql))) {
          try {
            return [stmt.all(...list)]
          } catch (_) {
            const row = stmt.get(...list)
            return [row ? [row] : []]
          }
        }
        const info = stmt.run(...list)
        return [info]
      },
    }))()
  }
  if (!_pool) open({ skipMigrate: true, skipSeed: true })
  if (!_pool) throw new Error('MySQL pool 未初始化')
  if (isCircuitOpen()) throw dbBusyError('DB_BUSY circuit open')
  const conn = await _pool.getConnection()
  try {
    await conn.beginTransaction()
    const query = async (sql, params = []) => {
      const raw = convertSql(sql)
      return withTimeout(conn.query(raw, params), timeoutForLabel(raw), raw.slice(0, 60))
    }
    const result = await fn({ query, conn })
    await conn.commit()
    return result
  } catch (e) {
    try {
      await conn.rollback()
    } catch (_) {}
    const msg = String((e && e.message) || '')
    if (e && (e.code === 'DB_TIMEOUT' || /DB timeout/i.test(msg))) recordDbFailure('timeout')
    throw e
  } finally {
    try {
      conn.release()
    } catch (_) {}
  }
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
  withTransactionAsync,
  runSync,
  getPool,
  ALLOW_DEASYNC,
  USE_SYNC_WORKER,
  runSeeds,
  getStabilityStats,
  markSchemasWarmed,
  isSchemasWarmed,
  isCircuitOpen,
  isSyncGateBusy,
  dbBusyError,
  hasNative: DIALECT === 'sqlite' ? !!Database : true,
}

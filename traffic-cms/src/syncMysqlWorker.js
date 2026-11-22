/**
 * MySQL 同步桥 Worker：主线程 Atomics.wait + receiveMessageOnPort，
 * 本线程跑 mysql2/promise。替代会 Abort 的 deasync.node。
 */
const { workerData } = require('worker_threads')
const mysql = require('mysql2/promise')

let pool = null
/** @type {import('mysql2/promise').PoolConnection | null} */
let txConn = null

async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...workerData.mysqlConfig,
      waitForConnections: true,
      connectionLimit: Math.max(2, Number(workerData.connectionLimit) || 4),
      queueLimit: 32,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    })
  }
  return pool
}

function reply(port, lockSab, payload) {
  try {
    port.postMessage(payload)
  } catch (e) {
    try {
      port.postMessage({
        ok: false,
        error: { message: (e && e.message) || 'postMessage failed' },
      })
    } catch (_) {}
  }
  if (lockSab) {
    const lock = new Int32Array(lockSab)
    Atomics.store(lock, 0, 1)
    Atomics.notify(lock, 0)
  }
}

require('worker_threads').parentPort.on('message', async (msg) => {
  const { op, sql, params, lockSab, port } = msg || {}
  if (!port) return
  try {
    if (op === 'ping') {
      reply(port, lockSab, { ok: true, pong: true })
      return
    }
    if (op === 'begin') {
      if (txConn) {
        try {
          await txConn.rollback()
        } catch (_) {}
        try {
          txConn.release()
        } catch (_) {}
        txConn = null
      }
      const p = await getPool()
      txConn = await p.getConnection()
      await txConn.beginTransaction()
      reply(port, lockSab, { ok: true })
      return
    }
    if (op === 'commit') {
      if (!txConn) throw new Error('no transaction')
      await txConn.commit()
      txConn.release()
      txConn = null
      reply(port, lockSab, { ok: true })
      return
    }
    if (op === 'rollback') {
      if (txConn) {
        try {
          await txConn.rollback()
        } catch (_) {}
        try {
          txConn.release()
        } catch (_) {}
        txConn = null
      }
      reply(port, lockSab, { ok: true })
      return
    }
    if (op === 'query') {
      const runner = txConn || (await getPool())
      const [rows] = await runner.query(sql, params || [])
      reply(port, lockSab, { ok: true, rows })
      return
    }
    throw new Error(`unknown op ${op}`)
  } catch (e) {
    reply(port, lockSab, {
      ok: false,
      error: {
        message: (e && e.message) || String(e),
        code: e && e.code,
        errno: e && e.errno,
        sqlState: e && e.sqlState,
      },
    })
  }
})

const mysql = require('mysql2/promise')
require('dotenv').config()

const CLOUD_DB_HOST = 'sh-cynosdbmysql-grp-gscxxq7o.sql.tencentcdb.com'
const CLOUD_DB_PORT = 24154
const PLACEHOLDERS = ['', 'root密码', 'DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_NAME', '${DB_USER}', '${DB_PASSWORD}', '${DB_HOST}', '${DB_NAME}']

function env(name, fallback) {
  const v = String(process.env[name] == null ? '' : process.env[name]).trim()
  if (!v) return fallback
  if (PLACEHOLDERS.indexOf(v) !== -1) return fallback
  if (/^\$\{[A-Z0-9_]+\}$/.test(v)) return fallback
  return v
}

const inContainer = String(process.env.PORT) === '80'
const rawHost = env('DB_HOST', '')
const localHost = !rawHost || rawHost === 'localhost' || rawHost === '127.0.0.1' || rawHost === '::1'

const host = (!localHost) ? rawHost : (inContainer ? CLOUD_DB_HOST : (rawHost || 'localhost'))
const port = (!localHost && env('DB_PORT', '')) ? Number(env('DB_PORT', '3306')) : (inContainer ? CLOUD_DB_PORT : Number(env('DB_PORT', '3306')))
const user = env('DB_USER', 'root')
const password = env('DB_PASSWORD', '')
const database = env('DB_NAME', 'travel_clothes')

const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  idleTimeout: 60000,
  maxIdle: 5
})

console.log('MySQL user=' + user, host + ':' + port, database)

function isTransient(err) {
  const code = String((err && err.code) || '')
  const msg = String((err && err.message) || '')
  return /PROTOCOL_CONNECTION_LOST|ECONNRESET|ETIMEDOUT|EPIPE|CONNECTION_LOST|ER_SERVER_SHUTDOWN|closed state|Cannot enqueue Handshake/i.test(code + ' ' + msg)
}

async function query(sql, params) {
  try {
    return await pool.query(sql, params)
  } catch (err) {
    if (!isTransient(err)) throw err
    console.warn('MySQL transient, retry once:', err.code || err.message)
    return pool.query(sql, params)
  }
}

function startKeepAlive(intervalMs) {
  const ms = intervalMs || 55000
  const timer = setInterval(() => {
    query('SELECT 1').catch((e) => console.warn('MySQL keepalive', e.code || e.message))
  }, ms)
  if (timer.unref) timer.unref()
  return timer
}

module.exports = pool
module.exports.query = query
module.exports.getConnection = () => pool.getConnection()
module.exports.startKeepAlive = startKeepAlive
module.exports.pool = pool

const mysql = require('mysql2/promise')
require('dotenv').config()

const CLOUD_DB_HOST = 'sh-cynosdbmysql-grp-gscxxq7o.sql.tencentcdb.com'
const CLOUD_DB_PORT = 24154
const inContainer = String(process.env.PORT) === '80'
const rawHost = process.env.DB_HOST || ''
const localHost = !rawHost || rawHost === 'localhost' || rawHost === '127.0.0.1' || rawHost === '::1'

const host = (!localHost) ? rawHost : (inContainer ? CLOUD_DB_HOST : (rawHost || 'localhost'))
const port = (!localHost && process.env.DB_PORT) ? Number(process.env.DB_PORT) : (inContainer ? CLOUD_DB_PORT : Number(process.env.DB_PORT || 3306))

const pool = mysql.createPool({
  host,
  port,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'travel_clothes',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
})

console.log('MySQL', host + ':' + port, process.env.DB_NAME || 'travel_clothes')

module.exports = pool

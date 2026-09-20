const fs = require('fs')
const path = require('path')
const { uploadFile, localToCosUrl, COS_PREFIX } = require('../config/cos')
const mock = require('./mock')
const seed = require('./seed')

const MOCK_DIR = path.join(__dirname, '../../assets/mock')

async function uploadAll() {
  if (!fs.existsSync(MOCK_DIR)) throw new Error('找不到素材目录 backend/assets/mock')
  const files = fs.readdirSync(MOCK_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  const uploaded = []
  for (const file of files) {
    const localPath = path.join(MOCK_DIR, file)
    const key = `${COS_PREFIX}/${file}`
    const result = await uploadFile(localPath, key)
    uploaded.push({ file, key: result.key, url: result.url })
  }
  return uploaded
}

async function rewriteDbUrls(db) {
  const tables = [
    ['spots', 'photo'],
    ['garments', 'photo'],
    ['events', 'photo'],
    ['banners', 'image'],
    ['checkin_spots', 'photo'],
    ['services', 'cover']
  ]
  const updated = {}
  for (const [table, col] of tables) {
    try {
      const [rows] = await db.query(`SELECT id, ${col} AS src FROM ${table} WHERE ${col} IS NOT NULL AND ${col} != ''`)
      let n = 0
      for (const row of rows) {
        if (String(row.src).startsWith('http')) continue
        const url = localToCosUrl(row.src)
        await db.query(`UPDATE ${table} SET ${col} = ? WHERE id = ?`, [url, row.id])
        n++
      }
      updated[table] = n
    } catch (e) {
      updated[table] = e.message
    }
  }
  return updated
}

async function run(db) {
  const uploaded = await uploadAll()
  try {
    const [[{ cnt }]] = await db.query('SELECT COUNT(*) AS cnt FROM spots')
    if (!cnt) await seed.run(db)
  } catch (e) {
    // 表尚未创建时由调用方先执行 /api/db/init
  }
  const dbUpdated = await rewriteDbUrls(db)
  const social = await mock.run(db)
  return { uploaded: uploaded.length, files: uploaded, dbUpdated, social }
}

module.exports = { run, uploadAll, rewriteDbUrls }

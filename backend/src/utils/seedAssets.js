const fs = require('fs')
const path = require('path')
const { uploadFile, localToCosUrl, COS_PREFIX, listPrefix } = require('../config/cos')
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
    ['services', 'cover'],
    ['home_cats', 'icon'],
    ['home_cats', 'hero'],
    ['travel_guides', 'photo']
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
      updated[table + '.' + col] = n
    } catch (e) {
      updated[table + '.' + col] = e.message
    }
  }
  return updated
}

async function runIfNeeded(db) {
  let uploaded = { skipped: true, uploaded: 0 }
  try {
    const objects = await listPrefix(COS_PREFIX + '/')
    if (objects.length >= 20) {
      uploaded = { skipped: true, count: objects.length, reason: 'COS 已有素材' }
    } else {
      const files = await uploadAll()
      uploaded = { skipped: false, uploaded: files.length, files }
    }
  } catch (e) {
    try {
      const files = await uploadAll()
      uploaded = { skipped: false, uploaded: files.length, files, listError: e.message }
    } catch (e2) {
      uploaded = { skipped: true, reason: e2.message }
    }
  }
  try {
    await seed.seedHome(db)
  } catch (e) {}
  const dbUpdated = await rewriteDbUrls(db)
  try {
    await db.query(
      `UPDATE services s JOIN spots sp ON s.spot_id = sp.id
       SET s.cover = sp.photo WHERE s.cover IS NULL OR s.cover = ''`
    )
  } catch (e) {}
  return Object.assign({}, uploaded, { dbUpdated })
}

async function run(db) {
  const uploaded = await uploadAll()
  try {
    const [[{ cnt }]] = await db.query('SELECT COUNT(*) AS cnt FROM spots')
    if (!cnt) await seed.run(db)
  } catch (e) {
    // 表尚未创建时由调用方先执行 /api/db/init
  }
  try {
    await seed.seedHome(db)
  } catch (e) {}
  const dbUpdated = await rewriteDbUrls(db)
  const social = await mock.run(db)
  return { uploaded: uploaded.length, files: uploaded, dbUpdated, social }
}

module.exports = { run, runIfNeeded, uploadAll, rewriteDbUrls }

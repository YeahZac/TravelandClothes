const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 路由
app.use('/api/user', require('./routes/user'))
app.use('/api/member', require('./routes/member'))
app.use('/api/card', require('./routes/card'))
app.use('/api/passport', require('./routes/passport'))
app.use('/api/order', require('./routes/order'))
app.use('/api/post', require('./routes/post'))
app.use('/api/content', require('./routes/content'))
app.use('/api/interact', require('./routes/interact'))
app.use('/api/db', require('./routes/db'))
app.use('/api/upload', require('./routes/upload'))

// 健康检查
app.get('/health', async (req, res) => {
  const info = { status: 'ok', service: 'travel-clothes-backend' }
  try {
    const db = require('./config/database')
    await db.query('SELECT 1')
    info.db = 'up'
    const [tables] = await db.query('SHOW TABLES')
    info.tableCount = (tables || []).length
  } catch (e) {
    info.db = 'down'
    info.dbError = e.code || e.message
  }
  res.json(info)
})

// 错误处理
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ code: 500, msg: '服务器内部错误', data: null })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`同袍会后端运行在端口 ${PORT}`)
  bootstrap()
})

async function bootstrap() {
  const db = require('./config/database')
  const seed = require('./utils/seed')
  const seedAssets = require('./utils/seedAssets')
  const { applySchema } = require('./utils/sql')
  try {
    const schema = await applySchema(db)
    console.log('数据库建表', schema.executed, '条', schema.errors.length ? ('错误 ' + schema.errors.length) : 'ok')
    const seeded = await seed.run(db)
    console.log('数据库灌数', JSON.stringify(seeded))
  } catch (e) {
    console.error('数据库初始化', e.message)
  }
  try {
    const r = await seedAssets.runIfNeeded(db)
    console.log('COS 素材', r && (r.skipped ? r.reason : ('上传 ' + r.uploaded)))
  } catch (e) {
    console.error('COS 素材同步失败', e.message)
  }
}

module.exports = app

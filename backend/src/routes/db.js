const express = require('express')
const router = express.Router()
const db = require('../config/database')
const seed = require('../utils/seed')
const mock = require('../utils/mock')
const seedAssets = require('../utils/seedAssets')
const { applySchema } = require('../utils/sql')
const { success, fail } = require('../utils/response')

// POST /api/db/init — 自动建表
router.post('/init', async (req, res) => {
  try {
    const result = await applySchema(db)
    success(res, result, `建表完成，执行了 ${result.executed} 条 SQL`)
  } catch (e) {
    console.error(e)
    fail(res, '建表失败: ' + e.message)
  }
})

// POST /api/db/seed — 灌入初始内容数据
router.post('/seed', async (req, res) => {
  try {
    const results = await seed.run(db)
    success(res, results, '数据灌入完成')
  } catch (e) {
    console.error(e)
    fail(res, '灌入失败: ' + e.message)
  }
})

// POST /api/db/reset — 重置（建表+灌数据）
router.post('/reset', async (req, res) => {
  try {
    const schema = await applySchema(db)
    const results = await seed.run(db)
    success(res, { schema, seed: results }, '重置完成')
  } catch (e) {
    fail(res, '重置失败: ' + e.message)
  }
})

// POST /api/db/seed-assets — 把模拟图片上传到 COS，并回写数据库地址
router.post('/seed-assets', async (req, res) => {
  try {
    const results = await seedAssets.run(db)
    success(res, results, `已上传 ${results.uploaded} 张图片到对象存储`)
  } catch (e) {
    console.error(e)
    fail(res, '素材上传失败: ' + e.message)
  }
})

// POST /api/db/mock — 灌入模拟数据（假用户/动态/评论/点赞/消息/通知/订单）
router.post('/mock', async (req, res) => {
  try {
    const results = await mock.run(db)
    success(res, results, '模拟数据灌入完成')
  } catch (e) {
    console.error(e)
    fail(res, '模拟数据失败: ' + e.message)
  }
})

module.exports = router

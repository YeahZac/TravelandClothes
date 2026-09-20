const express = require('express')
const router = express.Router()
const db = require('../config/database')
const { success, fail } = require('../utils/response')

// ===== 景区 =====
router.get('/spot/list', async (req, res) => {
  try {
    const { city } = req.query
    let sql = 'SELECT * FROM spots WHERE status = 1'
    const params = []
    if (city && city !== '全部') { sql += ' AND (city = ? OR region = ?)'; params.push(city, city) }
    sql += ' ORDER BY sort_order'
    const [rows] = await db.query(sql, params)
    success(res, rows)
  } catch (e) { fail(res, '查询失败') }
})

router.get('/spot/:id', async (req, res) => {
  try {
    const [[spot]] = await db.query('SELECT * FROM spots WHERE id = ? OR spot_code = ?', [req.params.id, req.params.id])
    if (!spot) return fail(res, '景区不存在')
    const [[scene]] = await db.query('SELECT * FROM scenes WHERE id = ?', [spot.scene_id])
    const [events] = await db.query('SELECT * FROM events WHERE spot_id = ? AND status = 1', [spot.id])
    const [services] = await db.query('SELECT s.* FROM services s JOIN spot_services ss ON s.id = ss.service_id WHERE ss.spot_id = ? AND s.status = 1', [spot.id])
    const [checkins] = await db.query('SELECT * FROM checkin_spots WHERE spot_id = ? AND status = 1', [spot.id])
    const [garments] = await db.query('SELECT g.* FROM garments g JOIN garment_spots gs ON g.id = gs.garment_id WHERE gs.spot_id = ? AND g.status = 1', [spot.id])
    success(res, { ...spot, scene, events, services, checkins, garments })
  } catch (e) { fail(res, '查询失败') }
})

// ===== 活动 =====
router.get('/event/list', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM events WHERE status = 1 ORDER BY sort_order')
    success(res, rows)
  } catch (e) { fail(res, '查询失败') }
})

router.get('/event/:id', async (req, res) => {
  try {
    const [[event]] = await db.query('SELECT * FROM events WHERE id = ? OR event_code = ?', [req.params.id, req.params.id])
    if (!event) return fail(res, '活动不存在')
    const [[spot]] = await db.query('SELECT * FROM spots WHERE id = ?', [event.spot_id])
    const [[garment]] = await db.query('SELECT * FROM garments WHERE id = ?', [event.garment_id])
    const [services] = await db.query('SELECT s.* FROM services s JOIN event_services es ON s.id = es.service_id WHERE es.event_id = ? AND s.status = 1', [event.id])
    success(res, { ...event, spot, garment, services })
  } catch (e) { fail(res, '查询失败') }
})

// ===== 服务 =====
router.get('/service/list', async (req, res) => {
  try {
    const { type, spotId } = req.query
    let sql = 'SELECT * FROM services WHERE status = 1'
    const params = []
    if (type) { sql += ' AND type = ?'; params.push(type) }
    if (spotId) { sql += ' AND spot_id = ?'; params.push(spotId) }
    sql += ' ORDER BY sort_order'
    const [rows] = await db.query(sql, params)
    success(res, rows)
  } catch (e) { fail(res, '查询失败') }
})

router.get('/service/:id', async (req, res) => {
  try {
    const [[service]] = await db.query('SELECT * FROM services WHERE id = ? OR service_code = ?', [req.params.id, req.params.id])
    if (!service) return fail(res, '服务不存在')
    const [[spot]] = await db.query('SELECT * FROM spots WHERE id = ?', [service.spot_id])
    success(res, { ...service, spot })
  } catch (e) { fail(res, '查询失败') }
})

// ===== 汉服形制 =====
router.get('/garment/list', async (req, res) => {
  try {
    const { era } = req.query
    let sql = 'SELECT * FROM garments WHERE status = 1'
    const params = []
    if (era && era !== '全部') { sql += ' AND era LIKE ?'; params.push('%' + era + '%') }
    sql += ' ORDER BY sort_order'
    const [rows] = await db.query(sql, params)
    success(res, rows)
  } catch (e) { fail(res, '查询失败') }
})

router.get('/garment/:id', async (req, res) => {
  try {
    const [[garment]] = await db.query('SELECT * FROM garments WHERE id = ? OR garment_code = ?', [req.params.id, req.params.id])
    if (!garment) return fail(res, '形制不存在')
    const [spots] = await db.query('SELECT s.* FROM spots s JOIN garment_spots gs ON s.id = gs.spot_id WHERE gs.garment_id = ? AND s.status = 1', [garment.id])
    const [events] = await db.query('SELECT * FROM events WHERE garment_id = ? AND status = 1', [garment.id])
    success(res, { ...garment, spots, events })
  } catch (e) { fail(res, '查询失败') }
})

// ===== 文化文章 =====
router.get('/article/list', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM articles WHERE status = 1 ORDER BY sort_order')
    success(res, rows)
  } catch (e) { fail(res, '查询失败') }
})

router.get('/article/:id', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM articles WHERE id = ? OR article_code = ?', [req.params.id, req.params.id])
    if (!row) return fail(res, '文章不存在')
    success(res, row)
  } catch (e) { fail(res, '查询失败') }
})

// ===== 打卡点 =====
router.get('/checkin/list', async (req, res) => {
  try {
    const { spotId } = req.query
    let sql = 'SELECT * FROM checkin_spots WHERE status = 1'
    const params = []
    if (spotId) { sql += ' AND spot_id = ?'; params.push(spotId) }
    sql += ' ORDER BY sort_order'
    const [rows] = await db.query(sql, params)
    success(res, rows)
  } catch (e) { fail(res, '查询失败') }
})

// ===== 穿搭指南 =====
router.get('/guide/list', async (req, res) => {
  try {
    const [guides] = await db.query('SELECT * FROM guides ORDER BY sort_order')
    const [taboos] = await db.query('SELECT * FROM taboos ORDER BY sort_order')
    success(res, { guides, taboos })
  } catch (e) { fail(res, '查询失败') }
})

// ===== 测验 =====
router.get('/quiz/questions', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM quiz_questions WHERE status = 1 ORDER BY sort_order')
    success(res, rows)
  } catch (e) { fail(res, '查询失败') }
})

router.post('/quiz/submit', async (req, res) => {
  try {
    const { userId, score, total } = req.body
    const [[member]] = await db.query('SELECT id FROM members WHERE user_id = ?', [userId])
    if (member) {
      await db.query('INSERT INTO quiz_records (member_id, score, total) VALUES (?, ?, ?)', [member.id, score, total])
    }
    success(res, null, '提交成功')
  } catch (e) { fail(res, '提交失败') }
})

// ===== 轮播图 =====
router.get('/banner/list', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM banners WHERE status = 1 ORDER BY sort_order')
    success(res, rows)
  } catch (e) { fail(res, '查询失败') }
})

// ===== 分类 =====
router.get('/category/list', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM categories WHERE status = 1 ORDER BY sort_order')
    success(res, rows)
  } catch (e) { fail(res, '查询失败') }
})

module.exports = router

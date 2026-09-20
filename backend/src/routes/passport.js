const express = require('express')
const router = express.Router()
const db = require('../config/database')
const { success, fail } = require('../utils/response')

// 获取我的护照
router.get('/:userId', async (req, res) => {
  try {
    const [members] = await db.query('SELECT id FROM members WHERE user_id = ?', [req.params.userId])
    if (members.length === 0) return fail(res, '会员不存在')
    const memberId = members[0].id

    const [passports] = await db.query('SELECT * FROM passports WHERE member_id = ?', [memberId])
    let passport = passports[0]
    if (!passport) {
      // 自动创建电子护照
      const [r] = await db.query('INSERT INTO passports (member_id) VALUES (?)', [memberId])
      passport = { id: r.insertId, member_id: memberId, has_physical_book: 0 }
    }

    // 获取所有盖章记录
    const [stamps] = await db.query(
      `SELECT s.*, sc.name as scene_name, r.name as route_name FROM stamps s
       LEFT JOIN scenes sc ON s.scene_id = sc.id
       LEFT JOIN routes r ON s.route_id = r.id
       WHERE s.passport_id = ? ORDER BY s.stamped_at DESC`,
      [passport.id]
    )

    // 按线路分组统计
    const [routeProgress] = await db.query(
      `SELECT r.id, r.name, r.required_stamps, COUNT(s.id) as stamped FROM routes r
       LEFT JOIN stamps s ON s.route_id = r.id AND s.passport_id = ? GROUP BY r.id`,
      [passport.id]
    )

    success(res, { passport, stamps, routeProgress })
  } catch (e) {
    console.error(e)
    fail(res, '查询失败')
  }
})

// 盖章（实物章/电子章）
router.post('/stamp', async (req, res) => {
  const conn = await db.getConnection()
  try {
    const { userId, sceneId, isPhysical } = req.body
    if (!userId || !sceneId) return fail(res, '缺少参数')

    const [members] = await conn.query('SELECT id FROM members WHERE user_id = ?', [userId])
    if (members.length === 0) return fail(res, '会员不存在')
    const memberId = members[0].id

    // 获取或创建护照
    let [passports] = await conn.query('SELECT * FROM passports WHERE member_id = ?', [memberId])
    let passportId
    if (passports.length === 0) {
      const [r] = await conn.query('INSERT INTO passports (member_id) VALUES (?)', [memberId])
      passportId = r.insertId
    } else {
      passportId = passports[0].id
    }

    // 获取景区所属线路
    const [scenes] = await conn.query('SELECT * FROM scenes WHERE id = ?', [sceneId])
    if (scenes.length === 0) return fail(res, '景区不存在')
    const scene = scenes[0]

    // 检查是否已盖章
    const [existing] = await conn.query('SELECT id FROM stamps WHERE passport_id = ? AND scene_id = ?', [passportId, sceneId])
    if (existing.length > 0) return fail(res, '该景区已盖章')

    // 盖章
    await conn.query(
      'INSERT INTO stamps (passport_id, scene_id, route_id, is_physical) VALUES (?, ?, ?, ?)',
      [passportId, sceneId, scene.route_id, isPhysical ? 1 : 0]
    )

    // 检查线路是否集齐
    let badgeAwarded = null
    if (scene.route_id) {
      const [routes] = await conn.query('SELECT * FROM routes WHERE id = ?', [scene.route_id])
      if (routes.length > 0) {
        const route = routes[0]
        const [count] = await conn.query('SELECT COUNT(*) as cnt FROM stamps WHERE passport_id = ? AND route_id = ?', [passportId, scene.route_id])
        if (count[0].cnt >= route.required_stamps) {
          // 集齐，发放勋章
          await conn.query('INSERT INTO badges (member_id, badge_type, route_id) VALUES (?, ?, ?)', [memberId, 'route_' + route.route_code, route.id])
          badgeAwarded = route.reward_badge_name
          // 线路+200成长值
          await conn.query('UPDATE members SET growth_value = growth_value + 200 WHERE id = ?', [memberId])
          await conn.query('INSERT INTO growth_records (member_id, action_type, action_value, ref_id, ref_type) VALUES (?, "route", 200, ?, "stamp")', [memberId, passportId])
        }
      }
    }

    success(res, { badgeAwarded, growthAdded: badgeAwarded ? 200 : 0 }, badgeAwarded ? '盖章成功，集齐线路获得勋章！' : '盖章成功')
  } catch (e) {
    console.error(e)
    await conn.rollback()
    fail(res, '盖章失败')
  } finally {
    conn.release()
  }
})

// 领取实体勋章
router.post('/badge/claim', async (req, res) => {
  try {
    const { userId, badgeId } = req.body
    await db.query(
      `UPDATE badges SET status = 1 WHERE id = ? AND member_id = (SELECT id FROM members WHERE user_id = ?)`,
      [badgeId, userId]
    )
    success(res, null, '领取成功')
  } catch (e) {
    fail(res, '领取失败')
  }
})

// 获取我的勋章
router.get('/:userId/badges', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT b.*, r.name as route_name FROM badges b LEFT JOIN routes r ON b.route_id = r.id WHERE b.member_id = (SELECT id FROM members WHERE user_id = ?)`,
      [req.params.userId]
    )
    success(res, rows)
  } catch (e) {
    fail(res, '查询失败')
  }
})

module.exports = router

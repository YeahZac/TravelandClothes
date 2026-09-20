const express = require('express')
const router = express.Router()
const db = require('../config/database')
const { success, fail, calcLevelByGrowth, LEVEL_THRESHOLDS } = require('../utils/response')

// 创建订单
router.post('/create', async (req, res) => {
  try {
    const { userId, type, refId, amount } = req.body
    if (!userId || !type) return fail(res, '缺少参数')

    const orderNo = 'OD' + Date.now() + Math.floor(Math.random() * 1000)
    const [members] = await db.query('SELECT id FROM members WHERE user_id = ?', [userId])
    if (members.length === 0) return fail(res, '会员不存在')

    const [r] = await db.query(
      'INSERT INTO orders (order_no, member_id, type, ref_id, amount, status) VALUES (?, ?, ?, ?, ?, 0)',
      [orderNo, members[0].id, type, refId || null, amount || 0]
    )
    success(res, { orderId: r.insertId, orderNo }, '订单创建成功')
  } catch (e) {
    fail(res, '创建失败')
  }
})

// 支付回调（模拟微信支付回调）
router.post('/pay-callback', async (req, res) => {
  const conn = await db.getConnection()
  try {
    const { orderNo } = req.body
    const [orders] = await conn.query('SELECT * FROM orders WHERE order_no = ? FOR UPDATE', [orderNo])
    if (orders.length === 0) return fail(res, '订单不存在')
    const order = orders[0]
    if (order.status !== 0) return fail(res, '订单状态异常')

    await conn.query('UPDATE orders SET status = 1, paid_at = NOW() WHERE id = ?', [order.id])

    // 消费累计成长值（1元=1值）
    if (order.amount > 0) {
      const [members] = await conn.query('SELECT * FROM members WHERE id = ?', [order.member_id])
      const member = members[0]
      const growth = Math.floor(order.amount / 100)
      const newGrowth = member.growth_value + growth
      const newLevel = calcLevelByGrowth(newGrowth)
      await conn.query('UPDATE members SET growth_value = ?, level = ? WHERE id = ?', [newGrowth, newLevel, member.id])
      await conn.query('INSERT INTO growth_records (member_id, action_type, action_value, ref_id, ref_type) VALUES (?, "consume", ?, ?, "order")', [member.id, growth, orderNo])
    }

    success(res, null, '支付成功')
  } catch (e) {
    await conn.rollback()
    fail(res, '支付回调失败')
  } finally {
    conn.release()
  }
})

// 查询我的订单
router.get('/:userId', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM orders WHERE member_id = (SELECT id FROM members WHERE user_id = ?) ORDER BY created_at DESC`,
      [req.params.userId]
    )
    success(res, rows)
  } catch (e) {
    fail(res, '查询失败')
  }
})

// 退款
router.post('/refund', async (req, res) => {
  const conn = await db.getConnection()
  try {
    const { orderNo } = req.body
    const [orders] = await conn.query('SELECT * FROM orders WHERE order_no = ? FOR UPDATE', [orderNo])
    if (orders.length === 0) return fail(res, '订单不存在')
    const order = orders[0]
    if (order.status !== 1) return fail(res, '订单不可退款')

    await conn.query('UPDATE orders SET status = 3, refunded_at = NOW() WHERE id = ?', [order.id])
    success(res, null, '退款成功')
  } catch (e) {
    await conn.rollback()
    fail(res, '退款失败')
  } finally {
    conn.release()
  }
})

module.exports = router

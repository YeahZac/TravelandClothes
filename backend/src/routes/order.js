const express = require('express')
const router = express.Router()
const db = require('../config/database')
const { success, fail, resolveMemberLevel, ticketQuote } = require('../utils/response')

async function findMember(userId, conn) {
  const client = conn || db
  const [members] = await client.query('SELECT * FROM members WHERE user_id = ?', [userId])
  return members[0] || null
}

async function activeCard(memberId, conn) {
  const client = conn || db
  const [cards] = await client.query(
    'SELECT * FROM annual_cards WHERE member_id = ? AND status = 1 ORDER BY expire_at DESC LIMIT 1',
    [memberId]
  )
  return cards[0] || null
}

router.post('/quote', async (req, res) => {
  try {
    const { userId, type, amount } = req.body
    const listFen = Number(amount || 0)
    if (!userId) return fail(res, '缺少参数')
    const member = await findMember(userId)
    if (!member) return fail(res, '会员不存在')
    const card = await activeCard(member.id)
    const quote = ticketQuote(card, listFen, type || 'ticket')
    success(res, quote)
  } catch (e) {
    console.error(e)
    fail(res, '询价失败')
  }
})

router.post('/create', async (req, res) => {
  try {
    const { userId, type, refId, amount, payAmount, title, cover, place, qty, visitor, phone, useDay, coveredByCard } = req.body
    if (!userId || !type) return fail(res, '缺少参数')

    const member = await findMember(userId)
    if (!member) return fail(res, '会员不存在')

    const orderNo = 'OD' + Date.now() + Math.floor(Math.random() * 1000)
    const listFen = Number(amount || 0)
    const card = await activeCard(member.id)
    const quote = ticketQuote(card, listFen, type)
    const realPay = payAmount != null ? Number(payAmount) : quote.payFen
    const covered = coveredByCard != null ? Number(!!coveredByCard) : (quote.canCover ? 1 : 0)

    const [r] = await db.query(
      `INSERT INTO orders (order_no, member_id, type, ref_id, title, cover, place, qty, visitor, phone, use_day, amount, pay_amount, covered_by_card, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [orderNo, member.id, type, refId || null, title || null, cover || null, place || null, qty || 1, visitor || null, phone || null, useDay || null, listFen, realPay, covered]
    )
    success(res, { orderId: r.insertId, orderNo, payAmount: realPay, coveredByCard: covered }, '订单创建成功')
  } catch (e) {
    console.error(e)
    fail(res, '创建失败')
  }
})

async function settlePay(orderNo) {
  const conn = await db.getConnection()
  await conn.beginTransaction()
  try {
    const [orders] = await conn.query('SELECT * FROM orders WHERE order_no = ? FOR UPDATE', [orderNo])
    if (orders.length === 0) throw new Error('订单不存在')
    const order = orders[0]
    if (order.status !== 0) throw new Error('订单状态异常')

    const [members] = await conn.query('SELECT * FROM members WHERE id = ? FOR UPDATE', [order.member_id])
    const member = members[0]
    const card = await activeCard(member.id, conn)
    const quote = ticketQuote(card, order.amount, order.type)
    const payFen = order.pay_amount != null ? order.pay_amount : quote.payFen
    const covered = order.covered_by_card || quote.canCover

    await conn.query('UPDATE orders SET status = 1, paid_at = NOW(), pay_amount = ?, covered_by_card = ? WHERE id = ?', [payFen, covered ? 1 : 0, order.id])

    if (covered && card) {
      await conn.query('UPDATE annual_cards SET remain_scenic = GREATEST(remain_scenic - 1, 0) WHERE id = ?', [card.id])
      await conn.query('UPDATE members SET saved_fen = saved_fen + ? WHERE id = ?', [order.amount, member.id])
    }

    const growth = payFen > 0 ? Math.floor(payFen / 100) : (covered ? 20 : 0)
    const actionType = payFen > 0 ? 'consume' : 'checkin'
    if (growth > 0) {
      const newGrowth = member.growth_value + growth
      const resolved = resolveMemberLevel(newGrowth, 1 === member.card_status ? 1 : (card ? 1 : 0))
      await conn.query('UPDATE members SET growth_value = ?, level = ? WHERE id = ?', [newGrowth, resolved.level, member.id])
      await conn.query(
        'INSERT INTO growth_records (member_id, action_type, action_value, ref_id, ref_type) VALUES (?, ?, ?, ?, "order")',
        [member.id, actionType, growth, orderNo]
      )
    }

    await conn.commit()
    return { orderNo, payFen, covered: !!covered }
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}

router.post('/pay', async (req, res) => {
  try {
    const { orderNo } = req.body
    if (!orderNo) return fail(res, '缺少订单号')
    const data = await settlePay(orderNo)
    success(res, data, '支付成功')
  } catch (e) {
    console.error(e)
    fail(res, e.message || '支付失败')
  }
})

router.post('/pay-callback', async (req, res) => {
  try {
    const { orderNo } = req.body
    if (!orderNo) return fail(res, '缺少订单号')
    const data = await settlePay(orderNo)
    success(res, data, '支付成功')
  } catch (e) {
    console.error(e)
    fail(res, e.message || '支付回调失败')
  }
})

router.get('/detail/:orderNo', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM orders WHERE order_no = ?', [req.params.orderNo])
    if (rows.length === 0) return fail(res, '订单不存在')
    success(res, rows[0])
  } catch (e) {
    fail(res, '查询失败')
  }
})

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

router.post('/refund', async (req, res) => {
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const { orderNo } = req.body
    const [orders] = await conn.query('SELECT * FROM orders WHERE order_no = ? FOR UPDATE', [orderNo])
    if (orders.length === 0) return fail(res, '订单不存在')
    const order = orders[0]
    if (order.status !== 1) return fail(res, '订单不可退款')

    await conn.query('UPDATE orders SET status = 3, refunded_at = NOW() WHERE id = ?', [order.id])
    if (order.covered_by_card) {
      const [cards] = await conn.query(
        'SELECT id FROM annual_cards WHERE member_id = ? AND status = 1 ORDER BY expire_at DESC LIMIT 1 FOR UPDATE',
        [order.member_id]
      )
      if (cards.length) {
        await conn.query('UPDATE annual_cards SET remain_scenic = remain_scenic + 1 WHERE id = ?', [cards[0].id])
      }
    }
    await conn.commit()
    success(res, null, '退款成功')
  } catch (e) {
    await conn.rollback()
    fail(res, '退款失败')
  } finally {
    conn.release()
  }
})

router.post('/verify', async (req, res) => {
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const { orderNo } = req.body
    const [orders] = await conn.query('SELECT * FROM orders WHERE order_no = ? FOR UPDATE', [orderNo])
    if (orders.length === 0) return fail(res, '订单不存在')
    const order = orders[0]
    if (order.status !== 1) return fail(res, '订单不可核销')

    await conn.query('UPDATE orders SET status = 2 WHERE id = ?', [order.id])
    const [members] = await conn.query('SELECT * FROM members WHERE id = ? FOR UPDATE', [order.member_id])
    const member = members[0]
    const newGrowth = member.growth_value + 20
    const resolved = resolveMemberLevel(newGrowth, member.card_status)
    await conn.query('UPDATE members SET growth_value = ?, level = ?, last_checkin_at = NOW(), is_dormant = 0 WHERE id = ?', [newGrowth, resolved.level, member.id])
    await conn.query(
      'INSERT INTO growth_records (member_id, action_type, action_value, ref_id, ref_type) VALUES (?, "checkin", 20, ?, "order")',
      [member.id, orderNo]
    )
    await conn.commit()
    success(res, { growthAdded: 20, newLevel: resolved.level, newLevelName: resolved.name }, '核销成功')
  } catch (e) {
    await conn.rollback()
    fail(res, '核销失败')
  } finally {
    conn.release()
  }
})

router.post('/cancel', async (req, res) => {
  try {
    const { orderNo } = req.body
    const [orders] = await db.query('SELECT * FROM orders WHERE order_no = ?', [orderNo])
    if (orders.length === 0) return fail(res, '订单不存在')
    if (orders[0].status !== 0) return fail(res, '仅待支付订单可取消')
    await db.query('UPDATE orders SET status = 4 WHERE order_no = ?', [orderNo])
    success(res, null, '已取消')
  } catch (e) {
    fail(res, '取消失败')
  }
})

module.exports = router

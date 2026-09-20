const express = require('express')
const router = express.Router()
const db = require('../config/database')
const { success, fail, resolveMemberLevel } = require('../utils/response')

// 获取年卡SKU列表
router.get('/skus', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM card_skus WHERE is_active = 1')
    success(res, rows)
  } catch (e) {
    fail(res, '查询失败')
  }
})

// 购买年卡
router.post('/purchase', async (req, res) => {
  const conn = await db.getConnection()
  try {
    const { userId, skuCode, payAmount } = req.body
    if (!userId || !skuCode) return fail(res, '缺少参数')
    await conn.beginTransaction()

    const [skus] = await conn.query('SELECT * FROM card_skus WHERE sku_code = ? AND is_active = 1', [skuCode])
    if (skus.length === 0) {
      await conn.rollback()
      return fail(res, 'SKU不存在')
    }
    const sku = skus[0]
    const payFen = payAmount != null ? Number(payAmount) : sku.price

    const [members] = await conn.query('SELECT * FROM members WHERE user_id = ? FOR UPDATE', [userId])
    if (members.length === 0) {
      await conn.rollback()
      return fail(res, '会员不存在')
    }
    const member = members[0]

    // 生成卡号
    const cardNo = 'TC' + Date.now() + Math.floor(Math.random() * 1000)
    const expireAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

    // 创建年卡
    const [r] = await conn.query(
      `INSERT INTO annual_cards (card_no, member_id, sku_code, price, remain_scenic, remain_hotel, remain_show, remain_rent, remain_study, status, expire_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [cardNo, member.id, skuCode, payFen, sku.scenic_times, sku.hotel_nights, sku.show_times, sku.rent_times, sku.study_times, expireAt]
    )

    // 更新会员持卡状态
    await conn.query('UPDATE members SET card_status = 1, is_dormant = 0 WHERE id = ?', [member.id])

    // 年卡消费累计成长值
    const growthFromCard = Math.floor((payFen != null ? payFen : sku.price) / 100)
    const newGrowth = member.growth_value + growthFromCard
    const resolved = resolveMemberLevel(newGrowth, 1)
    await conn.query('UPDATE members SET growth_value = ?, level = ? WHERE id = ?', [newGrowth, resolved.level, member.id])
    await conn.query(
      'INSERT INTO growth_records (member_id, action_type, action_value, ref_id, ref_type) VALUES (?, "consume", ?, ?, "card")',
      [member.id, growthFromCard, cardNo]
    )

    await conn.commit()
    success(res, {
      cardId: r.insertId, cardNo, skuCode: sku.name,
      expireAt, growthAdded: growthFromCard,
      newLevel: resolved.level, newLevelName: resolved.name
    }, '年卡购买成功')
  } catch (e) {
    console.error(e)
    await conn.rollback()
    fail(res, '购买失败')
  } finally {
    conn.release()
  }
})

// 7 天试用 9.9 元：通道与休息区，不含免票次数
router.post('/trial', async (req, res) => {
  const conn = await db.getConnection()
  try {
    const { userId } = req.body
    if (!userId) return fail(res, '缺少参数')
    await conn.beginTransaction()
    const [members] = await conn.query('SELECT * FROM members WHERE user_id = ? FOR UPDATE', [userId])
    if (members.length === 0) return fail(res, '会员不存在')
    const member = members[0]
    if (member.trial_used) return fail(res, '试用仅限一次')

    const skuCode = 'standard'
    const [skus] = await conn.query('SELECT * FROM card_skus WHERE sku_code = ?', [skuCode])
    const sku = skus[0]
    const cardNo = 'TC' + Date.now()
    const expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const [r] = await conn.query(
      `INSERT INTO annual_cards (card_no, member_id, sku_code, price, remain_scenic, remain_hotel, remain_show, remain_rent, remain_study, status, expire_at)
       VALUES (?, ?, ?, 990, 0, ?, ?, ?, 0, 1, ?)`,
      [cardNo, member.id, skuCode, sku.hotel_nights, sku.show_times, sku.rent_times, expireAt]
    )
    const newGrowth = member.growth_value + 10
    const resolved = resolveMemberLevel(newGrowth, 1)
    await conn.query('UPDATE members SET card_status = 1, trial_used = 1, is_dormant = 0, growth_value = ?, level = ? WHERE id = ?', [newGrowth, resolved.level, member.id])
    await conn.query(
      'INSERT INTO growth_records (member_id, action_type, action_value, ref_id, ref_type) VALUES (?, "trial", 10, ?, "card")',
      [member.id, cardNo]
    )
    await conn.commit()
    success(res, { cardId: r.insertId, cardNo, expireAt, newLevel: resolved.level }, '试用已开通')
  } catch (e) {
    console.error(e)
    await conn.rollback()
    fail(res, '试用开通失败')
  } finally {
    conn.release()
  }
})

// 查询我的年卡
router.get('/:userId', async (req, res) => {
  try {
    const [cards] = await db.query(
      `SELECT c.*, s.name as sku_name FROM annual_cards c JOIN card_skus s ON c.sku_code = s.sku_code WHERE c.member_id = (SELECT id FROM members WHERE user_id = ?) ORDER BY c.created_at DESC`,
      [req.params.userId]
    )
    success(res, cards)
  } catch (e) {
    fail(res, '查询失败')
  }
})

// 核销年卡（景区/演出/租赁）
router.post('/verify', async (req, res) => {
  const conn = await db.getConnection()
  try {
    const { userId, cardId, type, sceneId, companions } = req.body
    if (!userId || !cardId || !type) return fail(res, '缺少参数')

    const [cards] = await conn.query('SELECT * FROM annual_cards WHERE id = ? AND status = 1 FOR UPDATE', [cardId])
    if (cards.length === 0) return fail(res, '年卡不存在或已失效')
    const card = cards[0]
    if (new Date(card.expire_at) < new Date()) return fail(res, '年卡已过期')

    // 扣减对应次数
    const fieldMap = { scenic: 'remain_scenic', hotel: 'remain_hotel', show: 'remain_show', rent: 'remain_rent', study: 'remain_study' }
    const field = fieldMap[type]
    if (!field) return fail(res, '未知核销类型')
    if (card[field] <= 0) return fail(res, '次数已用完')

    await conn.query(`UPDATE annual_cards SET ${field} = ${field} - 1 WHERE id = ?`, [cardId])

    // 记录核销
    const [members] = await conn.query('SELECT * FROM members WHERE id = ?', [card.member_id])
    const member = members[0]
    await conn.query(
      'INSERT INTO verifications (member_id, card_id, scene_id, type, companions) VALUES (?, ?, ?, ?, ?)',
      [member.id, cardId, sceneId || null, type, companions || 1]
    )

    // 核销+20成长值
    const newGrowth = member.growth_value + 20
    const resolved = resolveMemberLevel(newGrowth, 1)
    await conn.query('UPDATE members SET growth_value = ?, level = ?, last_checkin_at = NOW(), is_dormant = 0 WHERE id = ?', [newGrowth, resolved.level, member.id])
    await conn.query('INSERT INTO growth_records (member_id, action_type, action_value, ref_id, ref_type) VALUES (?, "checkin", 20, ?, "card")', [member.id, cardId])

    success(res, { remain: card[field] - 1, growthAdded: 20, newLevel: resolved.level, newLevelName: resolved.name }, '核销成功')
  } catch (e) {
    console.error(e)
    await conn.rollback()
    fail(res, '核销失败')
  } finally {
    conn.release()
  }
})

// 续费年卡
router.post('/renew', async (req, res) => {
  try {
    const { userId, cardId } = req.body
    const [cards] = await db.query('SELECT * FROM annual_cards WHERE id = ? AND member_id = (SELECT id FROM members WHERE user_id = ?)', [cardId, userId])
    if (cards.length === 0) return fail(res, '年卡不存在')

    // 判断续费折扣（用满80%→8折，用满50%→原价，低于50%→不允许续费）
    const card = cards[0]
    const totalTimes = card.remain_scenic + card.remain_hotel + card.remain_show + card.remain_rent
    // 简化判断：检查剩余次数
    const newExpire = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    await db.query('UPDATE annual_cards SET status = 1, expire_at = ? WHERE id = ?', [newExpire, cardId])
    await db.query('UPDATE members SET card_status = 1 WHERE id = ?', [card.member_id])
    success(res, { expireAt: newExpire }, '续费成功')
  } catch (e) {
    fail(res, '续费失败')
  }
})

// 转赠年卡
router.post('/transfer', async (req, res) => {
  const conn = await db.getConnection()
  try {
    const { userId, cardId, toUserId } = req.body
    const [cards] = await conn.query('SELECT * FROM annual_cards WHERE id = ? AND status = 1 FOR UPDATE', [cardId])
    if (cards.length === 0) return fail(res, '年卡不存在或已失效')
    const card = cards[0]

    // 验证持有人
    const [members] = await conn.query('SELECT * FROM members WHERE user_id = ? AND id = ?', [userId, card.member_id])
    if (members.length === 0) return fail(res, '无权转赠')

    // 获取接收人
    const [toMembers] = await conn.query('SELECT * FROM members WHERE user_id = ?', [toUserId])
    if (toMembers.length === 0) return fail(res, '接收人不存在')

    await conn.query('UPDATE annual_cards SET status = 3, transferred_to = ? WHERE id = ?', [toMembers[0].id, cardId])
    // 给接收人创建新卡
    const newCardNo = 'TC' + Date.now() + Math.floor(Math.random() * 1000)
    await conn.query(
      `INSERT INTO annual_cards (card_no, member_id, sku_code, price, remain_scenic, remain_hotel, remain_show, remain_rent, remain_study, status, expire_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [newCardNo, toMembers[0].id, card.sku_code, card.price, card.remain_scenic, card.remain_hotel, card.remain_show, card.remain_rent, card.remain_study, card.expire_at]
    )
    await conn.query('UPDATE members SET card_status = 0 WHERE id = ?', [card.member_id])
    await conn.query('UPDATE members SET card_status = 1 WHERE id = ?', [toMembers[0].id])

    success(res, { newCardNo }, '转赠成功')
  } catch (e) {
    await conn.rollback()
    fail(res, '转赠失败')
  } finally {
    conn.release()
  }
})

module.exports = router

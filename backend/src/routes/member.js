const express = require('express')
const router = express.Router()
const db = require('../config/database')
const { success, fail, resolveMemberLevel, GROWTH_ACTIONS, getGrowthMultiplier, LEVEL_THRESHOLDS } = require('../utils/response')

// 获取会员信息（成长值+等级+持卡状态）
router.get('/:userId', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT m.*, u.nickname, u.avatar_url FROM members m JOIN users u ON m.user_id = u.id WHERE m.user_id = ?`,
      [req.params.userId]
    )
    if (rows.length === 0) return fail(res, '会员不存在')
    const m = rows[0]
    const resolved = resolveMemberLevel(m.growth_value, m.card_status)
    success(res, {
      ...m,
      level: resolved.level,
      levelName: resolved.name,
      unlockableLevel: resolved.unlockable,
      unlockableLevelName: resolved.unlockName,
      nextLevelMin: resolved.level < 4 ? LEVEL_THRESHOLDS[Math.min(4, resolved.unlockable + 1)].min : null
    })
  } catch (e) {
    console.error(e)
    fail(res, '查询失败')
  }
})

// 累计成长值
router.post('/growth', async (req, res) => {
  const conn = await db.getConnection()
  try {
    const { userId, actionType, refId, refType, consumeAmount } = req.body
    if (!userId || !actionType) return fail(res, '缺少参数')

    const action = GROWTH_ACTIONS[actionType]
    if (!action) return fail(res, '未知行为类型')

    // 获取会员
    const [members] = await conn.query('SELECT * FROM members WHERE user_id = ? FOR UPDATE', [userId])
    if (members.length === 0) return fail(res, '会员不存在')
    const member = members[0]

    // 计算成长值
    let baseValue
    if (actionType === 'consume') {
      baseValue = consumeAmount || 0
    } else {
      baseValue = action.per
    }

    // 月上限检查（行为值，不含消费值）
    let monthCapUsed = 0
    if (action.monthlyCap > 0) {
      const [caps] = await conn.query(
        `SELECT COALESCE(SUM(action_value), 0) as total FROM growth_records WHERE member_id = ? AND action_type != 'consume' AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
        [member.id]
      )
      monthCapUsed = caps[0].total
      if (monthCapUsed + baseValue > action.monthlyCap) {
        baseValue = Math.max(0, action.monthlyCap - monthCapUsed)
      }
    }

    if (baseValue <= 0) return success(res, { growthValue: member.growth_value, added: 0 }, '本月上限已满')

    // 加速倍数
    const multiplier = getGrowthMultiplier(member.card_status)
    const finalValue = Math.floor(baseValue * multiplier)

    // 更新成长值
    const newGrowth = member.growth_value + finalValue
    await conn.query('UPDATE members SET growth_value = ?, last_checkin_at = IF(? IN ("checkin"), NOW(), last_checkin_at) WHERE id = ?',
      [newGrowth, actionType, member.id])

    // 记录流水
    await conn.query(
      'INSERT INTO growth_records (member_id, action_type, action_value, ref_id, ref_type, month_cap_used) VALUES (?, ?, ?, ?, ?, ?)',
      [member.id, actionType, finalValue, refId || null, refType || null, monthCapUsed]
    )

    // 检查是否升级（需持卡才解锁袍级）
    const resolved = resolveMemberLevel(newGrowth, member.card_status)
    if (resolved.level !== member.level) {
      await conn.query('UPDATE members SET level = ? WHERE id = ?', [resolved.level, member.id])
    }

    success(res, {
      growthValue: newGrowth,
      added: finalValue,
      level: resolved.level,
      levelName: resolved.name,
      multiplier
    })
  } catch (e) {
    console.error(e)
    await conn.rollback()
    fail(res, '成长值累计失败')
  } finally {
    conn.release()
  }
})

// 成长值流水
router.get('/:userId/records', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const size = parseInt(req.query.size) || 20
    const offset = (page - 1) * size
    const [rows] = await db.query(
      `SELECT g.* FROM growth_records g JOIN members m ON g.member_id = m.id WHERE m.user_id = ? ORDER BY g.created_at DESC LIMIT ? OFFSET ?`,
      [req.params.userId, size, offset]
    )
    success(res, rows)
  } catch (e) {
    fail(res, '查询失败')
  }
})

// 检查休眠状态（12个月无核销）
router.post('/check-dormant', async (req, res) => {
  try {
    await db.query(
      `UPDATE members SET is_dormant = 1, dormant_at = NOW() WHERE last_checkin_at IS NOT NULL AND last_checkin_at < DATE_SUB(NOW(), INTERVAL 12 MONTH) AND is_dormant = 0`
    )
    success(res, null, '休眠检查完成')
  } catch (e) {
    fail(res, '检查失败')
  }
})

module.exports = router

const express = require('express')
const router = express.Router()
const db = require('../config/database')
const { success, fail } = require('../utils/response')

// 微信登录（code2session）
router.post('/login', async (req, res) => {
  try {
    const { code } = req.body
    if (!code) return fail(res, '缺少code')

    // 调用微信 code2session
    const axios = require('axios')
    const appid = process.env.WX_APPID
    const secret = process.env.WX_SECRET
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`
    const { data: wxRes } = await axios.get(url)

    if (!wxRes.openid) return fail(res, '微信登录失败: ' + (wxRes.errmsg || ''))

    // 查询或创建用户
    let [rows] = await db.query('SELECT * FROM users WHERE openid = ?', [wxRes.openid])
    let user
    if (rows.length === 0) {
      const [r] = await db.query('INSERT INTO users (openid, unionid) VALUES (?, ?)', [wxRes.openid, wxRes.unionid || null])
      user = { id: r.insertId, openid: wxRes.openid }
      // 自动创建会员记录
      await db.query('INSERT INTO members (user_id) VALUES (?)', [r.insertId])
    } else {
      user = rows[0]
    }

    success(res, { userId: user.id, openid: user.openid, nickname: user.nickname, avatarUrl: user.avatar_url })
  } catch (e) {
    console.error(e)
    fail(res, '登录异常')
  }
})

// 演示账号：小袍，成长值 420，未持卡，可解锁素袍
router.post('/demo', async (req, res) => {
  try {
    const openid = 'demo_xiaopao'
    let [rows] = await db.query('SELECT * FROM users WHERE openid = ?', [openid])
    let user
    if (rows.length === 0) {
      const [r] = await db.query(
        'INSERT INTO users (openid, nickname, avatar_url, phone) VALUES (?, ?, ?, ?)',
        [openid, '小袍', '/images/photo/avatar-01.jpg', '13800138000']
      )
      user = { id: r.insertId, openid, nickname: '小袍' }
      await db.query('INSERT INTO members (user_id, growth_value, level, card_status) VALUES (?, 420, 0, 0)', [r.insertId])
    } else {
      user = rows[0]
    }
    const [members] = await db.query('SELECT * FROM members WHERE user_id = ?', [user.id])
    success(res, { userId: user.id, nickname: user.nickname || '小袍', member: members[0] }, '演示账号就绪')
  } catch (e) {
    console.error(e)
    fail(res, '演示账号创建失败')
  }
})

// 更新用户信息
router.post('/profile', async (req, res) => {
  try {
    const { userId, nickname, avatarUrl, phone } = req.body
    if (!userId) return fail(res, '缺少userId')
    await db.query(
      'UPDATE users SET nickname = COALESCE(?, nickname), avatar_url = COALESCE(?, avatar_url), phone = COALESCE(?, phone) WHERE id = ?',
      [nickname, avatarUrl, phone, userId]
    )
    success(res, null, '更新成功')
  } catch (e) {
    fail(res, '更新失败')
  }
})

// 获取用户信息
router.get('/:userId', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.params.userId])
    if (rows.length === 0) return fail(res, '用户不存在')
    success(res, rows[0])
  } catch (e) {
    fail(res, '查询失败')
  }
})

module.exports = router

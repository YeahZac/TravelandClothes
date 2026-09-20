const express = require('express')
const router = express.Router()
const db = require('../config/database')
const { success, fail } = require('../utils/response')

// 发布动态/打卡
router.post('/create', async (req, res) => {
  const conn = await db.getConnection()
  try {
    const { userId, type, content, images, location, sceneId } = req.body
    if (!userId) return fail(res, '缺少参数')

    const [members] = await conn.query('SELECT id FROM members WHERE user_id = ?', [userId])
    if (members.length === 0) return fail(res, '会员不存在')

    const [r] = await conn.query(
      'INSERT INTO posts (member_id, type, content, images, location, scene_id) VALUES (?, ?, ?, ?, ?, ?)',
      [members[0].id, type || 'checkin', content || '', JSON.stringify(images || []), location || null, sceneId || null]
    )

    // 打卡+10成长值
    await conn.query('UPDATE members SET growth_value = growth_value + 10 WHERE id = ?', [members[0].id])
    await conn.query('INSERT INTO growth_records (member_id, action_type, action_value, ref_id, ref_type) VALUES (?, "post", 10, ?, "post")', [members[0].id, r.insertId])

    success(res, { postId: r.insertId, growthAdded: 10 }, '发布成功')
  } catch (e) {
    await conn.rollback()
    fail(res, '发布失败')
  } finally {
    conn.release()
  }
})

// 动态列表（发现页）
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const size = parseInt(req.query.size) || 20
    const offset = (page - 1) * size
    const [rows] = await db.query(
      `SELECT p.*, u.nickname, u.avatar_url FROM posts p JOIN members m ON p.member_id = m.id JOIN users u ON m.user_id = u.id WHERE p.status = 1 ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      [size, offset]
    )
    // 解析images JSON
    rows.forEach(r => { try { r.images = JSON.parse(r.images) } catch(e) {} })
    success(res, rows)
  } catch (e) {
    fail(res, '查询失败')
  }
})

// 点赞
router.post('/like', async (req, res) => {
  const conn = await db.getConnection()
  try {
    const { userId, postId } = req.body
    const [members] = await conn.query('SELECT id FROM members WHERE user_id = ?', [userId])
    if (members.length === 0) return fail(res, '会员不存在')

    // 检查是否已点赞
    const [existing] = await conn.query('SELECT id FROM likes WHERE member_id = ? AND post_id = ?', [members[0].id, postId])
    if (existing.length > 0) return fail(res, '已点赞')

    await conn.query('INSERT INTO likes (member_id, post_id) VALUES (?, ?)', [members[0].id, postId])
    await conn.query('UPDATE posts SET likes = likes + 1 WHERE id = ?', [postId])

    // 被点赞者+1成长值
    const [posts] = await conn.query('SELECT member_id FROM posts WHERE id = ?', [postId])
    if (posts.length > 0) {
      await conn.query('UPDATE members SET growth_value = growth_value + 1 WHERE id = ?', [posts[0].member_id])
      await conn.query('INSERT INTO growth_records (member_id, action_type, action_value, ref_id, ref_type) VALUES (?, "like", 1, ?, "post")', [posts[0].member_id, postId])
    }

    success(res, null, '点赞成功')
  } catch (e) {
    await conn.rollback()
    fail(res, '点赞失败')
  } finally {
    conn.release()
  }
})

// 官方收录动态（置顶/精选）
router.post('/feature', async (req, res) => {
  try {
    const { postId } = req.body
    await db.query('UPDATE posts SET is_official = 1 WHERE id = ?', [postId])
    success(res, null, '收录成功')
  } catch (e) {
    fail(res, '收录失败')
  }
})

module.exports = router

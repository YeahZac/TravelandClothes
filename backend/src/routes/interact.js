const express = require('express')
const router = express.Router()
const db = require('../config/database')
const { success, fail } = require('../utils/response')

// ===== 收藏 =====
router.post('/favorite/toggle', async (req, res) => {
  try {
    const { userId, targetType, targetId } = req.body
    const [[member]] = await db.query('SELECT id FROM members WHERE user_id = ?', [userId])
    if (!member) return fail(res, '会员不存在')
    const [existing] = await db.query('SELECT id FROM favorites WHERE member_id = ? AND target_type = ? AND target_id = ?', [member.id, targetType, targetId])
    if (existing.length > 0) {
      await db.query('DELETE FROM favorites WHERE id = ?', [existing[0].id])
      success(res, { fav: false }, '已取消收藏')
    } else {
      await db.query('INSERT INTO favorites (member_id, target_type, target_id) VALUES (?, ?, ?)', [member.id, targetType, targetId])
      success(res, { fav: true }, '已收藏')
    }
  } catch (e) { fail(res, '操作失败') }
})

router.get('/favorite/list', async (req, res) => {
  try {
    const { userId, targetType } = req.query
    let sql = 'SELECT f.* FROM favorites f JOIN members m ON f.member_id = m.id WHERE m.user_id = ?'
    const params = [userId]
    if (targetType) { sql += ' AND f.target_type = ?'; params.push(targetType) }
    const [rows] = await db.query(sql, params)
    success(res, rows)
  } catch (e) { fail(res, '查询失败') }
})

router.get('/favorite/check', async (req, res) => {
  try {
    const { userId, targetType, targetId } = req.query
    const [rows] = await db.query(
      'SELECT f.id FROM favorites f JOIN members m ON f.member_id = m.id WHERE m.user_id = ? AND f.target_type = ? AND f.target_id = ?',
      [userId, targetType, targetId])
    success(res, { fav: rows.length > 0 })
  } catch (e) { fail(res, '查询失败') }
})

// ===== 评论 =====
router.post('/comment/create', async (req, res) => {
  try {
    const { userId, postId, content, parentId } = req.body
    const [[member]] = await db.query('SELECT id FROM members WHERE user_id = ?', [userId])
    if (!member) return fail(res, '会员不存在')
    const [r] = await db.query(
      'INSERT INTO comments (member_id, post_id, content, parent_id) VALUES (?, ?, ?, ?)',
      [member.id, postId, content, parentId || null])
    await db.query('UPDATE posts SET comments = comments + 1 WHERE id = ?', [postId])
    success(res, { commentId: r.insertId }, '评论成功')
  } catch (e) { fail(res, '评论失败') }
})

router.get('/comment/list', async (req, res) => {
  try {
    const { postId, page = 1, size = 20 } = req.query
    const offset = (page - 1) * size
    const [rows] = await db.query(
      `SELECT c.*, u.nickname, u.avatar_url FROM comments c
       JOIN members m ON c.member_id = m.id JOIN users u ON m.user_id = u.id
       WHERE c.post_id = ? AND c.status = 1 ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      [postId, Number(size), offset])
    success(res, rows)
  } catch (e) { fail(res, '查询失败') }
})

// ===== 会话与消息 =====
router.get('/message/conversations', async (req, res) => {
  try {
    const { userId } = req.query
    const [rows] = await db.query(
      `SELECT c.* FROM conversations c JOIN members m ON c.member_id = m.id WHERE m.user_id = ? ORDER BY c.updated_at DESC`,
      [userId])
    success(res, rows)
  } catch (e) { fail(res, '查询失败') }
})

router.post('/message/send', async (req, res) => {
  try {
    const { userId, conversationId, content } = req.body
    const [[member]] = await db.query('SELECT id FROM members WHERE user_id = ?', [userId])
    if (!member) return fail(res, '会员不存在')
    const [r] = await db.query(
      'INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES (?, ?, ?)',
      [conversationId, member.id, content])
    await db.query('UPDATE conversations SET last_message = ?, unread = unread + 1, updated_at = NOW() WHERE id = ?', [content, conversationId])
    success(res, { messageId: r.insertId }, '发送成功')
  } catch (e) { fail(res, '发送失败') }
})

router.get('/message/list', async (req, res) => {
  try {
    const { conversationId, page = 1, size = 50 } = req.query
    const offset = (page - 1) * size
    const [rows] = await db.query(
      'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [conversationId, Number(size), offset])
    success(res, rows)
  } catch (e) { fail(res, '查询失败') }
})

// ===== 通知 =====
router.get('/notification/list', async (req, res) => {
  try {
    const { userId, page = 1, size = 20 } = req.query
    const offset = (page - 1) * size
    const [rows] = await db.query(
      `SELECT n.* FROM notifications n JOIN members m ON n.member_id = m.id WHERE m.user_id = ? ORDER BY n.created_at DESC LIMIT ? OFFSET ?`,
      [userId, Number(size), offset])
    success(res, rows)
  } catch (e) { fail(res, '查询失败') }
})

router.post('/notification/read', async (req, res) => {
  try {
    const { notificationId } = req.body
    await db.query('UPDATE notifications SET is_read = 1 WHERE id = ?', [notificationId])
    success(res, null, '已读')
  } catch (e) { fail(res, '操作失败') }
})

module.exports = router

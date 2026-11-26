/**
 * 校园 / 身份推广用户：运营台绑定真实用户为「推广用户」，并备注地区/学校/姓名等。
 * 邀请关系仍走 user_account.inviter_id + invite_event；本表只做身份标记与资料。
 */
const dbMod = require('../db')
const mediaUrl = require('../mediaUrl')
const { formatChinaDateTime } = require('./chinaDay')

let ready = false

function db() {
  return dbMod.open()
}

function now() {
  return dbMod.nowIso()
}

function ensureSchema() {
  if (ready) return
  const d = db()
  try {
    d.exec(`
      CREATE TABLE IF NOT EXISTS user_promoter (
        user_id INTEGER PRIMARY KEY,
        real_name VARCHAR(64) NOT NULL DEFAULT '',
        school VARCHAR(128) NOT NULL DEFAULT '',
        region VARCHAR(128) NOT NULL DEFAULT '',
        campus VARCHAR(128) NOT NULL DEFAULT '',
        note VARCHAR(512) NOT NULL DEFAULT '',
        status VARCHAR(16) NOT NULL DEFAULT 'on',
        bound_at VARCHAR(32) NOT NULL DEFAULT '',
        updated_at VARCHAR(32) NOT NULL DEFAULT ''
      )
    `)
  } catch (_) {
    try {
      d.exec(`
        CREATE TABLE IF NOT EXISTS user_promoter (
          user_id INTEGER PRIMARY KEY,
          real_name TEXT NOT NULL DEFAULT '',
          school TEXT NOT NULL DEFAULT '',
          region TEXT NOT NULL DEFAULT '',
          campus TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'on',
          bound_at TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT ''
        )
      `)
    } catch (e) {
      console.warn('[promoter] ensureSchema', e && e.message)
    }
  }
  ready = true
}

function mapUserBrief(u) {
  if (!u) return null
  return {
    id: u.id,
    nickName: String(u.nick_name || '').trim() || '未设置昵称',
    avatarUrl: mediaUrl.adminDisplayUrl(u.avatar_url) || '',
    inviteCode: u.invite_code || '',
    openid: u.openid || '',
    status: u.status || 'active',
    registeredAt: formatChinaDateTime(u.created_at) || u.created_at || '',
  }
}

function mapPromoterRow(row, user) {
  const brief = mapUserBrief(user) || { id: row.user_id }
  return {
    userId: Number(row.user_id),
    realName: row.real_name || '',
    school: row.school || '',
    region: row.region || '',
    campus: row.campus || '',
    note: row.note || '',
    status: row.status || 'on',
    boundAt: formatChinaDateTime(row.bound_at) || row.bound_at || '',
    updatedAt: formatChinaDateTime(row.updated_at) || row.updated_at || '',
    user: brief,
    inviteCode: brief.inviteCode || '',
    nickName: brief.nickName || '',
    avatarUrl: brief.avatarUrl || '',
  }
}

function getByUserId(userId) {
  ensureSchema()
  const uid = Number(userId)
  if (!uid) return null
  const row = db().prepare(`SELECT * FROM user_promoter WHERE user_id=?`).get(uid)
  if (!row) return null
  const user = db().prepare(`SELECT * FROM user_account WHERE id=?`).get(uid)
  return mapPromoterRow(row, user)
}

function listPromoters({ status = '', q = '', page = 1, pageSize = 50 } = {}) {
  ensureSchema()
  const d = db()
  const where = []
  const args = []
  if (status === 'on' || status === 'off') {
    where.push(`p.status=?`)
    args.push(status)
  }
  if (q) {
    const like = `%${String(q).trim()}%`
    where.push(
      `(u.nick_name LIKE ? OR u.invite_code LIKE ? OR u.openid LIKE ? OR p.real_name LIKE ? OR p.school LIKE ? OR p.region LIKE ? OR CAST(p.user_id AS CHAR) LIKE ?)`
    )
    args.push(like, like, like, like, like, like, like)
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const ps = Math.min(100, Math.max(5, Number(pageSize) || 50))
  const pg = Math.max(1, Number(page) || 1)
  const total = d
    .prepare(
      `SELECT COUNT(*) AS n FROM user_promoter p
       LEFT JOIN user_account u ON u.id=p.user_id ${w}`
    )
    .get(...args).n
  const rows = d
    .prepare(
      `SELECT p.*, u.nick_name, u.avatar_url, u.invite_code, u.openid, u.status AS user_status, u.created_at
       FROM user_promoter p
       LEFT JOIN user_account u ON u.id=p.user_id
       ${w}
       ORDER BY p.updated_at DESC, p.user_id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...args, ps, (pg - 1) * ps)
  const list = rows.map((r) =>
    mapPromoterRow(r, {
      id: r.user_id,
      nick_name: r.nick_name,
      avatar_url: r.avatar_url,
      invite_code: r.invite_code,
      openid: r.openid,
      status: r.user_status,
      created_at: r.created_at,
    })
  )
  // 附带邀请人数
  list.forEach((item) => {
    try {
      item.inviteCount = d
        .prepare(`SELECT COUNT(*) AS n FROM user_account WHERE inviter_id=?`)
        .get(item.userId).n
      item.validInviteCount = d
        .prepare(
          `SELECT COUNT(*) AS n FROM invite_event WHERE inviter_id=? AND status='confirmed'`
        )
        .get(item.userId).n
    } catch (_) {
      item.inviteCount = 0
      item.validInviteCount = 0
    }
  })
  return { total, page: pg, pageSize: ps, list }
}

function searchUsers(q = '', limit = 30) {
  ensureSchema()
  const d = db()
  const lim = Math.min(50, Math.max(5, Number(limit) || 30))
  const qq = String(q || '').trim()
  let rows
  if (!qq) {
    rows = d
      .prepare(
        `SELECT id, nick_name, avatar_url, invite_code, openid, status, created_at
         FROM user_account
         WHERE IFNULL(openid,'') NOT LIKE 'demo_%' AND IFNULL(openid,'') NOT LIKE 'dev_%' AND IFNULL(openid,'')<>''
         ORDER BY id DESC LIMIT ?`
      )
      .all(lim)
  } else if (/^\d+$/.test(qq)) {
    rows = d
      .prepare(
        `SELECT id, nick_name, avatar_url, invite_code, openid, status, created_at
         FROM user_account
         WHERE id=? OR nick_name LIKE ? OR invite_code LIKE ? OR openid LIKE ?
         ORDER BY id DESC LIMIT ?`
      )
      .all(Number(qq), `%${qq}%`, `%${qq}%`, `%${qq}%`, lim)
  } else {
    const like = `%${qq}%`
    rows = d
      .prepare(
        `SELECT id, nick_name, avatar_url, invite_code, openid, status, created_at
         FROM user_account
         WHERE nick_name LIKE ? OR invite_code LIKE ? OR openid LIKE ?
         ORDER BY id DESC LIMIT ?`
      )
      .all(like, like, like, lim)
  }
  const bound = new Set(
    d.prepare(`SELECT user_id FROM user_promoter`).all().map((r) => Number(r.user_id))
  )
  return rows.map((u) => ({
    ...mapUserBrief(u),
    isPromoter: bound.has(Number(u.id)),
  }))
}

function upsertPromoter(body = {}) {
  ensureSchema()
  const uid = Number(body.userId || body.user_id || 0)
  if (!uid) return { ok: false, msg: '缺少用户 ID' }
  const d = db()
  const user = d.prepare(`SELECT * FROM user_account WHERE id=?`).get(uid)
  if (!user) return { ok: false, msg: '用户不存在' }
  const t = now()
  const realName = String(body.realName || body.real_name || '').trim().slice(0, 64)
  const school = String(body.school || '').trim().slice(0, 128)
  const region = String(body.region || '').trim().slice(0, 128)
  const campus = String(body.campus || '').trim().slice(0, 128)
  const note = String(body.note || '').trim().slice(0, 512)
  const status = body.status === 'off' ? 'off' : 'on'
  const exists = d.prepare(`SELECT user_id, bound_at FROM user_promoter WHERE user_id=?`).get(uid)
  if (exists) {
    d.prepare(
      `UPDATE user_promoter
       SET real_name=?, school=?, region=?, campus=?, note=?, status=?, updated_at=?
       WHERE user_id=?`
    ).run(realName, school, region, campus, note, status, t, uid)
  } else {
    d.prepare(
      `INSERT INTO user_promoter
       (user_id, real_name, school, region, campus, note, status, bound_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(uid, realName, school, region, campus, note, status, t, t)
  }
  return { ok: true, item: getByUserId(uid) }
}

function unbindPromoter(userId) {
  ensureSchema()
  const uid = Number(userId)
  if (!uid) return { ok: false, msg: '缺少用户 ID' }
  const info = db().prepare(`DELETE FROM user_promoter WHERE user_id=?`).run(uid)
  return { ok: true, removed: Number(info.changes || 0) }
}

/** 邀请下级明细（含头像，供用户详情） */
function listInvitees(userId, { page = 1, pageSize = 20 } = {}) {
  ensureSchema()
  const uid = Number(userId)
  const d = db()
  const ps = Math.min(50, Math.max(5, Number(pageSize) || 20))
  const pg = Math.max(1, Number(page) || 1)
  const total = d.prepare(`SELECT COUNT(*) AS n FROM user_account WHERE inviter_id=?`).get(uid).n
  let validInviteCount = 0
  try {
    validInviteCount = d
      .prepare(`SELECT COUNT(*) AS n FROM invite_event WHERE inviter_id=? AND status='confirmed'`)
      .get(uid).n
  } catch (_) {}
  const list = d
    .prepare(
      `SELECT id, nick_name, avatar_url, invite_code, channel, created_at, last_active_at, status, openid
       FROM user_account WHERE inviter_id=? ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(uid, ps, (pg - 1) * ps)
    .map((x) => ({
      id: x.id,
      nickName: String(x.nick_name || '').trim() || '未设置昵称',
      avatarUrl: mediaUrl.adminDisplayUrl(x.avatar_url) || '',
      inviteCode: x.invite_code || '',
      channel: x.channel || '',
      openid: x.openid || '',
      registeredAt: formatChinaDateTime(x.created_at) || x.created_at || '',
      lastActiveAt: formatChinaDateTime(x.last_active_at) || x.last_active_at || '',
      status: x.status || 'active',
    }))
  return {
    total,
    page: pg,
    pageSize: ps,
    validInviteCount,
    inviteCount: total,
    list,
  }
}

module.exports = {
  ensureSchema,
  getByUserId,
  listPromoters,
  searchUsers,
  upsertPromoter,
  unbindPromoter,
  listInvitees,
}

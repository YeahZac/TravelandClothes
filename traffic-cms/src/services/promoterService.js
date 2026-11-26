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

/** —— 推广结算申请 / 记录 —— */
function ensureSettlementSchema() {
  ensureSchema()
  const d = db()
  try {
    d.exec(`
      CREATE TABLE IF NOT EXISTS promoter_settlement (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount_cent INTEGER NOT NULL DEFAULT 0,
        method VARCHAR(32) NOT NULL DEFAULT 'wechat',
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        apply_at VARCHAR(40) NOT NULL DEFAULT '',
        settle_at VARCHAR(40) NOT NULL DEFAULT '',
        period_from VARCHAR(16) NOT NULL DEFAULT '',
        period_to VARCHAR(16) NOT NULL DEFAULT '',
        invite_count_snapshot INTEGER NOT NULL DEFAULT 0,
        valid_invite_snapshot INTEGER NOT NULL DEFAULT 0,
        unit_price_cent INTEGER NOT NULL DEFAULT 0,
        note VARCHAR(512) NOT NULL DEFAULT '',
        reject_reason VARCHAR(256) NOT NULL DEFAULT '',
        operator VARCHAR(64) NOT NULL DEFAULT '',
        finance_id INTEGER NOT NULL DEFAULT 0,
        created_at VARCHAR(40) NOT NULL DEFAULT '',
        updated_at VARCHAR(40) NOT NULL DEFAULT ''
      )
    `)
  } catch (_) {
    try {
      d.exec(`
        CREATE TABLE IF NOT EXISTS promoter_settlement (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          amount_cent INTEGER NOT NULL DEFAULT 0,
          method TEXT NOT NULL DEFAULT 'wechat',
          status TEXT NOT NULL DEFAULT 'pending',
          apply_at TEXT NOT NULL DEFAULT '',
          settle_at TEXT NOT NULL DEFAULT '',
          period_from TEXT NOT NULL DEFAULT '',
          period_to TEXT NOT NULL DEFAULT '',
          invite_count_snapshot INTEGER NOT NULL DEFAULT 0,
          valid_invite_snapshot INTEGER NOT NULL DEFAULT 0,
          unit_price_cent INTEGER NOT NULL DEFAULT 0,
          note TEXT NOT NULL DEFAULT '',
          reject_reason TEXT NOT NULL DEFAULT '',
          operator TEXT NOT NULL DEFAULT '',
          finance_id INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT ''
        )
      `)
    } catch (e) {
      console.warn('[promoter] settlement schema', e && e.message)
    }
  }
  try {
    d.exec(`CREATE INDEX IF NOT EXISTS idx_promoter_settle_user ON promoter_settlement(user_id, status)`)
  } catch (_) {}
}

const METHOD_LABEL = {
  wechat: '微信转账',
  alipay: '支付宝',
  bank: '银行卡',
  cash: '现金',
  other: '其他',
}

const SETTLE_STATUS_LABEL = {
  pending: '待审核',
  approved: '已通过待打款',
  paid: '已结算',
  rejected: '已驳回',
}

function mapSettlement(row, user) {
  if (!row) return null
  const brief = user ? mapUserBrief(user) : null
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    amountCent: Number(row.amount_cent || 0),
    amountYuan: Number(((Number(row.amount_cent || 0) || 0) / 100).toFixed(2)),
    method: row.method || 'wechat',
    methodLabel: METHOD_LABEL[row.method] || row.method || '—',
    status: row.status || 'pending',
    statusLabel: SETTLE_STATUS_LABEL[row.status] || row.status || '—',
    applyAt: formatChinaDateTime(row.apply_at) || row.apply_at || '',
    settleAt: formatChinaDateTime(row.settle_at) || row.settle_at || '',
    periodFrom: row.period_from || '',
    periodTo: row.period_to || '',
    inviteCountSnapshot: Number(row.invite_count_snapshot || 0),
    validInviteSnapshot: Number(row.valid_invite_snapshot || 0),
    unitPriceCent: Number(row.unit_price_cent || 0),
    note: row.note || '',
    rejectReason: row.reject_reason || '',
    operator: row.operator || '',
    financeId: Number(row.finance_id || 0),
    createdAt: formatChinaDateTime(row.created_at) || row.created_at || '',
    updatedAt: formatChinaDateTime(row.updated_at) || row.updated_at || '',
    user: brief,
    nickName: (brief && brief.nickName) || '',
    avatarUrl: (brief && brief.avatarUrl) || '',
  }
}

function applySettlement(body = {}) {
  ensureSettlementSchema()
  const uid = Number(body.userId || body.user_id || 0)
  if (!uid) return { ok: false, msg: '缺少用户 ID' }
  const d = db()
  const user = d.prepare(`SELECT * FROM user_account WHERE id=?`).get(uid)
  if (!user) return { ok: false, msg: '用户不存在' }
  const promoter = d.prepare(`SELECT * FROM user_promoter WHERE user_id=?`).get(uid)
  if (!promoter) return { ok: false, msg: '请先将该用户绑定为推广用户' }
  if (promoter.status === 'off') return { ok: false, msg: '推广用户已停用，不可申请结算' }

  let risk = null
  try {
    risk = require('./riskService').scoreUser(uid)
  } catch (_) {}
  if (risk && risk.level === 'high') {
    return {
      ok: false,
      msg: `该用户风险等级为「高风险」，禁止结算申请。命中：${(risk.factors || [])
        .map((f) => f.title)
        .slice(0, 3)
        .join('、')}`,
      risk,
    }
  }

  const amountCent = Math.round(Number(body.amountCent != null ? body.amountCent : Number(body.amountYuan || 0) * 100))
  if (!Number.isFinite(amountCent) || amountCent <= 0) return { ok: false, msg: '结算金额须大于 0' }
  if (amountCent > 50000000) return { ok: false, msg: '单笔金额过大，请拆分' }

  const method = ['wechat', 'alipay', 'bank', 'cash', 'other'].includes(body.method)
    ? body.method
    : 'wechat'
  const t = now()
  let inviteCount = 0
  let validInvite = 0
  try {
    inviteCount = d.prepare(`SELECT COUNT(*) AS n FROM user_account WHERE inviter_id=?`).get(uid).n
    validInvite = d
      .prepare(`SELECT COUNT(*) AS n FROM invite_event WHERE inviter_id=? AND status='confirmed'`)
      .get(uid).n
  } catch (_) {}
  const unitPriceCent = Math.max(0, Math.round(Number(body.unitPriceCent || 0) || 0))
  const info = d
    .prepare(
      `INSERT INTO promoter_settlement
       (user_id, amount_cent, method, status, apply_at, settle_at, period_from, period_to,
        invite_count_snapshot, valid_invite_snapshot, unit_price_cent, note, reject_reason,
        operator, finance_id, created_at, updated_at)
       VALUES (?,?,?,'pending',?,'',?,?,?,?,?,?,'',?,0,?,?)`
    )
    .run(
      uid,
      amountCent,
      method,
      t,
      String(body.periodFrom || body.period_from || '').slice(0, 16),
      String(body.periodTo || body.period_to || '').slice(0, 16),
      inviteCount,
      validInvite,
      unitPriceCent,
      String(body.note || '').trim().slice(0, 512),
      String(body.operator || 'admin').slice(0, 64),
      t,
      t
    )
  const id = Number(info.lastInsertRowid)
  return { ok: true, item: getSettlement(id), risk }
}

function getSettlement(id) {
  ensureSettlementSchema()
  const row = db().prepare(`SELECT * FROM promoter_settlement WHERE id=?`).get(Number(id))
  if (!row) return null
  const user = db().prepare(`SELECT * FROM user_account WHERE id=?`).get(row.user_id)
  return mapSettlement(row, user)
}

function listSettlements({
  userId = '',
  status = '',
  q = '',
  page = 1,
  pageSize = 30,
} = {}) {
  ensureSettlementSchema()
  const d = db()
  const where = []
  const args = []
  if (userId) {
    where.push(`s.user_id=?`)
    args.push(Number(userId))
  }
  if (status) {
    where.push(`s.status=?`)
    args.push(status)
  }
  if (q) {
    const like = `%${String(q).trim()}%`
    where.push(
      `(u.nick_name LIKE ? OR p.real_name LIKE ? OR CAST(s.user_id AS CHAR) LIKE ? OR CAST(s.id AS CHAR) LIKE ?)`
    )
    args.push(like, like, like, like)
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const ps = Math.min(100, Math.max(5, Number(pageSize) || 30))
  const pg = Math.max(1, Number(page) || 1)
  const total = d
    .prepare(
      `SELECT COUNT(*) AS n FROM promoter_settlement s
       LEFT JOIN user_account u ON u.id=s.user_id
       LEFT JOIN user_promoter p ON p.user_id=s.user_id
       ${w}`
    )
    .get(...args).n
  const rows = d
    .prepare(
      `SELECT s.*, u.nick_name, u.avatar_url, u.invite_code, u.openid, u.status AS user_status, u.created_at AS user_created
       FROM promoter_settlement s
       LEFT JOIN user_account u ON u.id=s.user_id
       LEFT JOIN user_promoter p ON p.user_id=s.user_id
       ${w}
       ORDER BY s.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...args, ps, (pg - 1) * ps)
  const list = rows.map((r) =>
    mapSettlement(r, {
      id: r.user_id,
      nick_name: r.nick_name,
      avatar_url: r.avatar_url,
      invite_code: r.invite_code,
      openid: r.openid,
      status: r.user_status,
      created_at: r.user_created,
    })
  )
  let paidSumCent = 0
  let pendingSumCent = 0
  try {
    paidSumCent = d
      .prepare(`SELECT COALESCE(SUM(amount_cent),0) AS s FROM promoter_settlement WHERE status='paid'`)
      .get().s
    pendingSumCent = d
      .prepare(
        `SELECT COALESCE(SUM(amount_cent),0) AS s FROM promoter_settlement WHERE status IN ('pending','approved')`
      )
      .get().s
  } catch (_) {}
  return {
    total,
    page: pg,
    pageSize: ps,
    list,
    paidSumCent: Number(paidSumCent || 0),
    pendingSumCent: Number(pendingSumCent || 0),
    paidSumYuan: Number((Number(paidSumCent || 0) / 100).toFixed(2)),
    pendingSumYuan: Number((Number(pendingSumCent || 0) / 100).toFixed(2)),
  }
}

function updateSettlementStatus(id, { status, rejectReason = '', operator = 'admin', settleAt = '' } = {}) {
  ensureSettlementSchema()
  const sid = Number(id)
  const row = db().prepare(`SELECT * FROM promoter_settlement WHERE id=?`).get(sid)
  if (!row) return { ok: false, msg: '结算单不存在' }
  const next = String(status || '').trim()
  if (!['pending', 'approved', 'paid', 'rejected'].includes(next)) {
    return { ok: false, msg: '非法状态' }
  }
  if (row.status === 'paid' && next !== 'paid') {
    return { ok: false, msg: '已入账结算单不可回退，请走冲正流程' }
  }
  if (next === 'paid') {
    return markSettlementPaid(sid, { operator, settleAt })
  }
  const t = now()
  db()
    .prepare(
      `UPDATE promoter_settlement
       SET status=?, reject_reason=?, operator=?, updated_at=?
       WHERE id=?`
    )
    .run(
      next,
      next === 'rejected' ? String(rejectReason || '').trim().slice(0, 256) : '',
      String(operator || 'admin').slice(0, 64),
      t,
      sid
    )
  return { ok: true, item: getSettlement(sid) }
}

function markSettlementPaid(id, { operator = 'admin', settleAt = '' } = {}) {
  ensureSettlementSchema()
  const sid = Number(id)
  const d = db()
  const row = d.prepare(`SELECT * FROM promoter_settlement WHERE id=?`).get(sid)
  if (!row) return { ok: false, msg: '结算单不存在' }
  if (row.status === 'paid' && Number(row.finance_id || 0) > 0) {
    return { ok: true, item: getSettlement(sid), already: true }
  }
  if (row.status === 'rejected') return { ok: false, msg: '已驳回单据不可打款' }

  // 打款前再拦一次高风险
  try {
    const risk = require('./riskService').scoreUser(row.user_id)
    if (risk && risk.level === 'high') {
      return { ok: false, msg: '用户当前为高风险，禁止打款入账', risk }
    }
  } catch (_) {}

  const t = settleAt ? String(settleAt) : now()
  let financeId = Number(row.finance_id || 0)
  if (!financeId) {
    try {
      const { chinaDayKey } = require('./chinaDay')
      const dayKey = chinaDayKey(t)
      financeId =
        require('./adminService').addFinance({
          entryType: 'cost',
          category: 'promoter_payout',
          amountCent: Number(row.amount_cent || 0),
          refType: 'promoter_settlement',
          refId: String(sid),
          note: `推广结算#${sid} 用户${row.user_id} ${METHOD_LABEL[row.method] || row.method}`,
          day: dayKey,
          createdAt: t,
        }) || 0
    } catch (e) {
      return { ok: false, msg: `财务入账失败：${(e && e.message) || e}` }
    }
  }
  d.prepare(
    `UPDATE promoter_settlement
     SET status='paid', settle_at=?, operator=?, finance_id=?, updated_at=?
     WHERE id=?`
  ).run(t, String(operator || 'admin').slice(0, 64), Number(financeId || 0), now(), sid)
  return { ok: true, item: getSettlement(sid), financeId: Number(financeId || 0) }
}

module.exports = {
  ensureSchema,
  ensureSettlementSchema,
  getByUserId,
  listPromoters,
  searchUsers,
  upsertPromoter,
  unbindPromoter,
  listInvitees,
  applySettlement,
  getSettlement,
  listSettlements,
  updateSettlementStatus,
  markSettlementPaid,
  METHOD_LABEL,
  SETTLE_STATUS_LABEL,
}

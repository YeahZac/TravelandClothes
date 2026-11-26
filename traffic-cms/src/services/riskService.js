/**
 * 邀请结算防作弊：基于行为信号打分、落库风险等级，供用户列表筛选与详情展示。
 * 不替代人工审核；high 等级会同步 lottery risk_flag，阻断实物奖。
 */
const dbMod = require('../db')
const { formatChinaDateTime } = require('./chinaDay')

let ready = false

const LEVELS = {
  clean: { min: 0, label: '正常', badge: 'clean' },
  watch: { min: 25, label: '观察', badge: 'watch' },
  suspect: { min: 50, label: '可疑', badge: 'suspect' },
  high: { min: 80, label: '高风险', badge: 'high' },
}

const RULE_META = [
  { code: 'invite_burst_24h', title: '24小时内邀请暴增', desc: '短时大量拉新，常见于养号/脚本刷邀请', weight: 30 },
  { code: 'invite_burst_7d', title: '7日内邀请过多', desc: '周维度邀请量异常偏高', weight: 25 },
  { code: 'low_confirm_rate', title: '有效邀请占比过低', desc: '下级很少完成签到确认，疑似无效号', weight: 20 },
  { code: 'invitee_incomplete_cluster', title: '下级资料未完善扎堆', desc: '大量下级无头像昵称，像批量注册', weight: 25 },
  { code: 'invitee_inactive', title: '下级几乎无活跃', desc: '下级注册后几乎不回来，像灌水号', weight: 20 },
  { code: 'new_account_mass_invite', title: '新号大量拉新', desc: '注册不久就拉很多下级，结算风险高', weight: 35 },
  { code: 'same_day_cluster', title: '同日注册下级扎堆', desc: '多个下级同一天注册，疑似集中刷', weight: 25 },
  { code: 'high_lottery_win_rate', title: '抽奖中奖率异常', desc: '中奖率显著高于正常，需复核', weight: 15 },
  { code: 'manual_risk_flag', title: '已人工标记风险', desc: '运营已打风险旗，抽奖实物已受限', weight: 40 },
  { code: 'banned_invitees', title: '下级封禁占比高', desc: '其邀请链上封禁用户偏多', weight: 30 },
  { code: 'empty_profile_self', title: '本人资料长期未完善', desc: '推广结算对象自身无可信资料', weight: 10 },
]

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
    dbMod.addColumnIfMissing(d, 'user_account', 'risk_score', 'INT NOT NULL DEFAULT 0', 'INTEGER NOT NULL DEFAULT 0')
    dbMod.addColumnIfMissing(d, 'user_account', 'risk_level', "VARCHAR(16) NOT NULL DEFAULT 'clean'", "TEXT NOT NULL DEFAULT 'clean'")
    dbMod.addColumnIfMissing(d, 'user_account', 'risk_factors_json', 'TEXT', 'TEXT')
    dbMod.addColumnIfMissing(d, 'user_account', 'risk_scored_at', "VARCHAR(40) NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''")
  } catch (e) {
    console.warn('[risk] ensureSchema', e && e.message)
  }
  ready = true
}

function levelFromScore(score) {
  const s = Number(score) || 0
  if (s >= LEVELS.high.min) return 'high'
  if (s >= LEVELS.suspect.min) return 'suspect'
  if (s >= LEVELS.watch.min) return 'watch'
  return 'clean'
}

function parseTsMs(v) {
  if (!v) return 0
  const t = Date.parse(String(v).replace(' ', 'T'))
  return Number.isFinite(t) ? t : 0
}

function isIncompleteNick(nick) {
  const s = String(nick || '').trim()
  return (
    !s ||
    s === '微信用户' ||
    s === '优享用户' ||
    s === '本地用户' ||
    s === '游客' ||
    s === '未设置昵称' ||
    /^wxid_/i.test(s)
  )
}

function analyzeUser(userId) {
  ensureSchema()
  const uid = Number(userId)
  const d = db()
  const u = d.prepare(`SELECT * FROM user_account WHERE id=?`).get(uid)
  if (!u) return { ok: false, msg: '用户不存在' }

  const factors = []
  const push = (code, evidence) => {
    const meta = RULE_META.find((r) => r.code === code)
    if (!meta) return
    factors.push({
      code: meta.code,
      title: meta.title,
      desc: meta.desc,
      weight: meta.weight,
      evidence: evidence || '',
    })
  }

  let inviteTotal = 0
  let inviteConfirmed = 0
  let invite24h = 0
  let invite7d = 0
  let incompleteInvitees = 0
  let inactiveInvitees = 0
  let bannedInvitees = 0
  let maxSameDay = 0
  try {
    inviteTotal = d.prepare(`SELECT COUNT(*) AS n FROM user_account WHERE inviter_id=?`).get(uid).n
    inviteConfirmed = d
      .prepare(`SELECT COUNT(*) AS n FROM invite_event WHERE inviter_id=? AND status='confirmed'`)
      .get(uid).n
    const nowMs = Date.now()
    const dayKeyCounts = {}
    const invitees = d
      .prepare(
        `SELECT id, nick_name, avatar_url, status, created_at, last_active_at, active_count
         FROM user_account WHERE inviter_id=?`
      )
      .all(uid)
    invitees.forEach((x) => {
      const created = parseTsMs(x.created_at)
      if (created && nowMs - created <= 24 * 3600 * 1000) invite24h += 1
      if (created && nowMs - created <= 7 * 24 * 3600 * 1000) invite7d += 1
      if (isIncompleteNick(x.nick_name) || !String(x.avatar_url || '').trim()) incompleteInvitees += 1
      const last = parseTsMs(x.last_active_at)
      const active = Number(x.active_count || 0)
      if (active <= 1 && (!last || nowMs - last > 3 * 24 * 3600 * 1000)) inactiveInvitees += 1
      if (String(x.status || '') === 'banned') bannedInvitees += 1
      const day = String(x.created_at || '').slice(0, 10)
      if (day) {
        dayKeyCounts[day] = (dayKeyCounts[day] || 0) + 1
        if (dayKeyCounts[day] > maxSameDay) maxSameDay = dayKeyCounts[day]
      }
    })
  } catch (_) {}

  if (invite24h >= 8) {
    push('invite_burst_24h', `近24小时新增下级 ${invite24h} 人（阈值≥8）`)
  }
  if (invite7d >= 20) {
    push('invite_burst_7d', `近7日新增下级 ${invite7d} 人（阈值≥20）`)
  }
  if (inviteTotal >= 5) {
    const rate = inviteConfirmed / inviteTotal
    if (rate < 0.3) {
      push(
        'low_confirm_rate',
        `邀请 ${inviteTotal}，有效确认 ${inviteConfirmed}，占比 ${(rate * 100).toFixed(0)}%（<30%）`
      )
    }
    const incompleteRatio = incompleteInvitees / inviteTotal
    if (incompleteRatio >= 0.7) {
      push(
        'invitee_incomplete_cluster',
        `下级资料未完善 ${incompleteInvitees}/${inviteTotal}（${(incompleteRatio * 100).toFixed(0)}%≥70%）`
      )
    }
    const inactiveRatio = inactiveInvitees / inviteTotal
    if (inactiveRatio >= 0.8) {
      push(
        'invitee_inactive',
        `下级低活跃 ${inactiveInvitees}/${inviteTotal}（${(inactiveRatio * 100).toFixed(0)}%≥80%）`
      )
    }
  }
  if (inviteTotal >= 3) {
    const bannedRatio = bannedInvitees / inviteTotal
    if (bannedRatio >= 0.3) {
      push(
        'banned_invitees',
        `下级已封禁 ${bannedInvitees}/${inviteTotal}（${(bannedRatio * 100).toFixed(0)}%≥30%）`
      )
    }
  }
  if (maxSameDay >= 5) {
    push('same_day_cluster', `同一天注册下级最多 ${maxSameDay} 人（≥5）`)
  }

  const createdMs = parseTsMs(u.created_at)
  const ageHours = createdMs ? (Date.now() - createdMs) / 3600000 : 9999
  if (ageHours < 72 && inviteTotal >= 5) {
    push(
      'new_account_mass_invite',
      `账号注册约 ${ageHours.toFixed(0)} 小时，已拉下级 ${inviteTotal} 人`
    )
  }

  if (isIncompleteNick(u.nick_name) || !String(u.avatar_url || '').trim()) {
    if (inviteTotal >= 3 || Number(u.risk_flag || 0) > 0) {
      push('empty_profile_self', '本人昵称/头像未完善，结算身份可信度偏低')
    }
  }

  try {
    const draws = d.prepare(`SELECT COUNT(*) AS n FROM lottery_draw WHERE user_id=?`).get(uid).n
    const wins = d
      .prepare(
        `SELECT COUNT(*) AS n FROM lottery_draw WHERE user_id=? AND IFNULL(prize_type,'') NOT IN ('','empty')`
      )
      .get(uid).n
    if (draws >= 20) {
      const winRate = wins / draws
      if (winRate > 0.4) {
        push('high_lottery_win_rate', `抽奖 ${draws} 次，中奖 ${wins} 次，中奖率 ${(winRate * 100).toFixed(0)}%（>40%）`)
      }
    }
  } catch (_) {}

  if (Number(u.risk_flag || 0) > 0) {
    push('manual_risk_flag', 'user_account.risk_flag=1（抽奖实物已受限）')
  }

  const score = Math.min(
    100,
    factors.reduce((s, f) => s + Number(f.weight || 0), 0)
  )
  const level = levelFromScore(score)
  return {
    ok: true,
    userId: uid,
    score,
    level,
    levelLabel: LEVELS[level].label,
    factors,
    stats: {
      inviteTotal,
      inviteConfirmed,
      invite24h,
      invite7d,
      incompleteInvitees,
      inactiveInvitees,
      bannedInvitees,
      maxSameDay,
      accountAgeHours: Math.round(ageHours),
      riskFlag: Number(u.risk_flag || 0) > 0,
    },
    rules: RULE_META,
  }
}

function persistRisk(analysis, { syncLotteryFlag = true } = {}) {
  ensureSchema()
  if (!analysis || !analysis.ok) return analysis
  const d = db()
  const t = now()
  const factorsJson = JSON.stringify(analysis.factors || [])
  try {
    d.prepare(
      `UPDATE user_account
       SET risk_score=?, risk_level=?, risk_factors_json=?, risk_scored_at=?, updated_at=?
       WHERE id=?`
    ).run(analysis.score, analysis.level, factorsJson, t, t, analysis.userId)
  } catch (e) {
    console.warn('[risk] persist', e && e.message)
  }
  if (syncLotteryFlag && analysis.level === 'high') {
    try {
      require('./lotteryService').setUserRiskFlag(analysis.userId, 1)
      analysis.autoRiskFlag = true
    } catch (_) {}
  }
  analysis.scoredAt = formatChinaDateTime(t) || t
  return analysis
}

function scoreUser(userId, opts) {
  const a = analyzeUser(userId)
  if (!a.ok) return a
  return persistRisk(a, opts)
}

function getStoredRisk(userId) {
  ensureSchema()
  const uid = Number(userId)
  const u = db()
    .prepare(
      `SELECT risk_score, risk_level, risk_factors_json, risk_scored_at, risk_flag FROM user_account WHERE id=?`
    )
    .get(uid)
  if (!u) return null
  let factors = []
  try {
    factors = JSON.parse(u.risk_factors_json || '[]')
  } catch (_) {
    factors = []
  }
  const level = u.risk_level || levelFromScore(u.risk_score)
  return {
    score: Number(u.risk_score || 0),
    level,
    levelLabel: (LEVELS[level] && LEVELS[level].label) || level,
    factors: Array.isArray(factors) ? factors : [],
    scoredAt: formatChinaDateTime(u.risk_scored_at) || u.risk_scored_at || '',
    riskFlag: Number(u.risk_flag || 0) > 0,
    rules: RULE_META,
  }
}

/** 详情：优先重算；失败则读缓存 */
function riskForDetail(userId, { refresh = true } = {}) {
  if (refresh) {
    const scored = scoreUser(userId, { syncLotteryFlag: true })
    if (scored && scored.ok) return scored
  }
  const stored = getStoredRisk(userId)
  if (!stored) return { score: 0, level: 'clean', levelLabel: '正常', factors: [], rules: RULE_META }
  return { ok: true, userId: Number(userId), ...stored }
}

function countByLevel({ realOnly = true } = {}) {
  ensureSchema()
  const where = []
  if (realOnly !== false && realOnly !== '0' && realOnly !== 0) {
    where.push(
      `(openid IS NOT NULL AND TRIM(openid) <> ''
        AND openid NOT LIKE 'demo_%'
        AND openid NOT LIKE 'dev_%'
        AND IFNULL(channel,'') <> 'demo')`
    )
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = db()
    .prepare(
      `SELECT IFNULL(risk_level,'clean') AS lvl, COUNT(*) AS n FROM user_account ${clause} GROUP BY IFNULL(risk_level,'clean')`
    )
    .all()
  const out = { clean: 0, watch: 0, suspect: 0, high: 0, total: 0, suspicious: 0 }
  rows.forEach((r) => {
    const k = r.lvl || 'clean'
    const n = Number(r.n || 0)
    if (out[k] != null) out[k] = n
    out.total += n
    if (k === 'watch' || k === 'suspect' || k === 'high') out.suspicious += n
  })
  return out
}

/**
 * 批量重算：优先有邀请行为的用户；limit 控制单次量
 */
function rescan({ limit = 200, onlyWithInvites = true } = {}) {
  ensureSchema()
  const lim = Math.min(500, Math.max(10, Number(limit) || 200))
  const d = db()
  let ids
  if (onlyWithInvites) {
    ids = d
      .prepare(
        `SELECT DISTINCT inviter_id AS id FROM user_account
         WHERE inviter_id IS NOT NULL AND inviter_id > 0
         ORDER BY inviter_id DESC LIMIT ?`
      )
      .all(lim)
      .map((r) => Number(r.id))
  } else {
    ids = d
      .prepare(`SELECT id FROM user_account ORDER BY id DESC LIMIT ?`)
      .all(lim)
      .map((r) => Number(r.id))
  }
  let scored = 0
  const levels = { clean: 0, watch: 0, suspect: 0, high: 0 }
  ids.forEach((id) => {
    const r = scoreUser(id)
    if (r && r.ok) {
      scored += 1
      levels[r.level] = (levels[r.level] || 0) + 1
    }
  })
  return { scanned: ids.length, scored, levels, summary: countByLevel() }
}

function listRuleCatalog() {
  return RULE_META.map((r) => ({ ...r, levelsHint: '命中累加权重；≥25观察 ≥50可疑 ≥80高风险' }))
}

module.exports = {
  ensureSchema,
  RULE_META,
  LEVELS,
  analyzeUser,
  scoreUser,
  getStoredRisk,
  riskForDetail,
  countByLevel,
  rescan,
  listRuleCatalog,
  levelFromScore,
}

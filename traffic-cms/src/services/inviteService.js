/**
 * P1：邀请绑定 + 达标冻结/解冻（读 game.rewards.invite / inviteFreezeHours）
 */
const dbMod = require('../db')
const configService = require('./configService')

const { chinaDayKey: dayKey } = require('./chinaDay')

function ensureTables() {
  const d = dbMod.open()
  dbMod.addColumnIfMissing(d, 'user_account', 'inviter_id', `INT NULL`, `INTEGER`)
  d.exec(`
    CREATE TABLE IF NOT EXISTS invite_event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inviter_id INTEGER NOT NULL,
      invitee_id INTEGER NOT NULL UNIQUE,
      day_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      confirmed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS invite_reward_hold (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tier_need INTEGER NOT NULL DEFAULT 0,
      reward_json TEXT NOT NULL DEFAULT '{}',
      unlock_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'frozen',
      created_at TEXT NOT NULL,
      claimed_at TEXT
    );
  `)
}

function inviteConfig() {
  const g = (configService.getPublished() || {}).game || {}
  const rewards = g.rewards || {}
  const tiers = Array.isArray(rewards.invite) && rewards.invite.length
    ? rewards.invite.map((t) => ({
        need: Number(t.need) || Number(t.needCount) || Number(t.count) || 1,
        type: t.type || 'energy',
        value: Number(t.value) || Number(t.amount) || 0,
        label: t.label || '',
        giftId: t.giftId || '',
      }))
    : [
        { need: 1, type: 'energy', value: 50, label: '能量+50' },
        { need: 3, type: 'energy', value: 120, label: '能量+120' },
        { need: 5, type: 'lottery', value: 2, label: '抽次+2' },
      ]
  return {
    tiers: tiers.sort((a, b) => a.need - b.need),
    freezeHours: Number(rewards.inviteFreezeHours) > 0 ? Number(rewards.inviteFreezeHours) : 24,
    welcomeEnergy: Number(rewards.inviteWelcomeEnergy) >= 0 ? Number(rewards.inviteWelcomeEnergy) : 5,
  }
}

function validInviteCount(userId) {
  ensureTables()
  return dbMod
    .open()
    .prepare(`SELECT COUNT(*) AS n FROM invite_event WHERE inviter_id=? AND status='confirmed'`)
    .get(userId).n
}

/** 登录时绑定邀请人（仅一次） */
/** 登录前校验邀请码是否存在（不消耗绑定） */
function checkCode(inviteCode) {
  ensureTables()
  const code = String(inviteCode || '')
    .trim()
    .toUpperCase()
  if (!code) return { valid: false, msg: '请输入邀请码' }
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return { valid: false, msg: '邀请码格式不正确' }
  const d = dbMod.open()
  const inviter = d.prepare(`SELECT id, nick_name FROM user_account WHERE upper(invite_code)=?`).get(code)
  if (!inviter) return { valid: false, msg: '邀请码错误或不存在' }
  return {
    valid: true,
    msg: 'ok',
    inviterId: inviter.id,
    inviterName: inviter.nick_name || '',
  }
}

function tryBind(inviteeId, inviteCode) {
  ensureTables()
  if (!inviteCode) return { ok: false, msg: '无邀请码' }
  const d = dbMod.open()
  const me = d.prepare(`SELECT id, inviter_id, invite_code FROM user_account WHERE id=?`).get(inviteeId)
  if (!me) return { ok: false, msg: '用户不存在' }
  if (me.inviter_id) return { ok: false, msg: '已绑定过' }
  const code = String(inviteCode).trim().toUpperCase()
  if (me.invite_code && me.invite_code.toUpperCase() === code) {
    return { ok: false, msg: '不能邀请自己' }
  }
  const inviter = d.prepare(`SELECT id FROM user_account WHERE upper(invite_code)=?`).get(code)
  if (!inviter) return { ok: false, msg: '邀请码无效' }
  if (inviter.id === inviteeId) return { ok: false, msg: '不能邀请自己' }

  const cfg = inviteConfig()
  const now = dbMod.nowIso()
  let bound = false
  const tx = d.transaction(() => {
    // 条件绑定：并发登录时只有一次能写入，避免重复发欢迎能量
    const r = dbMod
      .open()
      .prepare(`UPDATE user_account SET inviter_id=?, updated_at=? WHERE id=? AND inviter_id IS NULL`)
      .run(inviter.id, now, inviteeId)
    if (!r || !r.changes) return
    bound = true
    d.prepare(
      `INSERT OR IGNORE INTO invite_event (inviter_id, invitee_id, day_key, status, created_at)
       VALUES (?,?,?,'pending',?)`
    ).run(inviter.id, inviteeId, dayKey(), now)
    // 双向好友边
    d.prepare(
      `INSERT OR IGNORE INTO friend_edge (user_id, friend_user_id, status, created_at) VALUES (?,?, 'active', ?)`
    ).run(inviter.id, inviteeId, now)
    d.prepare(
      `INSERT OR IGNORE INTO friend_edge (user_id, friend_user_id, status, created_at) VALUES (?,?, 'active', ?)`
    ).run(inviteeId, inviter.id, now)
  })
  tx()
  if (!bound) return { ok: false, msg: '已绑定过' }
  if (cfg.welcomeEnergy > 0) {
    try {
      require('./currencyService').grantEnergy(inviteeId, cfg.welcomeEnergy, {
        note: 'invite_welcome',
        refType: 'invite',
        refId: String(inviter.id),
      })
    } catch (_) {}
  }
  return { ok: true, inviterId: inviter.id, welcomeEnergy: cfg.welcomeEnergy }
}

/** scene 最大 32 字符：i=邀请码 */
function buildInviteScene(inviteCode) {
  const code = String(inviteCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return `i=${code}`.slice(0, 32)
}

function parseInviteScene(sceneRaw) {
  const raw = decodeURIComponent(String(sceneRaw || '').trim())
  if (!raw) return ''
  // i=YXABC123 或 invite=YXABC123 或纯码
  const m = raw.match(/(?:^|[?&])(?:i|invite)=([A-Za-z0-9]+)/i) || raw.match(/^([A-Za-z0-9]{4,16})$/)
  if (m) return String(m[1] || '').toUpperCase()
  try {
    const q = new URLSearchParams(raw.includes('=') ? raw : `i=${raw}`)
    const v = q.get('i') || q.get('invite') || ''
    return String(v).trim().toUpperCase()
  } catch (_) {
    return ''
  }
}

/**
 * 获取/生成用户专属小程序码（扫码落地首页并带邀请码）
 */
async function getInviteQrcode(userId, { force = false } = {}) {
  ensureTables()
  const d = dbMod.open()
  dbMod.addColumnIfMissing(
    d,
    'user_account',
    'invite_qr_path',
    `VARCHAR(255) NOT NULL DEFAULT ''`,
    `TEXT NOT NULL DEFAULT ''`
  )
  const me = d.prepare(`SELECT id, invite_code, invite_qr_path FROM user_account WHERE id=?`).get(userId)
  if (!me || !me.invite_code) return { ok: false, msg: '用户无邀请码' }
  const scene = buildInviteScene(me.invite_code)
  const sharePath = `/pages/home/index?invite=${encodeURIComponent(me.invite_code)}&channel=qrcode`
  if (!force && me.invite_qr_path) {
    return {
      ok: true,
      inviteCode: me.invite_code,
      scene,
      sharePath,
      qrPath: me.invite_qr_path,
      qrUrl: require('../mediaUrl').clientMediaPath(me.invite_qr_path) || me.invite_qr_path,
    }
  }
  try {
    const wxAuth = require('./wxAuth')
    const buf = await wxAuth.getWxaCodeUnlimited({
      scene,
      page: 'pages/home/index',
    })
    const cos = require('../cos')
    const key = `qmyx/invite-qr/u${userId}_${me.invite_code}.png`
    const put = await cos.putObject({
      key,
      buffer: buf,
      mime: 'image/png',
      originalName: `${me.invite_code}.png`,
    })
    const storagePath =
      require('../mediaUrl').toStoragePath(put.path) || `/uploads/${put.cosKey || key}`
    // await 微信/COS 之后禁止 deasync
    await dbMod.queryAsync(`UPDATE user_account SET invite_qr_path=?, updated_at=? WHERE id=?`, [
      storagePath,
      dbMod.nowIso(),
      userId,
    ])
    return {
      ok: true,
      inviteCode: me.invite_code,
      scene,
      sharePath,
      qrPath: storagePath,
      qrUrl: require('../mediaUrl').clientMediaPath(storagePath) || storagePath,
    }
  } catch (e) {
    return {
      ok: false,
      msg: (e && e.message) || '生成小程序码失败',
      inviteCode: me.invite_code,
      scene,
      sharePath,
    }
  }
}

/** 被邀请人完成首签 → 确认有效邀请并可能写入冻结奖励 */
function onInviteeCheckin(inviteeId) {
  ensureTables()
  const d = dbMod.open()
  const ev = d
    .prepare(`SELECT * FROM invite_event WHERE invitee_id=? AND status='pending'`)
    .get(inviteeId)
  if (!ev) return { ok: false }
  const now = dbMod.nowIso()
  const cfg = inviteConfig()
  d.prepare(
    `UPDATE invite_event SET status='confirmed', confirmed_at=? WHERE id=?`
  ).run(now, ev.id)

  const count = validInviteCount(ev.inviter_id)
  const alreadyTiers = d
    .prepare(`SELECT tier_need FROM invite_reward_hold WHERE user_id=?`)
    .all(ev.inviter_id)
    .map((r) => r.tier_need)
  const newHolds = []
  cfg.tiers.forEach((t) => {
    if (count >= t.need && !alreadyTiers.includes(t.need)) {
      const unlockAt = Date.now() + cfg.freezeHours * 3600 * 1000
      const reward = { type: t.type, value: t.value, label: t.label, giftId: t.giftId }
      const info = d
        .prepare(
          `INSERT INTO invite_reward_hold (user_id, tier_need, reward_json, unlock_at, status, created_at)
           VALUES (?,?,?,?,'frozen',?)`
        )
        .run(ev.inviter_id, t.need, JSON.stringify(reward), unlockAt, now)
      newHolds.push({ id: info.lastInsertRowid, need: t.need, unlockAt, reward })
      d.prepare(
        `INSERT INTO social_feed (user_id, actor_name, feed_type, amount, tip, created_at, read_flag)
         VALUES (?, '系统', 'invite', ?, ?, ?, 0)`
      ).run(ev.inviter_id, t.value || 0, `邀请达标 ${t.need} 人 · 奖励冻结中`, now)
    }
  })
  return { ok: true, count, newHolds }
}

function grantReward(userId, reward) {
  const currency = require('./currencyService')
  const norm = currency.normalizeRewardType(reward.type, reward.value)
  if (norm.type === 'energy' && norm.amount > 0) {
    currency.grantEnergy(userId, norm.amount, { note: 'invite' })
  }
}

function recordInviteCost(userId, reward, holdId) {
  try {
    // 邀请激励按「能量/积分等虚拟物」记示意成本：能量 1 点 ≈ 1 分钱，便于看激励占比
    let cent = 0
    try {
      const currency = require('./currencyService')
      const norm = currency.normalizeRewardType(reward.type, reward.value)
      if (norm.type === 'energy') cent = currency.energyToCent(norm.amount)
    } catch (_) {
      cent = Math.max(0, Number(reward.value) || 0)
    }
    if (!cent) return
    require('./adminService').addFinance({
      entryType: 'cost',
      category: 'invite_reward',
      amountCent: cent,
      refType: 'invite_hold',
      refId: String(holdId || ''),
      note: `邀请奖励解冻 ${reward.label || reward.type + '+' + reward.value}`,
    })
  } catch (e) {
    console.warn('[invite] finance skip', e && e.message)
  }
}

/** 解冻到期奖励 */
function unlockDue(userId) {
  ensureTables()
  const d = dbMod.open()
  const nowMs = Date.now()
  const rows = d
    .prepare(
      `SELECT * FROM invite_reward_hold WHERE user_id=? AND status='frozen' AND unlock_at<=?`
    )
    .all(userId, nowMs)
  if (!rows.length) return { ok: true, unlocked: [], totalEnergy: 0 }
  const now = dbMod.nowIso()
  let totalEnergy = 0
  const unlocked = []
  const tx = d.transaction(() => {
    rows.forEach((row) => {
      const reward = JSON.parse(row.reward_json || '{}')
      grantReward(userId, reward)
      d.prepare(
        `UPDATE invite_reward_hold SET status='claimed', claimed_at=? WHERE id=?`
      ).run(now, row.id)
      recordInviteCost(userId, reward, row.id)
      if (reward.type === 'energy') totalEnergy += reward.value || 0
      unlocked.push({ id: row.id, reward })
    })
  })
  tx()
  return { ok: true, unlocked, totalEnergy, msg: unlocked.length ? '邀请奖励已到账' : '' }
}

function summary(userId) {
  ensureTables()
  const justUnlocked = unlockDue(userId)
  const d = dbMod.open()
  const cfg = inviteConfig()
  const count = validInviteCount(userId)
  const me = d.prepare(`SELECT invite_code FROM user_account WHERE id=?`).get(userId)
  const holds = d
    .prepare(
      `SELECT id, tier_need, reward_json, unlock_at, status, created_at, claimed_at
       FROM invite_reward_hold WHERE user_id=? ORDER BY id DESC LIMIT 20`
    )
    .all(userId)
    .map((h) => ({
      id: h.id,
      need: h.tier_need,
      reward: JSON.parse(h.reward_json || '{}'),
      unlockAt: h.unlock_at,
      status: h.status,
      remainMs: h.status === 'frozen' ? Math.max(0, h.unlock_at - Date.now()) : 0,
    }))
  const frozenEnergy = holds
    .filter((h) => h.status === 'frozen' && h.reward.type === 'energy')
    .reduce((s, h) => s + (h.reward.value || 0), 0)
  const nextTier = cfg.tiers.find((t) => t.need > count) || null
  const boundInviterId = d.prepare(`SELECT inviter_id FROM user_account WHERE id=?`).get(userId)
  return {
    inviteCode: me ? me.invite_code : '',
    validInviteCount: count,
    freezeHours: cfg.freezeHours,
    welcomeEnergy: cfg.welcomeEnergy,
    hasInviter: !!(boundInviterId && boundInviterId.inviter_id),
    inviterId: (boundInviterId && boundInviterId.inviter_id) || null,
    canBindInvite: !(boundInviterId && boundInviterId.inviter_id),
    tiers: cfg.tiers.map((t) => ({
      ...t,
      reached: count >= t.need,
      gap: Math.max(0, t.need - count),
    })),
    nextTier,
    missOne: !!(nextTier && nextTier.need - count === 1),
    holds,
    frozenEnergy,
    justUnlocked,
    sharePath: me ? `/pages/home/index?invite=${encodeURIComponent(me.invite_code)}&channel=share_invite` : '',
  }
}

module.exports = {
  ensureTables,
  inviteConfig,
  checkCode,
  tryBind,
  onInviteeCheckin,
  unlockDue,
  summary,
  validInviteCount,
  dayKey,
  buildInviteScene,
  parseInviteScene,
  getInviteQrcode,
}

/**
 * 每日任务：定义在 task_def，日切 00:00（本地日）重置；
 * 进度可量化（如邀请 0/3）；奖励可能量 + 实物礼品同时发放。
 */
const dbMod = require('../db')

function db() {
  return dbMod.open()
}

function now() {
  return dbMod.nowIso()
}

function dayKey(d = new Date()) {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

let schemaReady = false

function ensureSchema() {
  if (schemaReady) return
  const d = db()
  const add = dbMod.addColumnIfMissing
  add(d, 'task_def', 'target_count', `INT NOT NULL DEFAULT 1`, `INTEGER NOT NULL DEFAULT 1`)
  add(d, 'task_def', 'reward_gift_id', `VARCHAR(64) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'task_def', 'desc_text', `VARCHAR(256) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  schemaReady = true
}

function autoRewardDesc(energy, giftId, giftName) {
  const parts = []
  const e = Number(energy) || 0
  if (e > 0) parts.push(`能量+${e}`)
  if (giftId) parts.push(giftName ? String(giftName).slice(0, 10) : '礼品+1')
  return parts.join(' · ') || '完成奖励'
}

function giftName(giftId) {
  if (!giftId) return ''
  try {
    const o = require('./offerService').resolveOffer(giftId)
    return (o && o.found && o.name) || ''
  } catch (_) {
    return ''
  }
}

function mapDef(row) {
  const target = Math.max(1, Number(row.target_count != null ? row.target_count : row.daily_limit) || 1)
  const energy = Number(row.reward_energy || 0) + Number(row.reward_coins || 0)
  const giftId = row.reward_gift_id || ''
  const name = giftName(giftId)
  const reward =
    row.reward_desc ||
    autoRewardDesc(energy, giftId, name)
  return {
    id: row.id,
    title: row.title,
    action: row.action_key || '',
    desc: row.desc_text || row.reward_desc || '',
    reward,
    rewardEnergy: energy,
    rewardGiftId: giftId,
    rewardGiftName: name,
    targetCount: target,
    dailyLimit: Math.max(1, Number(row.daily_limit) || 1),
    sortOrder: Number(row.sort_order) || 0,
    status: row.status || 'on',
    enabled: row.status !== 'off',
  }
}

function listDefs(includeOff = false) {
  ensureSchema()
  const sql = includeOff
    ? `SELECT * FROM task_def ORDER BY sort_order, id`
    : `SELECT * FROM task_def WHERE status='on' ORDER BY sort_order, id`
  return db().prepare(sql).all().map(mapDef)
}

function invitesToday(userId, dk) {
  try {
    require('./inviteService')
  } catch (_) {}
  const d = db()
  try {
    return (
      d
        .prepare(
          `SELECT COUNT(*) AS n FROM invite_event WHERE inviter_id=? AND day_key=?`
        )
        .get(userId, dk).n || 0
    )
  } catch (_) {
    return 0
  }
}

function hasCheckedInToday(userId, dk) {
  const d = db()
  const c = d.prepare(`SELECT 1 AS ok FROM user_checkin WHERE user_id=? AND day_key=?`).get(userId, dk)
  if (c) return true
  const t = d
    .prepare(
      `SELECT 1 AS ok FROM task_completion WHERE user_id=? AND day_key=? AND task_id IN ('checkin','t_checkin') AND status='done'`
    )
    .get(userId, dk)
  return !!t
}

function claimedToday(userId, taskId, dk) {
  const row = db()
    .prepare(
      `SELECT 1 AS ok FROM task_completion WHERE user_id=? AND task_id=? AND day_key=? AND status='done'`
    )
    .get(userId, taskId, dk)
  return !!row
}

function progressFor(userId, def, dk) {
  const action = String(def.action || '').toLowerCase()
  const target = Math.max(1, Number(def.targetCount) || 1)
  if (action === 'invite') {
    return Math.min(target, invitesToday(userId, dk))
  }
  if (action === 'checkin') {
    return hasCheckedInToday(userId, dk) ? target : 0
  }
  if (action === 'steps' || action.includes('step')) {
    try {
      const st = require('./stepsService').status(userId)
      if (st && (st.todayClaimed || st.canClaimToday || Number(st.steps) > 0)) {
        if (st.todayClaimed) return target
        return Math.min(target, Number(st.steps) > 0 ? 1 : 0)
      }
    } catch (_) {}
    return claimedToday(userId, def.id, dk) ? target : 0
  }
  // mall / festival / ad / 自定义：以当日是否已领取为准；未领则 0
  return claimedToday(userId, def.id, dk) ? target : 0
}

function statusFor(def, progress, claimed) {
  const target = Math.max(1, Number(def.targetCount) || 1)
  if (claimed) return 'done'
  if (progress >= target) {
    // 签到/步数等已在其它链路发奖：直接视为完成
    const a = String(def.action || '').toLowerCase()
    if (a === 'checkin' || a === 'steps' || a.includes('step')) return 'done'
    return 'claim'
  }
  return 'todo'
}

function listToday(userId) {
  ensureSchema()
  const dk = dayKey()
  const defs = listDefs(false).filter((t) => {
    const a = String(t.action || '').toLowerCase()
    const id = String(t.id || '').toLowerCase()
    return a !== 'steps' && !id.includes('step')
  })
  const list = defs.map((t) => {
    const progress = progressFor(userId, t, dk)
    const claimed = claimedToday(userId, t.id, dk)
    // 签到已做：同步记一条完成，便于统计（不重复发能量）
    const st = statusFor(t, progress, claimed)
    const target = t.targetCount
    return {
      ...t,
      dayKey: dk,
      progress,
      targetCount: target,
      progressText: `${progress}/${target}`,
      status: st,
      canClaim: st === 'claim',
      done: st === 'done',
    }
  })
  return {
    dayKey: dk,
    list,
    doneCount: list.filter((x) => x.done).length,
    total: list.length,
  }
}

function grantTaskGift(userId, giftId, taskId) {
  if (!giftId) return null
  try {
    const ord = require('./adminService').createRedeemOrder({
      userId,
      orderType: 'gift',
      productId: giftId,
      qty: 1,
      payPoints: 0,
      payCashCent: 0,
      entryFrom: 'task',
      address: { note: `每日任务 ${taskId}`, entryFrom: 'task' },
    })
    return ord && ord.ok ? ord : null
  } catch (e) {
    console.warn('[task] gift order', taskId, e && e.message)
    return null
  }
}

/**
 * 领取 / 完成任务（每日每任务最多一次 done）
 * invite：进度够才能领；checkin：若已签到则仅补礼品/记账
 */
function complete(userId, taskId) {
  ensureSchema()
  const d = db()
  const row = d.prepare(`SELECT * FROM task_def WHERE id=? AND status='on'`).get(taskId)
  if (!row) return { ok: false, msg: '任务不存在或已停用' }
  const def = mapDef(row)
  const dk = dayKey()
  if (claimedToday(userId, taskId, dk)) {
    return { ok: false, msg: '今日已完成', ...listToday(userId) }
  }

  const action = String(def.action || '').toLowerCase()
  let progress = progressFor(userId, def, dk)

  // 行为类：调用 complete 即计一次进度达成（逛商城/看广告等）
  if (
    action === 'mall' ||
    action === 'festival' ||
    action === 'ad' ||
    action === 'browse' ||
    (!action && def.targetCount <= 1)
  ) {
    progress = Math.max(progress, def.targetCount)
  }

  if (action === 'invite' && progress < def.targetCount) {
    return {
      ok: false,
      msg: `还需邀请 ${def.targetCount - progress} 人（${progress}/${def.targetCount}）`,
      ...listToday(userId),
    }
  }
  if (action === 'checkin' && !hasCheckedInToday(userId, dk)) {
    return { ok: false, msg: '请先完成今日签到', ...listToday(userId) }
  }

  const energy = Number(def.rewardEnergy) || 0
  // 签到能量已由 checkinService 发放，避免重复
  const grantEnergy = action === 'checkin' ? 0 : energy
  const reward = {
    energy: grantEnergy,
    giftId: def.rewardGiftId || '',
    label: def.reward,
  }

  const tx = d.transaction(() => {
    if (dbMod.DIALECT === 'mysql') {
      d.prepare(
        `INSERT INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
         VALUES (?,?,?,'done',?,?)
         ON DUPLICATE KEY UPDATE status='done', reward_json=VALUES(reward_json)`
      ).run(userId, taskId, dk, JSON.stringify(reward), now())
    } else {
      d.prepare(
        `INSERT INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
         VALUES (?,?,?,'done',?,?)
         ON CONFLICT(user_id, task_id, day_key) DO UPDATE SET status='done', reward_json=excluded.reward_json`
      ).run(userId, taskId, dk, JSON.stringify(reward), now())
    }
    if (grantEnergy > 0) {
      require('./currencyService').grantEnergy(userId, grantEnergy, { note: `task:${taskId}` })
    }
  })
  tx()

  let giftOrder = null
  if (def.rewardGiftId) {
    giftOrder = grantTaskGift(userId, def.rewardGiftId, taskId)
    if (!giftOrder) {
      // 礼品失败不回滚能量；提示用户
      return {
        ok: true,
        partial: true,
        msg: '能量已到账，礼品下单失败请联系客服',
        reward,
        wallet: require('./currencyService').getWallet(userId),
        ...listToday(userId),
      }
    }
  }

  const parts = []
  if (grantEnergy > 0) parts.push(`能量+${grantEnergy}`)
  if (giftOrder) parts.push('礼品已生成兑礼单')
  return {
    ok: true,
    msg: parts.length ? `任务完成 · ${parts.join(' · ')}` : '任务完成',
    reward,
    giftOrder,
    wallet: require('./currencyService').getWallet(userId),
    ...listToday(userId),
  }
}

function ensureTaskColumnsOnUpsert(body) {
  ensureSchema()
  return {
    targetCount: Math.max(1, Number(body.targetCount != null ? body.targetCount : body.dailyLimit) || 1),
    rewardGiftId: String(body.rewardGiftId || body.giftId || '').trim(),
    descText: String(body.descText || body.desc || '').trim(),
  }
}

module.exports = {
  ensureSchema,
  dayKey,
  listDefs,
  listToday,
  complete,
  mapDef,
  autoRewardDesc,
  giftName,
  ensureTaskColumnsOnUpsert,
}

/**
 * 自定义任务：定义在 task_def，日切 00:00（本地日）重置；
 * action 仅允许内置类型；进度可量化；奖励可能量 + 实物礼品同时发放。
 */
const dbMod = require('../db')

/** 内置任务类型：运营台下拉 + 前后端进度/发奖唯一来源 */
const BUILTIN_ACTIONS = [
  {
    key: 'checkin',
    label: '每日签到',
    defaultId: 'checkin',
    defaultTitle: '每日签到',
    defaultTarget: 1,
    defaultEnergy: 20,
    defaultDesc: '今日签到领奖',
    quantify: '以当日是否已签到计进度（0/1）',
    frontend: '点「去完成」→ 签到接口 → 记任务完成',
    progressSource: 'checkin',
    hideInTaskList: false,
  },
  {
    key: 'invite',
    label: '邀请好友',
    defaultId: 'invite',
    defaultTitle: '邀请好友',
    defaultTarget: 3,
    defaultEnergy: 30,
    defaultDesc: '好友通过邀请进入并登录',
    quantify: '当日成功邀请人数 / 目标（如 0/3）',
    frontend: '点「去完成」→ 邀请页；达标后点「领取」',
    progressSource: 'invite',
    hideInTaskList: false,
  },
  {
    key: 'mall',
    label: '逛商城',
    defaultId: 'browse_mall',
    defaultTitle: '逛商城',
    defaultTarget: 1,
    defaultEnergy: 5,
    defaultDesc: '打开商城逛一逛',
    quantify: '当日完成 1 次逛商城',
    frontend: '点「去完成」→ 进商城并记完成发奖',
    progressSource: 'action_complete',
    hideInTaskList: false,
  },
  {
    key: 'festival',
    label: '逛活动页',
    defaultId: 'festival',
    defaultTitle: '逛活动页',
    defaultTarget: 1,
    defaultEnergy: 5,
    defaultDesc: '打开活动/专题页',
    quantify: '当日完成 1 次逛活动页',
    frontend: '点「去完成」→ 进活动页并记完成发奖',
    progressSource: 'action_complete',
    hideInTaskList: false,
  },
  {
    key: 'ad',
    label: '看激励视频',
    defaultId: 'ad',
    defaultTitle: '看激励视频',
    defaultTarget: 1,
    defaultEnergy: 30,
    defaultDesc: '看完激励视频领奖',
    quantify: '当日看完 1 次激励视频',
    frontend: '点「去完成」→ 播广告 → 完成后发奖',
    progressSource: 'action_complete',
    hideInTaskList: false,
  },
  {
    key: 'mall_pay',
    label: '商城下单支付',
    defaultId: 'mall_pay',
    defaultTitle: '商城下单',
    defaultTarget: 1,
    defaultEnergy: 20,
    defaultDesc: '商城现金单支付成功',
    quantify: '当日已支付商城订单数 / 目标',
    frontend: '点「去完成」→ 商城；支付达标后点「领取」',
    progressSource: 'mall_pay',
    hideInTaskList: false,
  },
  {
    key: 'share',
    label: '分享小程序',
    defaultId: 'share',
    defaultTitle: '分享给好友',
    defaultTarget: 1,
    defaultEnergy: 10,
    defaultDesc: '分享小程序给好友',
    quantify: '当日完成 1 次分享确认',
    frontend: '点「去完成」→ 调起分享 → 确认后发奖',
    progressSource: 'action_complete',
    hideInTaskList: false,
  },
  {
    key: 'steps',
    label: '步数兑换（首页模块）',
    defaultId: 'steps',
    defaultTitle: '步数兑换',
    defaultTarget: 1,
    defaultEnergy: 15,
    defaultDesc: '首页步数模块兑换能量',
    quantify: '当日步数兑换是否已领',
    frontend: '不在每日任务列表展示，走首页步数条',
    progressSource: 'steps',
    hideInTaskList: true,
  },
]

const ACTION_MAP = Object.fromEntries(BUILTIN_ACTIONS.map((a) => [a.key, a]))

function normalizeActionKey(raw) {
  const a = String(raw || '')
    .trim()
    .toLowerCase()
  if (!a) return ''
  if (a === 'browse' || a === 'browse_mall') return 'mall'
  if (a.includes('step')) return 'steps'
  if (a === 'order' || a === 'pay') return 'mall_pay'
  return a
}

function getBuiltinActions() {
  return BUILTIN_ACTIONS.map((a) => ({
    key: a.key,
    label: a.label,
    defaultId: a.defaultId,
    defaultTitle: a.defaultTitle,
    defaultTarget: a.defaultTarget,
    defaultEnergy: a.defaultEnergy,
    defaultDesc: a.defaultDesc,
    quantify: a.quantify,
    frontend: a.frontend,
    hideInTaskList: !!a.hideInTaskList,
  }))
}

function assertBuiltinAction(actionKey) {
  const key = normalizeActionKey(actionKey)
  if (!key || !ACTION_MAP[key]) {
    return {
      ok: false,
      msg: `action 必须是内置类型：${BUILTIN_ACTIONS.map((x) => x.key).join(' / ')}`,
    }
  }
  return { ok: true, key }
}

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
  try {
    d.prepare(
      `UPDATE task_def SET target_count=daily_limit
       WHERE action_key='invite' AND (target_count IS NULL OR target_count<=1) AND daily_limit>1`
    ).run()
  } catch (_) {}
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
  const action = normalizeActionKey(row.action_key || '')
  const meta = ACTION_MAP[action] || null
  const reward = row.reward_desc || autoRewardDesc(energy, giftId, name)
  return {
    id: row.id,
    title: row.title,
    action,
    actionLabel: meta ? meta.label : action,
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
    quantify: meta ? meta.quantify : '',
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
  const d = db()
  try {
    return (
      d
        .prepare(`SELECT COUNT(*) AS n FROM invite_event WHERE inviter_id=? AND day_key=?`)
        .get(userId, dk).n || 0
    )
  } catch (_) {
    return 0
  }
}

function mallPayToday(userId, dk) {
  const d = db()
  try {
    return (
      d
        .prepare(
          `SELECT COUNT(*) AS n FROM redeem_order
           WHERE user_id=? AND order_type='mall' AND pay_status='paid'
             AND (substr(COALESCE(paid_at, created_at),1,10)=?)`
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
  const action = normalizeActionKey(def.action)
  const target = Math.max(1, Number(def.targetCount) || 1)
  if (action === 'invite') {
    return Math.min(target, invitesToday(userId, dk))
  }
  if (action === 'checkin') {
    return hasCheckedInToday(userId, dk) ? target : 0
  }
  if (action === 'mall_pay') {
    return Math.min(target, mallPayToday(userId, dk))
  }
  if (action === 'steps') {
    try {
      const st = require('./stepsService').status(userId)
      if (st && st.todayClaimed) return target
      if (st && Number(st.steps) > 0) return Math.min(target, 1)
    } catch (_) {}
    return claimedToday(userId, def.id, dk) ? target : 0
  }
  // mall / festival / ad / share：以当日是否已领取为准
  return claimedToday(userId, def.id, dk) ? target : 0
}

function statusFor(def, progress, claimed) {
  const target = Math.max(1, Number(def.targetCount) || 1)
  const a = normalizeActionKey(def.action)
  if (claimed) return 'done'
  if (progress >= target) {
    // 签到/步数能量已在其它链路发放，任务侧视为完成
    if (a === 'checkin' || a === 'steps') return 'done'
    // 邀请 / 商城支付：进度够 → 可领取
    if (a === 'invite' || a === 'mall_pay') return 'claim'
    return 'done'
  }
  return 'todo'
}

function listToday(userId) {
  ensureSchema()
  const dk = dayKey()
  const defs = listDefs(false).filter((t) => {
    const a = normalizeActionKey(t.action)
    const meta = ACTION_MAP[a]
    if (meta && meta.hideInTaskList) return false
    const id = String(t.id || '').toLowerCase()
    return a !== 'steps' && !id.includes('step')
  })
  const list = defs.map((t) => {
    const progress = progressFor(userId, t, dk)
    const claimed = claimedToday(userId, t.id, dk)
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
      address: { note: `自定义任务 ${taskId}`, entryFrom: 'task' },
    })
    return ord && ord.ok ? ord : null
  } catch (e) {
    console.warn('[task] gift order', taskId, e && e.message)
    return null
  }
}

/**
 * 领取 / 完成任务（每日每任务最多一次 done）
 */
function complete(userId, taskId) {
  ensureSchema()
  const d = db()
  const row = d.prepare(`SELECT * FROM task_def WHERE id=? AND status='on'`).get(taskId)
  if (!row) return { ok: false, msg: '任务不存在或已停用' }
  const def = mapDef(row)
  const actionCheck = assertBuiltinAction(def.action)
  if (!actionCheck.ok) return { ok: false, msg: actionCheck.msg }
  const action = actionCheck.key
  const dk = dayKey()
  if (claimedToday(userId, taskId, dk)) {
    return { ok: false, msg: '今日已完成', ...listToday(userId) }
  }

  let progress = progressFor(userId, def, dk)

  // 行为类：调用 complete 即计达成（逛商城/活动/广告/分享）
  if (action === 'mall' || action === 'festival' || action === 'ad' || action === 'share') {
    progress = Math.max(progress, def.targetCount)
  }

  if (action === 'invite' && progress < def.targetCount) {
    return {
      ok: false,
      msg: `还需邀请 ${def.targetCount - progress} 人（${progress}/${def.targetCount}）`,
      ...listToday(userId),
    }
  }
  if (action === 'mall_pay' && progress < def.targetCount) {
    return {
      ok: false,
      msg: `还需完成 ${def.targetCount - progress} 笔商城支付（${progress}/${def.targetCount}）`,
      ...listToday(userId),
    }
  }
  if (action === 'checkin' && !hasCheckedInToday(userId, dk)) {
    return { ok: false, msg: '请先完成今日签到', ...listToday(userId) }
  }
  if (action === 'steps') {
    return { ok: false, msg: '步数请在首页步数模块兑换', ...listToday(userId) }
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
  BUILTIN_ACTIONS,
  getBuiltinActions,
  assertBuiltinAction,
  normalizeActionKey,
}

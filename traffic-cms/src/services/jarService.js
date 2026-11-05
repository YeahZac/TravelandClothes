const dbMod = require('../db')
const configService = require('./configService')

function rules() {
  const pub = configService.getPublished() || {}
  const g = pub.game || {}
  const n = (v, d) => {
    const x = Number(v)
    return Number.isFinite(x) && x > 0 ? x : d
  }
  const p = g.eventProbability != null ? Number(g.eventProbability) : 0.4
  return {
    harvestIntervalMs: n(g.harvestIntervalMs, 3 * 60 * 60 * 1000),
    pendingCap: n(g.pendingCap, 60),
    harvestAmount: n(g.harvestAmount, 30),
    waterCooldownMs: n(g.waterCooldownMs, 3 * 60 * 60 * 1000),
    waterEnergy: n(g.waterEnergy, 15),
    waterLiquid: n(g.waterLiquid, 4),
    harvestLiquid: n(g.harvestLiquid, 6),
    stealPerDay: n(g.stealPerDay, 3),
    helpEnergyMe: n(g.helpEnergyMe, 5),
    helpEnergyFriend: n(g.helpEnergyFriend, 20),
    eventProbability: Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0.4)),
    eventDeadlineMs: n(g.eventDeadlineMs, 24 * 60 * 60 * 1000),
    eventPenalty: n(g.eventPenalty, 10),
    eventClearReward: n(g.eventClearReward, 10),
  }
}

function getState(userId) {
  const db = dbMod.open()
  const jar = db.prepare('SELECT * FROM jar_state WHERE user_id = ?').get(userId)
  const wallet = db.prepare('SELECT * FROM user_wallet WHERE user_id = ?').get(userId)
  if (!jar) return null
  return {
    stage: jar.stage,
    liquid: jar.liquid,
    pending: jar.pending,
    nextHarvestAt: jar.next_harvest_at,
    waterReadyAt: jar.water_ready_at,
    waterCount: jar.water_count,
    stealsLeft: jar.steals_left,
    helpedIds: JSON.parse(jar.helped_json || '[]'),
    event: jar.event_json ? JSON.parse(jar.event_json) : null,
    wallet: {
      energy: wallet.energy,
      points: wallet.points,
      coins: wallet.coins,
      lotteryChance: wallet.lottery_chance,
    },
  }
}

function alreadyDone(userId, actionId) {
  const db = dbMod.open()
  return db
    .prepare('SELECT id, action_type, delta_energy, delta_liquid, meta_json FROM jar_ledger WHERE user_id = ? AND action_id = ?')
    .get(userId, actionId)
}

function writeLedger(userId, actionId, actionType, deltaEnergy, deltaLiquid, meta) {
  const db = dbMod.open()
  db.prepare(
    `INSERT INTO jar_ledger (user_id, action_id, action_type, delta_energy, delta_liquid, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, actionId, actionType, deltaEnergy, deltaLiquid, JSON.stringify(meta || {}), dbMod.nowIso())
}

function bumpWallet(userId, energyDelta) {
  const db = dbMod.open()
  db.prepare(
    `UPDATE user_wallet SET energy = energy + ?, updated_at = ? WHERE user_id = ?`
  ).run(energyDelta, dbMod.nowIso(), userId)
}

function saveJar(userId, patch) {
  const db = dbMod.open()
  const cur = db.prepare('SELECT * FROM jar_state WHERE user_id = ?').get(userId)
  const next = { ...cur, ...patch, updated_at: dbMod.nowIso() }
  db.prepare(
    `UPDATE jar_state SET stage=?, liquid=?, pending=?, next_harvest_at=?, water_ready_at=?,
      water_count=?, steals_left=?, helped_json=?, event_json=?, updated_at=?
     WHERE user_id=?`
  ).run(
    next.stage,
    next.liquid,
    next.pending,
    next.next_harvest_at,
    next.water_ready_at,
    next.water_count,
    next.steals_left,
    next.helped_json,
    next.event_json,
    next.updated_at,
    userId
  )
}

function clampLiquid(n) {
  return Math.max(0, Math.min(100, n))
}

function harvest(userId, actionId) {
  const dup = alreadyDone(userId, actionId)
  if (dup) return { ok: true, idempotent: true, state: getState(userId) }
  const r = rules()
  const st = getState(userId)
  if (!st || st.pending <= 0) return { ok: false, msg: '还没有可收的能量' }
  const got = st.pending
  bumpWallet(userId, got)
  const liquid = clampLiquid(st.liquid + r.harvestLiquid)
  let event = st.event
  let eventSpawned = false
  if (!event && Math.random() < r.eventProbability) {
    event = {
      type: Math.random() < 0.5 ? 'pest' : 'drought',
      foundAt: Date.now(),
      penaltyAt: Date.now() + r.eventDeadlineMs,
    }
    eventSpawned = true
  }
  saveJar(userId, {
    pending: 0,
    liquid,
    next_harvest_at: Date.now() + r.harvestIntervalMs,
    event_json: event ? JSON.stringify(event) : null,
  })
  writeLedger(userId, actionId, 'harvest', got, r.harvestLiquid, { eventSpawned })
  return { ok: true, msg: `收取 ${got} 点能量`, detail: { got, eventSpawned }, state: getState(userId) }
}

function water(userId, actionId) {
  const dup = alreadyDone(userId, actionId)
  if (dup) return { ok: true, idempotent: true, state: getState(userId) }
  const r = rules()
  const st = getState(userId)
  if (Date.now() < st.waterReadyAt) {
    return { ok: false, msg: `浇水冷却中 · 约 ${Math.ceil((st.waterReadyAt - Date.now()) / 60000)} 分钟` }
  }
  bumpWallet(userId, r.waterEnergy)
  const liquid = clampLiquid(st.liquid + r.waterLiquid)
  saveJar(userId, {
    liquid,
    water_count: st.waterCount + 1,
    water_ready_at: Date.now() + r.waterCooldownMs,
  })
  writeLedger(userId, actionId, 'water', r.waterEnergy, r.waterLiquid, {})
  return { ok: true, msg: `浇水成功 · 能量 +${r.waterEnergy}`, state: getState(userId) }
}

function clearEvent(userId, actionId) {
  const dup = alreadyDone(userId, actionId)
  if (dup) return { ok: true, idempotent: true, state: getState(userId) }
  const r = rules()
  const st = getState(userId)
  if (!st.event) return { ok: false, msg: '没有需要处理的事件' }
  bumpWallet(userId, r.eventClearReward)
  saveJar(userId, { event_json: null })
  writeLedger(userId, actionId, 'clear_event', r.eventClearReward, 0, { type: st.event.type })
  return {
    ok: true,
    msg: `${st.event.type === 'pest' ? '已除虫' : '已补水'} · 能量 +${r.eventClearReward}`,
    state: getState(userId),
  }
}

function redeem(userId, actionId) {
  const dup = alreadyDone(userId, actionId)
  if (dup) return { ok: true, idempotent: true, state: getState(userId) }
  const st = getState(userId)
  if (st.liquid < 100) return { ok: false, msg: `还差 ${100 - st.liquid}% 满` }
  saveJar(userId, { stage: st.stage + 1, liquid: 0 })
  writeLedger(userId, actionId, 'redeem', 0, -100, { fromStage: st.stage })
  return { ok: true, msg: `第 ${st.stage} 罐兑礼成功`, state: getState(userId) }
}

function feed(userId, { limit = 20 } = {}) {
  const db = dbMod.open()
  const rows = db
    .prepare(
      `SELECT id, actor_name, feed_type, amount, tip, created_at, read_flag
       FROM social_feed WHERE user_id = ? ORDER BY id DESC LIMIT ?`
    )
    .all(userId, limit)
  const unread = db
    .prepare(`SELECT COUNT(1) AS c FROM social_feed WHERE user_id = ? AND read_flag = 0`)
    .get(userId).c
  return {
    unread,
    items: rows.map((r) => ({
      id: `feed_${r.id}`,
      type: r.feed_type,
      name: r.actor_name,
      amount: r.amount,
      tip: r.tip,
      time: r.created_at,
      read: !!r.read_flag,
    })),
  }
}

function markFeedRead(userId) {
  const db = dbMod.open()
  db.prepare(`UPDATE social_feed SET read_flag = 1 WHERE user_id = ?`).run(userId)
  return { ok: true }
}

function saveSubscribe(userId, grants) {
  const db = dbMod.open()
  const now = dbMod.nowIso()
  ;(grants || []).forEach((g) => {
    db.prepare(
      `INSERT INTO subscribe_grant (user_id, tmpl_key, tmpl_id, status, granted_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, tmpl_key) DO UPDATE SET tmpl_id=excluded.tmpl_id, status=excluded.status, granted_at=excluded.granted_at`
    ).run(userId, g.key, g.tmplId || '', g.status || 'accept', now)
  })
  return { ok: true }
}

module.exports = {
  rules,
  getState,
  harvest,
  water,
  clearEvent,
  redeem,
  feed,
  markFeedRead,
  saveSubscribe,
}

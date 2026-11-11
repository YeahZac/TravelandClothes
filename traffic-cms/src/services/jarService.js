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
  const jar = g.jar || {}
  const liquidNeed = n(jar.liquidNeed != null ? jar.liquidNeed : g.liquidNeed, 100)
  let careCooldownMs = 5 * 60 * 1000
  let careEnergyWater = 5
  let careEnergyFertilize = 8
  let careEnergyLight = 6
  try {
    const tr = require('./treeService').treeRules()
    careCooldownMs = tr.careCooldownMs || careCooldownMs
    careEnergyWater = tr.careEnergyWater != null ? tr.careEnergyWater : careEnergyWater
    careEnergyFertilize = tr.careEnergyFertilize != null ? tr.careEnergyFertilize : careEnergyFertilize
    careEnergyLight = tr.careEnergyLight != null ? tr.careEnergyLight : careEnergyLight
  } catch (_) {}
  // 树玩法默认 5 分钟照料冷却；仍可用 game.waterCooldownMs 覆盖浇水
  const waterCd = n(g.waterCooldownMs, careCooldownMs)
  return {
    harvestIntervalMs: n(g.harvestIntervalMs, 5 * 60 * 1000),
    pendingCap: n(g.pendingCap, 60),
    harvestAmount: n(g.harvestAmount, 30),
    waterCooldownMs: waterCd,
    careCooldownMs,
    careEnergyWater,
    careEnergyFertilize,
    careEnergyLight,
    waterEnergy: n(g.waterEnergy, careEnergyWater || 15),
    waterLiquid: n(g.waterLiquid, 4),
    harvestLiquid: n(g.harvestLiquid, 6),
    stealPerDay: n(g.stealPerDay, 3),
    helpEnergyMe: n(g.helpEnergyMe, 5),
    helpEnergyFriend: n(g.helpEnergyFriend, 20),
    eventProbability: Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0.4)),
    eventDeadlineMs: n(g.eventDeadlineMs, 24 * 60 * 60 * 1000),
    eventPenalty: n(g.eventPenalty, 10),
    eventClearReward: n(g.eventClearReward, 10),
    liquidNeed,
    stageCount: n(jar.stageCount != null ? jar.stageCount : g.stageCount, 3),
    redeemGiftId: String(jar.redeemGiftId || g.redeemGiftId || ''),
  }
}

/** 懒结算产能量：按阶段×树种 energyPerWave 累加 pending */
function waveAmountFor(userId, fallback) {
  try {
    const info = require('./treeService').energyPerWaveForUser(userId)
    if (info && info.amount > 0) return info.amount
  } catch (_) {}
  return fallback
}

function accruePending(userId) {
  const db = dbMod.open()
  const jar = db.prepare('SELECT * FROM jar_state WHERE user_id = ?').get(userId)
  if (!jar) return null
  const r = rules()
  const now = Date.now()
  let nextAt = Number(jar.next_harvest_at) || now
  let pending = Number(jar.pending) || 0
  let waves = 0
  const perWave = waveAmountFor(userId, r.harvestAmount)
  // 最多补 12 波（5 分钟节奏下约 1 小时）
  while (nextAt <= now && waves < 12 && pending < r.pendingCap) {
    pending = Math.min(r.pendingCap, pending + perWave)
    nextAt += r.harvestIntervalMs
    waves += 1
  }
  if (waves > 0) {
    db.prepare(
      `UPDATE jar_state SET pending=?, next_harvest_at=?, updated_at=? WHERE user_id=?`
    ).run(pending, nextAt, dbMod.nowIso(), userId)
  }
  return { pending, nextHarvestAt: nextAt, waves, energyPerWave: perWave }
}

function getState(userId) {
  const db = dbMod.open()
  const jar0 = db.prepare('SELECT * FROM jar_state WHERE user_id = ?').get(userId)
  if (!jar0) return null
  accruePending(userId)
  let tree = null
  try {
    const treeService = require('./treeService')
    treeService.ensureSchema()
    tree = treeService.getTreeState(userId)
  } catch (e) {
    console.warn('[jar] tree state skip:', e.message)
  }
  const jar = db.prepare('SELECT * FROM jar_state WHERE user_id = ?').get(userId)
  const wallet = require('./currencyService').getWallet(userId) || {
    energy: 0,
    points: 0,
    coins: 0,
    lotteryChance: 0,
  }
  const r0 = rules()
  let energyPerWave = r0.harvestAmount
  try {
    energyPerWave = require('./treeService').energyPerWaveForUser(userId).amount
  } catch (_) {}
  const state = {
    stage: jar.stage,
    liquid: jar.liquid,
    liquidNeed: r0.liquidNeed,
    pending: jar.pending,
    nextHarvestAt: jar.next_harvest_at,
    waterReadyAt: jar.water_ready_at,
    fertilizeReadyAt: Number(jar.fertilize_ready_at) || 0,
    lightReadyAt: Number(jar.light_ready_at) || 0,
    careCooldownMs: r0.careCooldownMs,
    harvestIntervalMs: r0.harvestIntervalMs,
    energyPerWave,
    waterCount: jar.water_count,
    stealsLeft: jar.steals_left,
    helpedIds: JSON.parse(jar.helped_json || '[]'),
    event: jar.event_json ? JSON.parse(jar.event_json) : null,
    tree,
    wallet,
  }
  // P2：有授权则按罐态调度订阅出站（不阻断读状态）
  try {
    require('./subscribeService').scheduleFromJar(userId, state)
  } catch (e) {}
  return state
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
  if (Number(energyDelta) > 0) {
    try {
      require('./currencyService').grantEnergy(userId, energyDelta, { note: 'jar' })
      return
    } catch (_) {}
  }
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
  accruePending(userId)
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
  try {
    const treeService = require('./treeService')
    const nut = treeService.nutritionFromAction(userId, 'harvest')
    treeService.addNutrition(userId, nut, { source: 'harvest', applyGainMult: false })
  } catch (_) {}
  writeLedger(userId, actionId, 'harvest', got, r.harvestLiquid, { eventSpawned })
  const state = getState(userId)
  try {
    const sub = require('./subscribeService')
    if (eventSpawned && state.event) {
      sub.enqueue(
        userId,
        'eventCritical',
        {
          title: state.event.type === 'pest' ? '罐子闹虫害了' : '罐子快干了',
          tip: '快回来处理',
          penaltyAt: state.event.penaltyAt,
        },
        Math.max(Date.now(), Number(state.event.penaltyAt) - 3600000)
      )
    }
    // 下一波产出到点提醒
    if (state.nextHarvestAt) {
      sub.enqueue(
        userId,
        'harvestReady',
        { title: '能量即将成熟', tip: '回来收取别浪费' },
        Number(state.nextHarvestAt)
      )
    }
  } catch (e) {}
  return { ok: true, msg: `收取 ${got} 点能量`, detail: { got, eventSpawned }, state }
}

function careAction(userId, actionId, kind) {
  const dup = alreadyDone(userId, actionId)
  if (dup) return { ok: true, idempotent: true, state: getState(userId) }
  try {
    require('./treeService').ensureSchema()
  } catch (_) {}
  const r = rules()
  const st = getState(userId)
  const now = Date.now()
  const labels = { water: '浇水', fertilize: '施肥', light: '光照' }
  const label = labels[kind] || kind
  let readyAt = st.waterReadyAt
  let readyField = 'water_ready_at'
  let energy = r.waterEnergy
  let cd = r.waterCooldownMs
  if (kind === 'fertilize') {
    readyAt = st.fertilizeReadyAt
    readyField = 'fertilize_ready_at'
    energy = r.careEnergyFertilize
    cd = r.careCooldownMs
  } else if (kind === 'light') {
    readyAt = st.lightReadyAt
    readyField = 'light_ready_at'
    energy = r.careEnergyLight
    cd = r.careCooldownMs
  } else {
    energy = r.careEnergyWater != null ? r.careEnergyWater : r.waterEnergy
    cd = r.careCooldownMs || r.waterCooldownMs
  }
  if (now < readyAt) {
    const mins = Math.max(1, Math.ceil((readyAt - now) / 60000))
    return { ok: false, msg: `${label}冷却中 · 约 ${mins} 分钟` }
  }
  if (energy > 0) bumpWallet(userId, energy)
  const liquid = clampLiquid(st.liquid + (kind === 'water' ? r.waterLiquid : 1))
  const patch = {
    liquid,
    water_count: kind === 'water' ? st.waterCount + 1 : st.waterCount,
  }
  patch[readyField] = now + cd
  // saveJar 不认识 fertilize/light 字段，直接写库
  const db = dbMod.open()
  const jar = db.prepare('SELECT * FROM jar_state WHERE user_id=?').get(userId)
  if (!jar) return { ok: false, msg: '罐子不存在' }
  db.prepare(
    `UPDATE jar_state SET liquid=?, water_count=?, water_ready_at=?, fertilize_ready_at=?, light_ready_at=?, updated_at=?
     WHERE user_id=?`
  ).run(
    liquid,
    patch.water_count,
    kind === 'water' ? now + cd : jar.water_ready_at,
    kind === 'fertilize' ? now + cd : Number(jar.fertilize_ready_at) || 0,
    kind === 'light' ? now + cd : Number(jar.light_ready_at) || 0,
    dbMod.nowIso(),
    userId
  )
  let nut = 0
  try {
    const treeService = require('./treeService')
    nut = treeService.nutritionFromAction(userId, kind)
    treeService.addNutrition(userId, nut, { source: kind, applyGainMult: false })
  } catch (_) {}
  writeLedger(userId, actionId, kind, energy, nut, { care: kind })
  return {
    ok: true,
    msg: `${label}成功 · 能量 +${energy}${nut ? ` · 营养 +${nut}` : ''}`,
    detail: { energy, nutrition: nut, kind },
    state: getState(userId),
  }
}

function water(userId, actionId) {
  return careAction(userId, actionId, 'water')
}

function fertilize(userId, actionId) {
  return careAction(userId, actionId, 'fertilize')
}

function light(userId, actionId) {
  return careAction(userId, actionId, 'light')
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
  const need = Math.max(1, Number(rules().liquidNeed || 100))
  if (st.liquid < need) return { ok: false, msg: `还差 ${need - st.liquid} 养成进度满兑（需 ${need}）` }
  saveJar(userId, { stage: st.stage + 1, liquid: 0 })
  writeLedger(userId, actionId, 'redeem', 0, -need, { fromStage: st.stage, liquidNeed: need })
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
  accruePending,
  harvest,
  water,
  fertilize,
  light,
  careAction,
  clearEvent,
  redeem,
  feed,
  markFeedRead,
  saveSubscribe,
  alreadyDone,
  writeLedger,
}

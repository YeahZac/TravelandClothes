/**
 * 能量树：七种差异化种子养成
 * - 每树独立 phases / 产出倍率 / 抗偷抗虫 / 日掉
 * - 每日掉落营养球，主人可吸收，好友可偷走一部分
 */
const dbMod = require('../db')
const configService = require('./configService')
const { defaultTreeConfig, resolveSeedId: aliasSeedId } = require('./treeDefaults')

let schemaReady = false

function dayKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function nNum(v, d) {
  const x = Number(v)
  return Number.isFinite(x) ? x : d
}

function mapSeed(s, basePhases) {
  const phases =
    Array.isArray(s.phases) && s.phases.length
      ? s.phases.map((p, i) => ({
          id: String(p.id || (basePhases[i] && basePhases[i].id) || `p${i}`),
          name: String(p.name || p.id || `阶段${i + 1}`),
          needNutrition: Math.max(0, nNum(p.needNutrition, (basePhases[i] && basePhases[i].needNutrition) || 0)),
          needDays: Math.max(0, nNum(p.needDays, (basePhases[i] && basePhases[i].needDays) || 0)),
          tip: String(p.tip || (basePhases[i] && basePhases[i].tip) || ''),
        }))
      : basePhases.map((p) => ({ ...p }))
  return {
    id: String(s.id),
    name: String(s.name || s.id),
    fruitName: String(s.fruitName || '果实'),
    theme: String(s.theme || 'elm'),
    leafTone: String(s.leafTone || '#7FA67A'),
    trunkTone: String(s.trunkTone || '#8B7355'),
    flowerTone: String(s.flowerTone || '#C9D4A8'),
    fruitTone: String(s.fruitTone || '#A8C070'),
    desc: String(s.desc || ''),
    playTag: String(s.playTag || ''),
    obtain: String(s.obtain || (s.isDefault ? 'free' : 'mall')),
    rarity: String(s.rarity || 'N'),
    isDefault: !!s.isDefault,
    priceCent: Math.max(0, nNum(s.priceCent, 0)),
    productId: String(s.productId || ''),
    lotteryWeight: Math.max(0, nNum(s.lotteryWeight, 0)),
    lotteryPrizeId: String(s.lotteryPrizeId || ''),
    yieldMult: Math.max(0.1, nNum(s.yieldMult, 1)),
    nutritionGainMult: Math.max(0.1, nNum(s.nutritionGainMult, 1)),
    pointsRatio: Math.max(0, Math.min(1, nNum(s.pointsRatio, 0.5))),
    stealResist: Math.max(0, Math.min(0.95, nNum(s.stealResist, 0))),
    eventResist: Math.max(0.1, Math.min(1, nNum(s.eventResist, 1))),
    checkinBonusNutrition: Math.max(0, nNum(s.checkinBonusNutrition, 0)),
    leafSunlightBonus: Math.max(0, nNum(s.leafSunlightBonus, 0)),
    dailyDropMin: s.dailyDropMin == null ? null : Math.max(1, nNum(s.dailyDropMin, 6)),
    dailyDropMax: s.dailyDropMax == null ? null : Math.max(1, nNum(s.dailyDropMax, 18)),
    phases,
  }
}

function treeRules() {
  const pub = configService.getPublished() || {}
  const raw = (pub.game && pub.game.tree) || {}
  const base = defaultTreeConfig()
  const phases = Array.isArray(raw.phases) && raw.phases.length ? raw.phases : base.phases
  const seedsRaw = Array.isArray(raw.seeds) && raw.seeds.length ? raw.seeds : base.seeds
  const basePhases = phases.map((p, i) => ({
    id: String(p.id || base.phases[i] && base.phases[i].id || `p${i}`),
    name: String(p.name || p.id || `阶段${i + 1}`),
    needNutrition: Math.max(0, nNum(p.needNutrition, (base.phases[i] && base.phases[i].needNutrition) || 0)),
    needDays: Math.max(0, nNum(p.needDays, (base.phases[i] && base.phases[i].needDays) || 0)),
    tip: String(p.tip || ''),
  }))
  return {
    enabled: raw.enabled !== false,
    phases: basePhases,
    seeds: seedsRaw.map((s) => mapSeed(s, basePhases)),
    dailyDropMin: Math.max(1, nNum(raw.dailyDropMin, base.dailyDropMin)),
    dailyDropMax: Math.max(1, nNum(raw.dailyDropMax, base.dailyDropMax)),
    sunlightBonusMin: Math.max(0, nNum(raw.sunlightBonusMin, base.sunlightBonusMin)),
    sunlightBonusMax: Math.max(0, nNum(raw.sunlightBonusMax, base.sunlightBonusMax)),
    nutritionPerWater: Math.max(0, nNum(raw.nutritionPerWater, base.nutritionPerWater)),
    nutritionPerHarvest: Math.max(0, nNum(raw.nutritionPerHarvest, base.nutritionPerHarvest)),
    stealDropRatio: Math.min(1, Math.max(0, nNum(raw.stealDropRatio, base.stealDropRatio))),
    stealDropMin: Math.max(1, nNum(raw.stealDropMin, base.stealDropMin)),
    claimOwnDropToNutrition: raw.claimOwnDropToNutrition !== false,
    fruitEnergyBase: Math.max(1, nNum(raw.fruitEnergyBase, base.fruitEnergyBase || 40)),
    fruitEnergyPerCycle: Math.max(0, nNum(raw.fruitEnergyPerCycle, base.fruitEnergyPerCycle || 5)),
  }
}

function ensureSchema() {
  if (schemaReady) return
  const d = dbMod.open()
  const cols = [
    ['seed_id', "VARCHAR(64) NOT NULL DEFAULT 'seed_elm'", "TEXT NOT NULL DEFAULT 'seed_elm'"],
    ['phase', "VARCHAR(32) NOT NULL DEFAULT 'seed'", "TEXT NOT NULL DEFAULT 'seed'"],
    ['nutrition', 'INT NOT NULL DEFAULT 0', 'INTEGER NOT NULL DEFAULT 0'],
    ['tree_started_at', "VARCHAR(40) NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''"],
    ['tree_cycle', 'INT NOT NULL DEFAULT 1', 'INTEGER NOT NULL DEFAULT 1'],
  ]
  cols.forEach(([col, mysqlDef, sqliteDef]) => {
    try {
      dbMod.addColumnIfMissing(d, 'jar_state', col, mysqlDef, sqliteDef)
    } catch (e) {
      console.warn('[tree] alter jar_state', col, e.message)
    }
  })
  if (dbMod.DIALECT === 'mysql') {
    d.prepare(
      `CREATE TABLE IF NOT EXISTS tree_drop (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        day_key VARCHAR(16) NOT NULL,
        amount INT NOT NULL DEFAULT 0,
        remaining INT NOT NULL DEFAULT 0,
        created_at VARCHAR(40) NOT NULL,
        UNIQUE KEY uk_owner_day (owner_id, day_key)
      )`
    ).run()
    d.prepare(
      `CREATE TABLE IF NOT EXISTS user_seed (
        user_id INT NOT NULL,
        seed_id VARCHAR(64) NOT NULL,
        qty INT NOT NULL DEFAULT 0,
        updated_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (user_id, seed_id)
      )`
    ).run()
  } else {
    d.prepare(
      `CREATE TABLE IF NOT EXISTS tree_drop (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        day_key TEXT NOT NULL,
        amount INTEGER NOT NULL DEFAULT 0,
        remaining INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE(owner_id, day_key)
      )`
    ).run()
    d.prepare(
      `CREATE TABLE IF NOT EXISTS user_seed (
        user_id INTEGER NOT NULL,
        seed_id TEXT NOT NULL,
        qty INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, seed_id)
      )`
    ).run()
  }
  schemaReady = true
}

function seedById(id) {
  const r = treeRules()
  const sid = aliasSeedId(id)
  return r.seeds.find((s) => s.id === sid) || r.seeds.find((s) => s.isDefault) || r.seeds[0]
}

function defaultSeedId() {
  const r = treeRules()
  const d = r.seeds.find((s) => s.isDefault || s.obtain === 'free') || r.seeds[0]
  return d ? d.id : 'seed_elm'
}

function phasesForSeed(seed) {
  if (seed && Array.isArray(seed.phases) && seed.phases.length) return seed.phases
  return treeRules().phases
}

function phaseIndex(phaseId, phases) {
  const i = phases.findIndex((p) => p.id === phaseId)
  return i >= 0 ? i : 0
}

function daysSince(iso) {
  if (!iso) return 0
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 0
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000))
}

function resolvePhase(nutrition, startedAt, phases) {
  const days = daysSince(startedAt)
  let current = phases[0]
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i]
    if (nutrition >= p.needNutrition && days >= p.needDays) current = p
    else break
  }
  const idx = phaseIndex(current.id, phases)
  const next = phases[idx + 1] || null
  let progress = 100
  if (next) {
    const prevNeed = current.needNutrition
    const span = Math.max(1, next.needNutrition - prevNeed)
    progress = Math.max(0, Math.min(99, Math.floor(((nutrition - prevNeed) / span) * 100)))
  }
  return { phase: current, next, progress, days, idx }
}

function randInt(min, max) {
  const a = Math.min(min, max)
  const b = Math.max(min, max)
  return a + Math.floor(Math.random() * (b - a + 1))
}

function ensureTreeRow(userId) {
  ensureSchema()
  const d = dbMod.open()
  const jar = d.prepare('SELECT * FROM jar_state WHERE user_id=?').get(userId)
  if (!jar) return null
  let seedId = aliasSeedId(jar.seed_id || '')
  let phase = jar.phase || ''
  let started = jar.tree_started_at || ''
  let nutrition = Number(jar.nutrition) || 0
  let cycle = Number(jar.tree_cycle) || 1
  let dirty = false
  if (!seedId || seedId !== (jar.seed_id || '')) {
    if (!seedId) seedId = defaultSeedId()
    dirty = true
  }
  if (!phase) {
    phase = 'seed'
    dirty = true
  }
  if (!started) {
    started = dbMod.nowIso()
    dirty = true
  }
  if (dirty) {
    d.prepare(
      `UPDATE jar_state SET seed_id=?, phase=?, nutrition=?, tree_started_at=?, tree_cycle=?, updated_at=? WHERE user_id=?`
    ).run(seedId, phase, nutrition, started, cycle, dbMod.nowIso(), userId)
  }
  const freeId = defaultSeedId()
  const inv = d.prepare(`SELECT qty FROM user_seed WHERE user_id=? AND seed_id=?`).get(userId, freeId)
  if (!inv) {
    d.prepare(`INSERT INTO user_seed (user_id, seed_id, qty, updated_at) VALUES (?,?,?,?)`).run(
      userId,
      freeId,
      1,
      dbMod.nowIso()
    )
  }
  return d.prepare('SELECT * FROM jar_state WHERE user_id=?').get(userId)
}

function ensureDailyDrop(userId) {
  ensureSchema()
  const r = treeRules()
  if (!r.enabled) return null
  const d = dbMod.open()
  const dk = dayKey()
  let row = d.prepare(`SELECT * FROM tree_drop WHERE owner_id=? AND day_key=?`).get(userId, dk)
  if (row) return row
  const jar = d.prepare('SELECT seed_id, phase FROM jar_state WHERE user_id=?').get(userId)
  const seed = seedById(jar && jar.seed_id)
  const dropMin = seed.dailyDropMin != null ? seed.dailyDropMin : r.dailyDropMin
  const dropMax = seed.dailyDropMax != null ? seed.dailyDropMax : r.dailyDropMax
  let amount = randInt(dropMin, dropMax)
  if (jar && jar.phase === 'leaf_fall') {
    amount += randInt(r.sunlightBonusMin, r.sunlightBonusMax)
    if (seed.leafSunlightBonus) amount += seed.leafSunlightBonus
  }
  const t = dbMod.nowIso()
  try {
    d.prepare(
      `INSERT INTO tree_drop (owner_id, day_key, amount, remaining, created_at) VALUES (?,?,?,?,?)`
    ).run(userId, dk, amount, amount, t)
  } catch (e) {
    // 并发唯一键
  }
  return d.prepare(`SELECT * FROM tree_drop WHERE owner_id=? AND day_key=?`).get(userId, dk)
}

function applyPhaseAdvance(userId) {
  const d = dbMod.open()
  const jar = d.prepare('SELECT * FROM jar_state WHERE user_id=?').get(userId)
  if (!jar) return
  const seed = seedById(jar.seed_id)
  const phases = phasesForSeed(seed)
  const resolved = resolvePhase(Number(jar.nutrition) || 0, jar.tree_started_at, phases)
  if (resolved.phase.id !== jar.phase) {
    d.prepare(`UPDATE jar_state SET phase=?, updated_at=? WHERE user_id=?`).run(
      resolved.phase.id,
      dbMod.nowIso(),
      userId
    )
  }
  d.prepare(`UPDATE jar_state SET liquid=?, updated_at=? WHERE user_id=?`).run(
    resolved.progress,
    dbMod.nowIso(),
    userId
  )
}

function addNutrition(userId, delta, meta = {}) {
  ensureSchema()
  if (!delta) return
  const d = dbMod.open()
  const jar = d.prepare('SELECT nutrition, seed_id FROM jar_state WHERE user_id=?').get(userId)
  if (!jar) return
  let add = delta
  if (meta.applyGainMult !== false) {
    const seed = seedById(jar.seed_id)
    add = Math.round(delta * (seed.nutritionGainMult || 1))
  }
  const next = Math.max(0, (Number(jar.nutrition) || 0) + add)
  d.prepare(`UPDATE jar_state SET nutrition=?, updated_at=? WHERE user_id=?`).run(
    next,
    dbMod.nowIso(),
    userId
  )
  applyPhaseAdvance(userId)
  return next
}

/** 浇水/收取：按全局基数 × 树种 nutritionGainMult */
function nutritionFromAction(userId, kind) {
  const r = treeRules()
  const jar = dbMod.open().prepare('SELECT seed_id FROM jar_state WHERE user_id=?').get(userId)
  const seed = seedById(jar && jar.seed_id)
  const base = kind === 'water' ? r.nutritionPerWater : r.nutritionPerHarvest
  return Math.max(0, Math.round(base * (seed.nutritionGainMult || 1)))
}

function eventPenaltyMult(userId) {
  const jar = dbMod.open().prepare('SELECT seed_id FROM jar_state WHERE user_id=?').get(userId)
  const seed = seedById(jar && jar.seed_id)
  return seed.eventResist != null ? seed.eventResist : 1
}

function applyCheckinBonus(userId) {
  ensureSchema()
  const jar = dbMod.open().prepare('SELECT seed_id FROM jar_state WHERE user_id=?').get(userId)
  if (!jar) return 0
  const seed = seedById(jar.seed_id)
  const bonus = seed.checkinBonusNutrition || 0
  if (bonus > 0) addNutrition(userId, bonus, { source: 'checkin', applyGainMult: false })
  return bonus
}

function getTreeState(userId) {
  ensureSchema()
  const r = treeRules()
  if (!r.enabled) return null
  const jar = ensureTreeRow(userId)
  if (!jar) return null
  ensureDailyDrop(userId)
  applyPhaseAdvance(userId)
  const fresh = dbMod.open().prepare('SELECT * FROM jar_state WHERE user_id=?').get(userId)
  const seed = seedById(fresh.seed_id)
  const phases = phasesForSeed(seed)
  const resolved = resolvePhase(Number(fresh.nutrition) || 0, fresh.tree_started_at, phases)
  const drop = dbMod
    .open()
    .prepare(`SELECT * FROM tree_drop WHERE owner_id=? AND day_key=?`)
    .get(userId, dayKey())
  const inventory = dbMod
    .open()
    .prepare(`SELECT seed_id, qty FROM user_seed WHERE user_id=? AND qty>0`)
    .all(userId)
    .map((row) => {
      const s = seedById(row.seed_id)
      return {
        seedId: row.seed_id,
        qty: row.qty,
        name: s && s.name,
        theme: s && s.theme,
        obtain: s && s.obtain,
        rarity: s && s.rarity,
        playTag: s && s.playTag,
      }
    })
  return {
    enabled: true,
    seedId: fresh.seed_id,
    seed,
    phase: resolved.phase.id,
    phaseName: resolved.phase.name,
    phaseTip: resolved.phase.tip,
    phaseIndex: resolved.idx,
    phaseCount: phases.length,
    progress: resolved.progress,
    nutrition: Number(fresh.nutrition) || 0,
    daysGrown: resolved.days,
    cycle: Number(fresh.tree_cycle) || 1,
    yieldMult: seed.yieldMult,
    playTag: seed.playTag,
    nextPhase: resolved.next
      ? {
          id: resolved.next.id,
          name: resolved.next.name,
          needNutrition: resolved.next.needNutrition,
          needDays: resolved.next.needDays,
          nutritionLeft: Math.max(0, resolved.next.needNutrition - (Number(fresh.nutrition) || 0)),
          daysLeft: Math.max(0, resolved.next.needDays - resolved.days),
        }
      : null,
    canHarvestFruit: resolved.phase.id === 'fruit' || resolved.phase.id === 'leaf_fall',
    fruitName: seed.fruitName,
    dailyDrop: drop
      ? { amount: drop.amount, remaining: drop.remaining, dayKey: drop.day_key }
      : { amount: 0, remaining: 0, dayKey: dayKey() },
    inventory,
    phases,
    seedsCatalog: r.seeds.map((s) => ({
      id: s.id,
      name: s.name,
      fruitName: s.fruitName,
      theme: s.theme,
      desc: s.desc,
      playTag: s.playTag,
      obtain: s.obtain,
      rarity: s.rarity,
      isDefault: s.isDefault,
      priceCent: s.priceCent,
      productId: s.productId,
      yieldMult: s.yieldMult,
      leafTone: s.leafTone,
      trunkTone: s.trunkTone,
      flowerTone: s.flowerTone,
      fruitTone: s.fruitTone,
    })),
  }
}

function claimOwnDrop(userId, actionId) {
  ensureSchema()
  const jarMod = require('./jarService')
  const dup = jarMod.alreadyDone && jarMod.alreadyDone(userId, actionId)
  if (dup) return { ok: true, idempotent: true, tree: getTreeState(userId) }
  const r = treeRules()
  const d = dbMod.open()
  const drop = ensureDailyDrop(userId)
  if (!drop || drop.remaining <= 0) return { ok: false, msg: '今天的营养已被收完' }
  const got = drop.remaining
  d.prepare(`UPDATE tree_drop SET remaining=0 WHERE id=?`).run(drop.id)
  if (r.claimOwnDropToNutrition) addNutrition(userId, got, { source: 'claim_drop', applyGainMult: false })
  else {
    d.prepare(`UPDATE user_wallet SET energy=energy+?, updated_at=? WHERE user_id=?`).run(
      got,
      dbMod.nowIso(),
      userId
    )
  }
  if (jarMod.writeLedger) {
    jarMod.writeLedger(userId, actionId, 'claim_drop', got, 0, { got })
  }
  return {
    ok: true,
    msg: `吸收阳光营养 +${got}`,
    detail: { got },
    tree: getTreeState(userId),
    state: jarMod.getState(userId),
  }
}

function stealNutrition(userId, friendId, actionId) {
  ensureSchema()
  const jarMod = require('./jarService')
  const social = require('./socialService')
  if (userId === friendId) return { ok: false, msg: '不能偷自己的营养' }
  const dup = jarMod.alreadyDone && jarMod.alreadyDone(userId, actionId)
  if (dup) return { ok: true, idempotent: true, tree: getTreeState(userId) }
  const r = treeRules()
  const act = social.dayAction(userId)
  const socialRules = social.rules()
  if (act.steals >= socialRules.stealPerDay) return { ok: false, msg: '今日偷取次数已用完' }
  ensureDailyDrop(friendId)
  const d = dbMod.open()
  const drop = d
    .prepare(`SELECT * FROM tree_drop WHERE owner_id=? AND day_key=?`)
    .get(friendId, dayKey())
  if (!drop || drop.remaining <= 0) return { ok: false, msg: '对方今天没有可偷的营养了' }
  const victim = d.prepare('SELECT seed_id FROM jar_state WHERE user_id=?').get(friendId)
  const victimSeed = seedById(victim && victim.seed_id)
  const resist = victimSeed.stealResist || 0
  const effectiveRatio = Math.max(0.05, r.stealDropRatio * (1 - resist))
  const take = Math.max(r.stealDropMin, Math.ceil(drop.remaining * effectiveRatio))
  const got = Math.min(drop.remaining, take)
  const left = drop.remaining - got
  d.prepare(`UPDATE tree_drop SET remaining=? WHERE id=?`).run(left, drop.id)
  addNutrition(userId, got, { source: 'steal_drop', from: friendId, applyGainMult: false })
  try {
    const me = d.prepare(`SELECT nick_name FROM user_account WHERE id=?`).get(userId)
    const actorName = (me && me.nick_name) || '好友'
    try {
      d.prepare(
        `INSERT INTO social_feed (user_id, actor_id, actor_name, feed_type, amount, tip, created_at, read_flag)
         VALUES (?,?,?,?,?,?,?,0)`
      ).run(friendId, userId, actorName, 'stolen', got, '偷走了树上的营养', dbMod.nowIso())
    } catch (_) {
      d.prepare(
        `INSERT INTO social_feed (user_id, actor_name, feed_type, amount, tip, created_at, read_flag)
         VALUES (?,?, 'stolen', ?, '偷走了树上的营养', ?, 0)`
      ).run(friendId, actorName, got, dbMod.nowIso())
    }
  } catch (_) {}
  if (jarMod.writeLedger) {
    jarMod.writeLedger(userId, actionId, 'steal_nutrition', got, 0, { friendId, got })
  }
  social.consumeStealSlot(userId)
  return {
    ok: true,
    msg: `偷到营养 +${got}`,
    detail: { got },
    tree: getTreeState(userId),
    state: jarMod.getState(userId),
    ...social.listFriends(userId),
  }
}

function plantSeed(userId, seedId, actionId) {
  ensureSchema()
  const jarMod = require('./jarService')
  const dup = jarMod.alreadyDone && jarMod.alreadyDone(userId, actionId)
  if (dup) return { ok: true, idempotent: true, tree: getTreeState(userId) }
  const sid = aliasSeedId(String(seedId || '').trim())
  const seed = seedById(sid)
  if (!seed || seed.id !== sid) return { ok: false, msg: '种子不存在' }
  const d = dbMod.open()
  const free = seed.isDefault || seed.obtain === 'free'
  const inv = d.prepare(`SELECT qty FROM user_seed WHERE user_id=? AND seed_id=?`).get(userId, sid)
  const qty = inv ? Number(inv.qty) : 0
  if (qty < 1 && !free) {
    return { ok: false, msg: '种子数量不足，去抽奖或商城看看吧' }
  }
  // 免费种可反复种植；付费/抽奖种种一棵扣一颗
  if (!free && qty >= 1) {
    d.prepare(`UPDATE user_seed SET qty=qty-1, updated_at=? WHERE user_id=? AND seed_id=?`).run(
      dbMod.nowIso(),
      userId,
      sid
    )
  }
  const jar = d.prepare('SELECT tree_cycle FROM jar_state WHERE user_id=?').get(userId)
  const nextCycle = ((jar && Number(jar.tree_cycle)) || 1) + 1
  d.prepare(
    `UPDATE jar_state SET seed_id=?, phase='seed', nutrition=0, liquid=0, tree_started_at=?, tree_cycle=?, updated_at=? WHERE user_id=?`
  ).run(sid, dbMod.nowIso(), nextCycle, dbMod.nowIso(), userId)
  if (jarMod.writeLedger) {
    jarMod.writeLedger(userId, actionId, 'plant_seed', 0, 0, { seedId: sid })
  }
  return { ok: true, msg: `已种下「${seed.name}」`, tree: getTreeState(userId), state: jarMod.getState(userId) }
}

function harvestFruit(userId, actionId) {
  ensureSchema()
  const jarMod = require('./jarService')
  const dup = jarMod.alreadyDone && jarMod.alreadyDone(userId, actionId)
  if (dup) return { ok: true, idempotent: true, tree: getTreeState(userId) }
  const tree = getTreeState(userId)
  if (!tree || !tree.canHarvestFruit) return { ok: false, msg: '还没到结果/落叶阶段' }
  const r = treeRules()
  const seed = tree.seed
  const base = r.fruitEnergyBase + tree.cycle * r.fruitEnergyPerCycle
  const energy = Math.round(base * (seed.yieldMult || 1))
  require('./currencyService').grantEnergy(userId, energy, { note: 'harvest_fruit' })
  dbMod
    .open()
    .prepare(
      `UPDATE jar_state SET phase='seed', nutrition=0, liquid=0, tree_started_at=?, tree_cycle=tree_cycle+1, stage=stage+1, updated_at=? WHERE user_id=?`
    )
    .run(dbMod.nowIso(), dbMod.nowIso(), userId)
  if (jarMod.writeLedger) {
    jarMod.writeLedger(userId, actionId, 'harvest_fruit', energy, 0, {
      fruit: tree.fruitName,
      cycle: tree.cycle,
      yieldMult: seed.yieldMult,
    })
  }
  return {
    ok: true,
    msg: `收获「${tree.fruitName}」· 能量值 +${energy}`,
    detail: { reward: energy, fruitName: tree.fruitName, yieldMult: seed.yieldMult },
    tree: getTreeState(userId),
    state: jarMod.getState(userId),
    wallet: require('./currencyService').getWallet(userId),
  }
}

function grantSeed(userId, seedId, qty = 1) {
  ensureSchema()
  const sid = aliasSeedId(String(seedId || '').trim())
  if (!sid || !seedById(sid) || seedById(sid).id !== sid) return { ok: false, msg: '无效种子' }
  const d = dbMod.open()
  const t = dbMod.nowIso()
  const row = d.prepare(`SELECT qty FROM user_seed WHERE user_id=? AND seed_id=?`).get(userId, sid)
  if (row) {
    d.prepare(`UPDATE user_seed SET qty=qty+?, updated_at=? WHERE user_id=? AND seed_id=?`).run(
      qty,
      t,
      userId,
      sid
    )
  } else {
    d.prepare(`INSERT INTO user_seed (user_id, seed_id, qty, updated_at) VALUES (?,?,?,?)`).run(
      userId,
      sid,
      qty,
      t
    )
  }
  return { ok: true }
}

function friendDropPreview(friendIds = []) {
  ensureSchema()
  const d = dbMod.open()
  const dk = dayKey()
  const out = {}
  friendIds.forEach((fid) => {
    const row = d.prepare(`SELECT remaining FROM tree_drop WHERE owner_id=? AND day_key=?`).get(fid, dk)
    out[fid] = row ? Number(row.remaining) || 0 : 0
  })
  return out
}

module.exports = {
  ensureSchema,
  treeRules,
  getTreeState,
  ensureDailyDrop,
  claimOwnDrop,
  stealNutrition,
  plantSeed,
  harvestFruit,
  grantSeed,
  addNutrition,
  nutritionFromAction,
  eventPenaltyMult,
  applyCheckinBonus,
  friendDropPreview,
  seedById,
  defaultTreeConfig,
}

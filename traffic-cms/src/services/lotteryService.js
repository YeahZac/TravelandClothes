/**
 * 抽奖引擎：幂等 · 中奖凭证 · 开奖闸 · 保底 · 历史 · 成本入账
 */
const crypto = require('crypto')
const dbMod = require('../db')

let schemaReady = false

const RARITY_RANK = { N: 1, R: 2, SR: 3, SSR: 4 }

const DEFAULT_PITY = {
  softMiss: 20,
  softBoost: 3,
  hardMiss: 50,
  newAccountHours: 24,
  virtualCostEnergyCent: 1,
  virtualCostCoinCent: 1,
  virtualCostPointsCent: 1,
  seedDefaultCostCent: 50,
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

function ensureSchema() {
  if (schemaReady) return
  const d = db()
  const add = dbMod.addColumnIfMissing
  add(d, 'lottery_draw', 'action_id', "VARCHAR(64) NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''")
  add(d, 'lottery_draw', 'prize_type', "VARCHAR(32) NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''")
  add(d, 'lottery_draw', 'product_id', "VARCHAR(64) NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''")
  add(d, 'lottery_prize', 'rarity', "VARCHAR(8) NOT NULL DEFAULT 'N'", "TEXT NOT NULL DEFAULT 'N'")
  add(d, 'lottery_prize', 'pool_id', "VARCHAR(64) NOT NULL DEFAULT 'default'", "TEXT NOT NULL DEFAULT 'default'")
  add(d, 'product', 'kind', "VARCHAR(32) NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''")
  add(d, 'user_account', 'risk_flag', 'INT NOT NULL DEFAULT 0', 'INTEGER NOT NULL DEFAULT 0')

  if (dbMod.DIALECT === 'mysql') {
    d.prepare(
      `CREATE TABLE IF NOT EXISTS lottery_win_claim (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        claim_token VARCHAR(64) NOT NULL,
        draw_id BIGINT NOT NULL,
        user_id INT NOT NULL,
        prize_id VARCHAR(64) NOT NULL,
        sku_id VARCHAR(64) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'open',
        expire_at VARCHAR(40) NOT NULL,
        order_no VARCHAR(64) NOT NULL DEFAULT '',
        created_at VARCHAR(40) NOT NULL,
        UNIQUE KEY uk_claim_token (claim_token),
        KEY idx_claim_user (user_id, status)
      )`
    ).run()
    d.prepare(
      `CREATE TABLE IF NOT EXISTS user_lottery_pity (
        user_id INT NOT NULL,
        pool_id VARCHAR(64) NOT NULL DEFAULT 'default',
        miss_streak INT NOT NULL DEFAULT 0,
        updated_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (user_id, pool_id)
      )`
    ).run()
    d.prepare(
      `CREATE TABLE IF NOT EXISTS lottery_pool (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'on',
        start_at VARCHAR(40) NOT NULL DEFAULT '',
        end_at VARCHAR(40) NOT NULL DEFAULT '',
        updated_at VARCHAR(40) NOT NULL
      )`
    ).run()
  } else {
    d.prepare(
      `CREATE TABLE IF NOT EXISTS lottery_win_claim (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_token TEXT NOT NULL UNIQUE,
        draw_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        prize_id TEXT NOT NULL,
        sku_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        expire_at TEXT NOT NULL,
        order_no TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`
    ).run()
    d.prepare(
      `CREATE TABLE IF NOT EXISTS user_lottery_pity (
        user_id INTEGER NOT NULL,
        pool_id TEXT NOT NULL DEFAULT 'default',
        miss_streak INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, pool_id)
      )`
    ).run()
    d.prepare(
      `CREATE TABLE IF NOT EXISTS lottery_pool (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'on',
        start_at TEXT NOT NULL DEFAULT '',
        end_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      )`
    ).run()
  }

  const pool = d.prepare(`SELECT id FROM lottery_pool WHERE id='default'`).get()
  if (!pool) {
    d.prepare(
      `INSERT INTO lottery_pool (id,name,status,start_at,end_at,updated_at) VALUES ('default','默认奖池','on','','',?)`
    ).run(now())
  }
  schemaReady = true
}

function pityConfig() {
  try {
    const ops = require('./opsService').getOps()
    const p = (ops && ops.lotteryPity) || {}
    return { ...DEFAULT_PITY, ...p }
  } catch (_) {
    return { ...DEFAULT_PITY }
  }
}

function walletPayload(userId) {
  const w = db().prepare('SELECT energy, points, coins, lottery_chance FROM user_wallet WHERE user_id=?').get(userId)
  if (!w) return null
  return {
    energy: w.energy,
    points: w.points,
    coins: w.coins,
    lotteryChance: w.lottery_chance,
  }
}

function getPity(userId, poolId = 'default') {
  ensureSchema()
  const d = db()
  let row = d.prepare(`SELECT * FROM user_lottery_pity WHERE user_id=? AND pool_id=?`).get(userId, poolId)
  if (!row) {
    d.prepare(`INSERT INTO user_lottery_pity (user_id, pool_id, miss_streak, updated_at) VALUES (?,?,0,?)`).run(
      userId,
      poolId,
      now()
    )
    row = { miss_streak: 0 }
  }
  return row
}

function setPity(userId, poolId, missStreak) {
  db()
    .prepare(`UPDATE user_lottery_pity SET miss_streak=?, updated_at=? WHERE user_id=? AND pool_id=?`)
    .run(missStreak, now(), userId, poolId)
}

function activePoolIds() {
  ensureSchema()
  const t = now()
  const rows = db().prepare(`SELECT * FROM lottery_pool WHERE status='on'`).all()
  return rows
    .filter((p) => {
      if (p.start_at && p.start_at > t) return false
      if (p.end_at && p.end_at < t) return false
      return true
    })
    .map((p) => p.id)
}

function prizeRarity(p) {
  if (p.rarity) return String(p.rarity).toUpperCase()
  if (p.prize_type === 'physical') return 'SSR'
  if (p.prize_type === 'seed') return 'SR'
  if (p.prize_type === 'empty') return 'N'
  return 'R'
}

function skuCostCent(prize) {
  const cfg = pityConfig()
  if (prize.product_id) {
    const sku = db().prepare(`SELECT cost_cent FROM product WHERE id=?`).get(prize.product_id)
    if (sku && Number(sku.cost_cent) > 0) return Number(sku.cost_cent)
  }
  if (prize.prize_type === 'seed') return cfg.seedDefaultCostCent
  if (prize.prize_type === 'energy') return Math.max(1, Number(prize.prize_value || 0) * cfg.virtualCostEnergyCent)
  if (prize.prize_type === 'coin') return Math.max(1, Number(prize.prize_value || 0) * cfg.virtualCostCoinCent)
  if (prize.prize_type === 'points') return Math.max(1, Number(prize.prize_value || 0) * cfg.virtualCostPointsCent)
  return 0
}

function skuStockOk(prize) {
  if (prize.stock === 0) return false
  if (prize.prize_type === 'physical' || prize.prize_type === 'seed') {
    if (!prize.product_id) return prize.prize_type === 'seed'
    const sku = db().prepare(`SELECT stock, status FROM product WHERE id=?`).get(prize.product_id)
    if (!sku || sku.status !== 'on') return prize.prize_type === 'seed' && !prize.product_id
    if (sku.stock <= 0 && prize.prize_type === 'physical') return false
  }
  return true
}

function isNewAccount(userId, hours) {
  const u = db().prepare(`SELECT created_at, risk_flag FROM user_account WHERE id=?`).get(userId)
  if (!u) return true
  if (Number(u.risk_flag) > 0) return true // 风险用户视同不可抽实物
  const t = Date.parse(u.created_at)
  if (!Number.isFinite(t)) return false
  return Date.now() - t < hours * 3600 * 1000
}

function canAffordPrize(prize, snap) {
  const cost = skuCostCent(prize)
  if (cost <= 0) return true
  if (snap.fused) return prize.prize_type === 'empty' || (prize.prize_type !== 'physical' && cost < 20)
  if (snap.dayLeftCent != null && cost > snap.dayLeftCent) return false
  if (snap.monthLeftCent != null && cost > snap.monthLeftCent) return false
  if (prize.prize_type === 'physical' && snap.todayPhysicalOrders >= (snap.bigPrizeDailyCap || 30)) {
    return false
  }
  return true
}

function buildCandidates(userId, poolId, missStreak) {
  ensureSchema()
  const cfg = pityConfig()
  let opsSnap = {}
  try {
    opsSnap = require('./opsService').riskSnapshot()
  } catch (_) {}
  const pools = activePoolIds()
  const poolFilter = pools.includes(poolId) ? poolId : 'default'
  let prizes = db()
    .prepare(`SELECT * FROM lottery_prize WHERE status='on' AND (stock=-1 OR stock>0)`)
    .all()
    .filter((p) => !p.pool_id || p.pool_id === poolFilter || p.pool_id === 'default')

  const newAcc = isNewAccount(userId, cfg.newAccountHours)
  const hardPity = missStreak >= cfg.hardMiss
  const softPity = missStreak >= cfg.softMiss

  const scored = []
  for (const p of prizes) {
    if (!skuStockOk(p)) continue
    if (p.prize_type === 'physical' && newAcc) continue
    if (!canAffordPrize(p, opsSnap)) continue
    if (hardPity && p.prize_type === 'empty') continue
    let w = Math.max(0, Number(p.weight) || 0)
    const rarity = prizeRarity(p)
    if (softPity && RARITY_RANK[rarity] >= RARITY_RANK.R) {
      w = Math.round(w * cfg.softBoost)
    }
    if (w <= 0) continue
    scored.push({ ...p, _w: w, _rarity: rarity, _cost: skuCostCent(p) })
  }

  if (!scored.length) {
    const empty = prizes.find((p) => p.prize_type === 'empty') || {
      id: 'p_empty',
      name: '谢谢参与',
      prize_type: 'empty',
      prize_value: 0,
      product_id: '',
      weight: 1,
      stock: -1,
      rarity: 'N',
    }
    return [{ ...empty, _w: 1, _rarity: 'N', _cost: 0 }]
  }
  return scored
}

function pickWeighted(list) {
  const total = list.reduce((s, p) => s + p._w, 0)
  let r = Math.random() * total
  let hit = list[list.length - 1]
  for (const p of list) {
    r -= p._w
    if (r <= 0) {
      hit = p
      break
    }
  }
  return hit
}

function makeClaimToken() {
  return crypto.randomBytes(16).toString('hex')
}

function insertClaim(drawId, userId, prizeId, skuId) {
  const token = makeClaimToken()
  const expire = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  const info = db()
    .prepare(
      `INSERT INTO lottery_win_claim (claim_token, draw_id, user_id, prize_id, sku_id, status, expire_at, order_no, created_at)
       VALUES (?,?,?,?,?,'open',?,'',?)`
    )
    .run(token, drawId, userId, prizeId, skuId, expire, now())
  return { claimToken: token, claimId: info.lastInsertRowid, expireAt: expire }
}

function consumeClaim(userId, claimToken, skuId) {
  ensureSchema()
  const d = db()
  const row = d
    .prepare(`SELECT * FROM lottery_win_claim WHERE claim_token=? AND user_id=?`)
    .get(String(claimToken || ''), userId)
  if (!row) return { ok: false, msg: '中奖凭证无效' }
  if (row.status !== 'open') return { ok: false, msg: '中奖凭证已使用或失效' }
  if (row.expire_at && row.expire_at < now()) {
    d.prepare(`UPDATE lottery_win_claim SET status='expired' WHERE id=?`).run(row.id)
    return { ok: false, msg: '中奖凭证已过期' }
  }
  if (skuId && row.sku_id && row.sku_id !== skuId) {
    return { ok: false, msg: '兑奖商品与中奖不符' }
  }
  return { ok: true, claim: row }
}

function markClaimUsed(claimId, orderNo) {
  db()
    .prepare(`UPDATE lottery_win_claim SET status='used', order_no=?, created_at=created_at WHERE id=?`)
    .run(String(orderNo || ''), claimId)
}

function recordFinanceCost(prize, drawId, userId) {
  const cost = skuCostCent(prize)
  if (cost <= 0) return 0
  try {
    require('./adminService').addFinance({
      entryType: 'cost',
      category: prize.prize_type === 'physical' ? 'lottery_physical' : 'lottery_virtual',
      amountCent: cost,
      refType: 'lottery_draw',
      refId: String(drawId),
      note: `抽奖 ${prize.name} user=${userId}`,
    })
  } catch (e) {
    console.warn('[lottery] finance', e.message)
  }
  return cost
}

function findByActionId(userId, actionId) {
  if (!actionId) return null
  ensureSchema()
  return db()
    .prepare(`SELECT * FROM lottery_draw WHERE user_id=? AND action_id=?`)
    .get(userId, actionId)
}

function drawResultFromRow(row, userId) {
  let claimToken = ''
  if (row.prize_type === 'physical') {
    const c = db()
      .prepare(`SELECT claim_token FROM lottery_win_claim WHERE draw_id=? AND user_id=? AND status='open'`)
      .get(row.id, userId)
    claimToken = (c && c.claim_token) || ''
  }
  return {
    ok: true,
    idempotent: true,
    drawId: row.id,
    claimToken,
    prize: {
      id: row.prize_id,
      name: row.prize_name,
      prizeType: row.prize_type,
      prizeValue: 0,
      productId: row.product_id || '',
      seedId: row.prize_type === 'seed' ? row.product_id || '' : '',
    },
    wallet: walletPayload(userId),
  }
}

function draw(userId, { actionId = '', poolId = 'default' } = {}) {
  ensureSchema()
  require('./adminService').seedIfEmpty()
  try {
    require('./adminService')
    // ensure seed prizes exist
    const admin = require('./adminService')
    if (typeof admin.ensureLotterySeedPrizes === 'function') {
      /* optional */
    }
  } catch (_) {}
  // ensure seed prizes via require path used in admin
  try {
    const d0 = db()
    // product_id 留空：种子奖绑定真实 SKU，不再默认挂 seed_peach 等演示物料
    ;[
      ['p_seed_peach', '桃夭种子', 'seed', 1, '', 12, -1, '', 'on', 5, 'R'],
      ['p_seed_bamboo', '节节高种子', 'seed', 1, '', 6, -1, '', 'on', 6, 'SR'],
      ['p_seed_pine', '苍松种子', 'seed', 1, '', 3, -1, '', 'on', 7, 'SR'],
    ].forEach((r) => {
      if (d0.prepare('SELECT id FROM lottery_prize WHERE id=?').get(r[0])) return
      d0.prepare(
        `INSERT INTO lottery_prize (id,name,prize_type,prize_value,product_id,weight,stock,image_url,status,sort_order,updated_at,rarity,pool_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], now(), r[10], 'default')
    })
  } catch (_) {}

  if (actionId) {
    const prev = findByActionId(userId, actionId)
    if (prev) return drawResultFromRow(prev, userId)
  }

  const d = db()
  const wallet = d.prepare('SELECT * FROM user_wallet WHERE user_id=?').get(userId)
  if (!wallet) return { ok: false, msg: '钱包不存在' }
  if (wallet.lottery_chance <= 0) return { ok: false, msg: '抽奖次数不足' }

  let snap = {}
  try {
    snap = require('./opsService').riskSnapshot()
    const today = dayKey()
    const todayDraws = d
      .prepare(`SELECT COUNT(*) AS n FROM lottery_draw WHERE user_id=? AND substr(created_at,1,10)=?`)
      .get(userId, today).n
    if (todayDraws >= (snap.perUserDailyLotteryLimit || 15)) {
      return { ok: false, msg: '今日抽奖次数已达风控上限' }
    }
    if (snap.allowLotteryPhysical === false) {
      // still allow virtual; filter in candidates
    }
  } catch (_) {}

  const pity = getPity(userId, poolId)
  const missStreak = Number(pity.miss_streak) || 0
  const candidates = buildCandidates(userId, poolId, missStreak)
  // 熔断且禁止实物时再滤一遍
  const filtered =
    snap.allowLotteryPhysical === false
      ? candidates.filter((p) => p.prize_type !== 'physical')
      : candidates
  const hit = pickWeighted(filtered.length ? filtered : candidates)

  let drawId = 0
  const tx = d.transaction(() => {
    d.prepare(`UPDATE user_wallet SET lottery_chance=lottery_chance-1, updated_at=? WHERE user_id=?`).run(
      now(),
      userId
    )
    if (hit.stock > 0) {
      d.prepare(`UPDATE lottery_prize SET stock=stock-1, updated_at=? WHERE id=?`).run(now(), hit.id)
    }
    if (hit.prize_type === 'coin') {
      d.prepare(`UPDATE user_wallet SET coins=coins+?, updated_at=? WHERE user_id=?`).run(
        hit.prize_value,
        now(),
        userId
      )
    } else if (hit.prize_type === 'energy') {
      d.prepare(`UPDATE user_wallet SET energy=energy+?, updated_at=? WHERE user_id=?`).run(
        hit.prize_value,
        now(),
        userId
      )
    } else if (hit.prize_type === 'points') {
      d.prepare(`UPDATE user_wallet SET points=points+?, updated_at=? WHERE user_id=?`).run(
        hit.prize_value,
        now(),
        userId
      )
    }
    const info = d
      .prepare(
        `INSERT INTO lottery_draw (user_id,prize_id,prize_name,cost_cent,created_at,action_id,prize_type,product_id)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(
        userId,
        hit.id,
        hit.name,
        0,
        now(),
        actionId || '',
        hit.prize_type,
        hit.product_id || ''
      )
    drawId = info.lastInsertRowid
  })
  tx()

  let claimToken = ''
  let expireAt = ''
  if (hit.prize_type === 'physical' && hit.product_id) {
    const c = insertClaim(drawId, userId, hit.id, hit.product_id)
    claimToken = c.claimToken
    expireAt = c.expireAt
  }
  if (hit.prize_type === 'seed') {
    try {
      require('./treeService').grantSeed(userId, hit.product_id || '', Math.max(1, Number(hit.prize_value) || 1))
    } catch (e) {
      console.warn('[lottery] grantSeed', e.message)
    }
  }

  const costCent = recordFinanceCost(hit, drawId, userId)
  if (costCent > 0) {
    d.prepare(`UPDATE lottery_draw SET cost_cent=? WHERE id=?`).run(costCent, drawId)
  }

  // pity：中 R+ 清零，否则 +1
  if (RARITY_RANK[prizeRarity(hit)] >= RARITY_RANK.R && hit.prize_type !== 'empty') {
    setPity(userId, poolId, 0)
  } else {
    setPity(userId, poolId, missStreak + 1)
  }

  return {
    ok: true,
    drawId,
    claimToken,
    expireAt,
    prize: {
      id: hit.id,
      name: hit.name,
      prizeType: hit.prize_type,
      prizeValue: hit.prize_value,
      productId: hit.product_id || '',
      seedId: hit.prize_type === 'seed' ? hit.product_id || '' : '',
      rarity: prizeRarity(hit),
    },
    wallet: walletPayload(userId),
    pity: { missStreak: hit.prize_type === 'empty' ? missStreak + 1 : 0 },
  }
}

function history(userId, { page = 1, pageSize = 20 } = {}) {
  ensureSchema()
  const d = db()
  const ps = Math.min(50, Math.max(1, Number(pageSize) || 20))
  const p = Math.max(1, Number(page) || 1)
  const total = d.prepare(`SELECT COUNT(*) AS n FROM lottery_draw WHERE user_id=?`).get(userId).n
  const rows = d
    .prepare(
      `SELECT id, prize_id, prize_name, prize_type, product_id, cost_cent, created_at
       FROM lottery_draw WHERE user_id=? ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(userId, ps, (p - 1) * ps)
  const claims = d
    .prepare(`SELECT draw_id, claim_token, status, expire_at FROM lottery_win_claim WHERE user_id=?`)
    .all(userId)
  const claimMap = {}
  claims.forEach((c) => {
    claimMap[c.draw_id] = c
  })
  return {
    total,
    page: p,
    pageSize: ps,
    items: rows.map((r) => ({
      id: r.id,
      prizeId: r.prize_id,
      name: r.prize_name,
      prizeType: r.prize_type,
      productId: r.product_id,
      costCent: r.cost_cent,
      time: r.created_at,
      claimToken: claimMap[r.id] && claimMap[r.id].status === 'open' ? claimMap[r.id].claim_token : '',
      claimStatus: claimMap[r.id] ? claimMap[r.id].status : '',
    })),
  }
}

function listPools() {
  ensureSchema()
  return db().prepare(`SELECT * FROM lottery_pool ORDER BY id`).all()
}

function upsertPool(body = {}) {
  ensureSchema()
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const d = db()
  const exists = d.prepare(`SELECT id FROM lottery_pool WHERE id=?`).get(id)
  const args = [
    body.name || id,
    body.status || 'on',
    body.startAt || body.start_at || '',
    body.endAt || body.end_at || '',
    now(),
  ]
  if (exists) {
    d.prepare(
      `UPDATE lottery_pool SET name=?, status=?, start_at=?, end_at=?, updated_at=? WHERE id=?`
    ).run(...args, id)
  } else {
    d.prepare(
      `INSERT INTO lottery_pool (id,name,status,start_at,end_at,updated_at) VALUES (?,?,?,?,?,?)`
    ).run(id, ...args)
  }
  return { ok: true, item: d.prepare(`SELECT * FROM lottery_pool WHERE id=?`).get(id) }
}

function setUserRiskFlag(userId, flag) {
  ensureSchema()
  db().prepare(`UPDATE user_account SET risk_flag=? WHERE id=?`).run(flag ? 1 : 0, userId)
  return { ok: true }
}

module.exports = {
  ensureSchema,
  draw,
  history,
  consumeClaim,
  markClaimUsed,
  walletPayload,
  listPools,
  upsertPool,
  setUserRiskFlag,
  pityConfig,
  activePoolIds,
}

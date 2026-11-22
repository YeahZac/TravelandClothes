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
const { chinaDayKey: dayKey, chinaDayRangeUtc } = require('./chinaDay')

function ensureSchema() {
  if (schemaReady) return
  // MySQL：DDL 仅 boot warmAllSchemasAsync；禁止请求路径 deasync CREATE/ALTER
  if (dbMod.DIALECT === 'mysql') {
    schemaReady = true
    return
  }
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
  // actionId 幂等：lottery_draw.action_id 允许空串无法建唯一键，单独一张锁表
  d.prepare(
    `CREATE TABLE IF NOT EXISTS lottery_action_lock (
      user_id INT NOT NULL,
      action_id VARCHAR(64) NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      PRIMARY KEY (user_id, action_id)
    )`
  ).run()
  schemaReady = true
  repairEmptyPrizes()
}

function pityConfig() {
  try {
    const opsSvc = require('./opsService')
    const ops = opsSvc.getOps()
    const p = (ops && ops.lotteryPity) || {}
    const merged = { ...DEFAULT_PITY, ...p }
    // 新号小时数以运营台 lotteryPage 为准（与防作弊表单同步）
    try {
      const lp = opsSvc.lotteryPageConfig()
      if (lp && lp.newAccountHours != null) merged.newAccountHours = lp.newAccountHours
      if (lp && lp.softMiss != null) merged.softMiss = lp.softMiss
      if (lp && lp.hardMiss != null) merged.hardMiss = lp.hardMiss
      if (lp && lp.softBoost != null) merged.softBoost = lp.softBoost
    } catch (_) {}
    return merged
  } catch (_) {
    return { ...DEFAULT_PITY }
  }
}

function walletPayload(userId) {
  try {
    return require('./currencyService').getWallet(userId)
  } catch (_) {
    const w = db().prepare('SELECT energy, points, coins, lottery_chance FROM user_wallet WHERE user_id=?').get(userId)
    if (!w) return null
    const energy = Number(w.energy || 0) + Number(w.points || 0) + Number(w.coins || 0)
    return { energy, points: energy, coins: 0, lotteryChance: 0 }
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

/** 谢谢参与判定：类型 empty，或名称/ID 兜底（修复历史误标 physical） */
function isEmptyPrize(prize) {
  if (!prize) return true
  const t = String(prize.prize_type || '').toLowerCase()
  if (t === 'empty' || t === 'thanks' || t === 'none') return true
  const id = String(prize.id || '')
  if (id === 'p_empty' || id.endsWith('_empty')) return true
  const name = String(prize.name || '')
  if (/谢谢参与|谢谢惠顾|未中奖/.test(name)) return true
  return false
}

/** 修复库内误标：谢谢参与必须为 empty，且不占奖池权重（勿在此处调 ensureSchema，防递归） */
function repairEmptyPrizes() {
  try {
    const d = db()
    d.prepare(
      `UPDATE lottery_prize
       SET prize_type='empty', prize_value=0, product_id='', weight=0, rarity='N', updated_at=?
       WHERE id='p_empty'
          OR prize_type='empty'
          OR name LIKE '%谢谢参与%'
          OR name LIKE '%谢谢惠顾%'`
    ).run(now())
  } catch (_) {}
}

function canAffordPrize(prize, snap) {
  const cost = skuCostCent(prize)
  if (cost <= 0) return true
  if (isEmptyPrize(prize)) return true
  if (snap.fused) return prize.prize_type !== 'physical' && cost < 20
  if (snap.dayLeftCent != null && cost > snap.dayLeftCent) return false
  if (snap.monthLeftCent != null && cost > snap.monthLeftCent) return false
  if (prize.prize_type === 'physical' && snap.todayPhysicalOrders >= (snap.bigPrizeDailyCap || 30)) {
    return false
  }
  return true
}

function emptyPrizeFallback(prizes = []) {
  const empty =
    (prizes || []).find((p) => isEmptyPrize(p)) || {
      id: 'p_empty',
      name: '谢谢参与',
      prize_type: 'empty',
      prize_value: 0,
      product_id: '',
      weight: 0,
      stock: -1,
      rarity: 'N',
      image_url: '',
    }
  return {
    ...empty,
    prize_type: 'empty',
    prize_value: 0,
    product_id: '',
    weight: 0,
    rarity: 'N',
    _w: 1,
    _rarity: 'N',
    _cost: 0,
  }
}

/** 当日已中奖去重用户数（非 empty）；短缓存避免每次抽奖都 COUNT DISTINCT 抢 SyncGate */
let _winUserCache = { day: '', n: 0, at: 0 }
function todayWinUserCount(today = dayKey()) {
  const now = Date.now()
  if (_winUserCache.day === today && now - _winUserCache.at < 5000) return _winUserCache.n
  ensureSchema()
  try {
    const n =
      db()
        .prepare(
          `SELECT COUNT(DISTINCT user_id) AS n FROM lottery_draw
           WHERE created_at >= ? AND created_at < ?
             AND IFNULL(prize_type,'') NOT IN ('','empty')
             AND IFNULL(prize_name,'') NOT LIKE '%谢谢参与%'
             AND IFNULL(prize_name,'') NOT LIKE '%谢谢惠顾%'`
        )
        .get(...chinaDayRangeUtc(today)).n || 0
    _winUserCache = { day: today, n, at: now }
    return n
  } catch (_) {
    return _winUserCache.day === today ? _winUserCache.n : 0
  }
}

/** 某用户当日抽奖总次数（含谢谢参与） */
function todayDrawCount(userId, today = dayKey()) {
  ensureSchema()
  try {
    return (
      db()
        .prepare(`SELECT COUNT(*) AS n FROM lottery_draw WHERE user_id=? AND created_at >= ? AND created_at < ?`)
        .get(userId, ...chinaDayRangeUtc(today)).n || 0
    )
  } catch (_) {
    return 0
  }
}

function lotteryQuotaForUser(userId) {
  let dailyLimit = 15
  let energyCost = 50
  try {
    const lp = require('./opsService').lotteryPageConfig()
    dailyLimit = Number(lp.dailyDrawLimit) || 15
    if (lp.energyCost != null) energyCost = Number(lp.energyCost)
  } catch (_) {}
  const todayUsed = todayDrawCount(userId)
  let sandbox = null
  try {
    sandbox = require('./testAccountService').activeSandbox(userId)
  } catch (_) {}
  const quota = require('./testAccountService').applySandboxQuota({
    dailyLimit,
    todayUsed,
    energyCost,
    sandbox,
  })
  return {
    dailyLimit: quota.dailyLimit,
    policyDailyLimit: dailyLimit,
    todayUsed: quota.todayUsed,
    todayLeft: quota.todayLeft,
    testMode: quota.testMode,
    bypassDrawLimit: quota.bypassDrawLimit,
    bypassEnergyCost: quota.bypassEnergyCost,
    energyCost: quota.energyCost,
  }
}

/** 某用户当日真中奖次数（非 empty） */
function todayUserRealWinCount(userId, today = dayKey()) {
  ensureSchema()
  try {
    return (
      db()
        .prepare(
          `SELECT COUNT(*) AS n FROM lottery_draw
           WHERE user_id=? AND created_at >= ? AND created_at < ?
             AND IFNULL(prize_type,'') NOT IN ('','empty')
             AND IFNULL(prize_name,'') NOT LIKE '%谢谢参与%'
             AND IFNULL(prize_name,'') NOT LIKE '%谢谢惠顾%'`
        )
        .get(userId, ...chinaDayRangeUtc(today)).n || 0
    )
  } catch (_) {
    return 0
  }
}

/**
 * @param {{ winPoolOnly?: boolean }} opts winPoolOnly=true 时排除 empty（两段式第二段）
 */
function buildCandidates(userId, poolId, missStreak, opts = {}) {
  ensureSchema()
  const cfg = pityConfig()
  // 优先用 drawAsync 预取的 snap，避免 SyncGate 内再扫一轮 finance/COUNT
  let opsSnap = opts.opsSnap && typeof opts.opsSnap === 'object' ? opts.opsSnap : null
  if (!opsSnap) {
    try {
      opsSnap = require('./opsService').riskSnapshot()
    } catch (_) {
      opsSnap = {}
    }
  }
  const pools = activePoolIds()
  const poolFilter = pools.includes(poolId) ? poolId : 'default'
  let prizes = db()
    .prepare(`SELECT * FROM lottery_prize WHERE status='on' AND (stock=-1 OR stock>0)`)
    .all()
    .filter((p) => !p.pool_id || p.pool_id === poolFilter || p.pool_id === 'default')

  const newAcc = isNewAccount(userId, cfg.newAccountHours)
  const softPity = missStreak >= cfg.softMiss

  const scored = []
  for (const p of prizes) {
    if (isEmptyPrize(p)) continue // 谢谢参与只走第一段占比，绝不进真中奖池
    if (!skuStockOk(p)) continue
    if (p.prize_type === 'physical' && newAcc) continue
    if (!canAffordPrize(p, opsSnap)) continue
    let w = Math.max(0, Number(p.weight) || 0)
    const rarity = prizeRarity(p)
    // 软保底只加权真中奖池内 R+，不改变第一段谢谢参与占比
    if (softPity && RARITY_RANK[rarity] >= RARITY_RANK.R) {
      w = Math.round(w * cfg.softBoost)
    }
    if (w <= 0) continue
    scored.push({ ...p, _w: w, _rarity: rarity, _cost: skuCostCent(p) })
  }

  if (!scored.length) {
    return [emptyPrizeFallback(prizes)]
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

/** 返回 false 表示凭证已被并发请求核销 */
function markClaimUsed(claimId, orderNo) {
  const r = db()
    .prepare(
      `UPDATE lottery_win_claim SET status='used', order_no=?, created_at=created_at WHERE id=? AND status='open'`
    )
    .run(String(orderNo || ''), claimId)
  return !!(r && r.changes)
}

/** 取消未支付兑奖单时恢复中奖凭证，避免凭证被占死 */
function reopenClaimByOrder(orderNo) {
  const no = String(orderNo || '').trim()
  if (!no) return false
  const r = db()
    .prepare(
      `UPDATE lottery_win_claim SET status='open', order_no='' WHERE order_no=? AND status='used'`
    )
    .run(no)
  return !!(r && r.changes)
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
    ...lotteryQuotaForUser(userId),
  }
}

function draw(userId, { actionId = '', poolId = 'default', riskSnap = null, lotteryPage = null } = {}) {
  ensureSchema()
  // 禁止在开奖路径自动灌演示奖项，避免覆盖运营后台已保存的奖池
  try {
    require('./adminService').seedIfEmpty()
  } catch (_) {}

  if (actionId) {
    const prev = findByActionId(userId, actionId)
    if (prev) return drawResultFromRow(prev, userId)
  }

  const d = db()
  const currency = require('./currencyService')
  currency.ensureMerged(userId)
  let sandbox = null
  try {
    sandbox = require('./testAccountService').activeSandbox(userId)
  } catch (_) {}
  const energyCost = currency.getEconomy().lotteryEnergyCost
  const bal = currency.walletEnergy(userId)
  const skipEnergy = !!(sandbox && sandbox.bypassEnergyCost)
  if (!skipEnergy && bal < energyCost) {
    const gap = energyCost - bal
    return {
      ok: false,
      msg:
        bal <= 0
          ? `还差 ${energyCost} 能量值才能抽奖，去做签到或任务攒一攒吧`
          : `还差 ${gap} 能量值才能抽奖（当前 ${bal} / 需 ${energyCost}）`,
    }
  }

  let snap = riskSnap && typeof riskSnap === 'object' ? riskSnap : {}
  let lp =
    lotteryPage && typeof lotteryPage === 'object'
      ? lotteryPage
      : {
          emptyRatePercent: 70,
          globalWinRate: 30,
          dailyWinUserCap: 200,
          dailyDrawLimit: 15,
          maxWinsPerUserPerDay: 3,
        }
  try {
    const ops = require('./opsService')
    // 未预取时才同步扫风控（会占 SyncGate）；C 端热路径应走 drawAsync 预取
    if (!riskSnap) snap = ops.riskSnapshot()
    if (!lotteryPage) lp = ops.lotteryPageConfig()
    const todayDraws = todayDrawCount(userId)
    let drawLimit = lp.dailyDrawLimit || snap.perUserDailyLotteryLimit || 15
    if (sandbox) {
      if (sandbox.bypassDrawLimit) drawLimit = todayDraws + 999
      else if (sandbox.lotteryBonusActive > 0) drawLimit += sandbox.lotteryBonusActive
    }
    if (todayDraws >= drawLimit) {
      return { ok: false, msg: '今日抽奖次数已达上限' }
    }
  } catch (_) {}

  const pity = getPity(userId, poolId)
  const missStreak = Number(pity.miss_streak) || 0
  const today = dayKey()
  const winUsers = todayWinUserCount(today)
  const dailyCap = Number(lp.dailyWinUserCap) || 0
  const capReached = dailyCap > 0 && winUsers >= dailyCap
  const userWins = todayUserRealWinCount(userId, today)
  const userWinCap = Number(lp.maxWinsPerUserPerDay) || 0
  const userWinCapped = userWinCap > 0 && userWins >= userWinCap
  // 第一段：谢谢参与占比；达日峰顶 / 个人日中奖上限 → 强制谢谢参与
  const emptyRate = Math.min(
    100,
    Math.max(
      0,
      Number(
        lp.emptyRatePercent != null ? lp.emptyRatePercent : 100 - (Number(lp.globalWinRate) || 0)
      ) || 0
    )
  )
  // repairEmptyPrizes 已在 ensureSchema/boot 跑过；热路径禁止再扫 UPDATE LIKE

  const forceEmpty = capReached || userWinCapped
  const rolledEmpty = forceEmpty || Math.random() * 100 < emptyRate

  let hit
  if (rolledEmpty) {
    const allOn = d
      .prepare(`SELECT * FROM lottery_prize WHERE status='on'`)
      .all()
    hit = emptyPrizeFallback(allOn)
  } else {
    const candidates = buildCandidates(userId, poolId, missStreak, {
      winPoolOnly: true,
      opsSnap: snap,
    })
    // 熔断且禁止实物时再滤一遍
    const filtered =
      snap.allowLotteryPhysical === false
        ? candidates.filter((p) => p.prize_type !== 'physical' && !isEmptyPrize(p))
        : candidates.filter((p) => !isEmptyPrize(p))
    const pool = (filtered.length ? filtered : candidates).filter((p) => !isEmptyPrize(p))
    hit = pool.length ? pickWeighted(pool) : emptyPrizeFallback(candidates)
  }
  // 最终兜底：绝不把谢谢参与当实物发出
  if (isEmptyPrize(hit)) {
    hit = emptyPrizeFallback([hit])
  }

  let drawId = 0
  const tx = d.transaction(() => {
    const tdb = db()
    if (actionId) {
      // 同一 actionId 并发时第二个请求在此撞主键，整笔回滚，不会双扣双中
      tdb
        .prepare(`INSERT INTO lottery_action_lock (user_id, action_id, created_at) VALUES (?,?,?)`)
        .run(userId, actionId, now())
    }
    if (!skipEnergy && energyCost > 0) {
      const spent = currency.spendEnergy(userId, energyCost, { note: 'lottery' })
      if (!spent.ok) throw new Error(spent.msg || '能量值不足')
    }
    if (hit.stock > 0) {
      const r = tdb
        .prepare(`UPDATE lottery_prize SET stock=stock-1, updated_at=? WHERE id=? AND stock>0`)
        .run(now(), hit.id)
      if (!r.changes) {
        // 最后一件被并发抽走：本次降级为谢谢参与，不超发
        hit = emptyPrizeFallback(tdb.prepare(`SELECT * FROM lottery_prize WHERE status='on'`).all())
      }
    }
    // coin / points / energy 一律发放能量值
    if (hit.prize_type === 'coin' || hit.prize_type === 'energy' || hit.prize_type === 'points') {
      currency.grantEnergy(userId, hit.prize_value, { note: `lottery:${hit.prize_type}` })
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
  try {
    tx()
  } catch (e) {
    const dupAction =
      actionId && e && (e.code === 'ER_DUP_ENTRY' || /UNIQUE|Duplicate|PRIMARY/i.test(e.message || ''))
    if (!dupAction) throw e
    const prev = findByActionId(userId, actionId)
    if (prev) return drawResultFromRow(prev, userId)
    return { ok: false, msg: '抽奖处理中，请勿重复点击' }
  }

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

  // 真中奖后使日峰顶缓存失效，避免短窗内超发
  if (!isEmptyPrize(hit)) _winUserCache.at = 0

  // pity：真中奖且 R+ 清零，谢谢参与 / 普通奖累加未中 streak
  if (!isEmptyPrize(hit) && RARITY_RANK[prizeRarity(hit)] >= RARITY_RANK.R) {
    setPity(userId, poolId, 0)
  } else {
    setPity(userId, poolId, missStreak + 1)
  }

  let imageUrl = hit.image_url || ''
  if (!imageUrl && hit.product_id) {
    try {
      const offer = require('./offerService').resolveOffer(hit.product_id)
      imageUrl = offer.imageUrl || ''
    } catch (_) {}
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
      imageUrl,
    },
    wallet: walletPayload(userId),
    pity: { missStreak: isEmptyPrize(hit) ? missStreak + 1 : 0 },
    ...lotteryQuotaForUser(userId),
  }
}

function mapHistoryItems(rows, claimMap) {
  return (rows || []).map((r) => {
    const c = claimMap[r.id]
    const prizeId = String(r.prize_id || '')
    let source = 'lottery'
    if (prizeId.startsWith('checkin:')) source = 'checkin'
    else if (prizeId.startsWith('steps:')) source = 'steps'
    else if (prizeId.startsWith('flash:')) source = 'flash'
    else if (prizeId.startsWith('task:')) source = 'task'
    return {
      id: r.id,
      prizeId,
      name: r.prize_name,
      prizeType: r.prize_type,
      productId: r.product_id,
      costCent: r.cost_cent,
      time: require('./chinaDay').formatChinaDateTime(r.created_at),
      claimToken: c && c.status === 'open' ? c.claim_token : '',
      claimStatus: c ? c.status : '',
      /** 已兑奖后关联履约单，便于中奖记录跳兑换/发货 */
      orderNo: c && c.order_no ? c.order_no : '',
      source,
    }
  })
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
    .prepare(`SELECT draw_id, claim_token, status, expire_at, order_no FROM lottery_win_claim WHERE user_id=?`)
    .all(userId)
  const claimMap = {}
  claims.forEach((c) => {
    claimMap[c.draw_id] = c
  })
  return {
    total,
    page: p,
    pageSize: ps,
    items: mapHistoryItems(rows, claimMap),
  }
}

async function historyAsync(userId, { page = 1, pageSize = 20 } = {}) {
  ensureSchema()
  const ps = Math.min(50, Math.max(1, Number(pageSize) || 20))
  const p = Math.max(1, Number(page) || 1)
  const offset = (p - 1) * ps
  const [[countRows], [rows], [claims]] = await Promise.all([
    dbMod.queryAsync(`SELECT COUNT(*) AS n FROM lottery_draw WHERE user_id=?`, [userId]),
    dbMod.queryAsync(
      `SELECT id, prize_id, prize_name, prize_type, product_id, cost_cent, created_at
       FROM lottery_draw WHERE user_id=? ORDER BY id DESC LIMIT ? OFFSET ?`,
      [userId, ps, offset]
    ),
    dbMod.queryAsync(
      `SELECT draw_id, claim_token, status, expire_at, order_no FROM lottery_win_claim WHERE user_id=?`,
      [userId]
    ),
  ])
  const claimMap = {}
  ;(claims || []).forEach((c) => {
    claimMap[c.draw_id] = c
  })
  return {
    total: Number((countRows && countRows[0] && countRows[0].n) || 0),
    page: p,
    pageSize: ps,
    items: mapHistoryItems(rows || [], claimMap),
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

/**
 * 活动实物兑奖凭证（签到/步数等）：写入 lottery_draw + lottery_win_claim，
 * 出现在「我的记录 · 中奖记录」，用户填地址后生成履约单。
 */
function grantActivityPhysicalClaim({
  userId,
  source = 'checkin',
  sourceKey = '',
  productId,
  prizeName = '',
  actionId = '',
} = {}) {
  ensureSchema()
  const uid = Number(userId) || 0
  const sku = String(productId || '').trim()
  if (!uid || !sku) return { ok: false, msg: '缺少用户或礼品' }
  const d = db()
  const aid = String(actionId || `${source}_${uid}_${sourceKey || Date.now()}`).slice(0, 96)
  const exist = d.prepare(`SELECT id FROM lottery_draw WHERE user_id=? AND action_id=?`).get(uid, aid)
  if (exist) {
    const c = d
      .prepare(`SELECT claim_token, status, order_no FROM lottery_win_claim WHERE draw_id=? AND user_id=?`)
      .get(exist.id, uid)
    return {
      ok: true,
      idempotent: true,
      drawId: exist.id,
      claimToken: c && c.status === 'open' ? c.claim_token : '',
      claimStatus: (c && c.status) || '',
      orderNo: (c && c.order_no) || '',
      productId: sku,
    }
  }
  let giftName = String(prizeName || '').trim()
  if (!giftName) {
    try {
      const o = require('./offerService').resolveOffer(sku)
      giftName = (o && o.found && o.name) || '实物礼品'
    } catch (_) {
      giftName = '实物礼品'
    }
  }
  const prizeId = `${String(source).slice(0, 24)}:${String(sourceKey || sku).slice(0, 40)}`
  let drawId = 0
  let claim = null
  const tx = d.transaction(() => {
    const info = d
      .prepare(
        `INSERT INTO lottery_draw (user_id,prize_id,prize_name,cost_cent,created_at,action_id,prize_type,product_id)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(uid, prizeId, giftName.slice(0, 120), 0, now(), aid, 'physical', sku)
    drawId = Number(info.lastInsertRowid || info.insertId || 0)
    claim = insertClaim(drawId, uid, prizeId, sku)
  })
  tx()
  return {
    ok: true,
    drawId,
    claimToken: (claim && claim.claimToken) || '',
    claimStatus: 'open',
    orderNo: '',
    productId: sku,
    prizeName: giftName,
    expireAt: (claim && claim.expireAt) || '',
    source,
  }
}

async function findByActionIdAsync(userId, actionId) {
  if (!actionId) return null
  ensureSchema()
  const [rows] = await dbMod.queryAsync(
    `SELECT * FROM lottery_draw WHERE user_id=? AND action_id=? LIMIT 1`,
    [userId, actionId]
  )
  return (rows && rows[0]) || null
}

async function drawResultFromRowAsync(row, userId) {
  let claimToken = ''
  if (row.prize_type === 'physical') {
    const [cRows] = await dbMod.queryAsync(
      `SELECT claim_token FROM lottery_win_claim WHERE draw_id=? AND user_id=? AND status='open' LIMIT 1`,
      [row.id, userId]
    )
    claimToken = (cRows && cRows[0] && cRows[0].claim_token) || ''
  }
  const currency = require('./currencyService')
  const wallet = await currency.getWalletAsync(userId)
  const todayUsed = await todayDrawCountAsync(userId)
  let dailyLimit = 15
  try {
    dailyLimit = Number(require('./opsService').lotteryPageConfig().dailyDrawLimit) || 15
  } catch (_) {}
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
    wallet,
    dailyLimit,
    policyDailyLimit: dailyLimit,
    todayUsed,
    todayLeft: Math.max(0, dailyLimit - todayUsed),
    testMode: false,
  }
}

async function todayDrawCountAsync(userId, today = dayKey()) {
  ensureSchema()
  try {
    const [rows] = await dbMod.queryAsync(
      `SELECT COUNT(*) AS n FROM lottery_draw WHERE user_id=? AND created_at >= ? AND created_at < ?`,
      [userId, ...chinaDayRangeUtc(today)]
    )
    return Number((rows && rows[0] && rows[0].n) || 0)
  } catch (_) {
    return 0
  }
}

async function todayUserRealWinCountAsync(userId, today = dayKey()) {
  ensureSchema()
  try {
    const [rows] = await dbMod.queryAsync(
      `SELECT COUNT(*) AS n FROM lottery_draw
       WHERE user_id=? AND created_at >= ? AND created_at < ?
         AND IFNULL(prize_type,'') NOT IN ('','empty')
         AND IFNULL(prize_name,'') NOT LIKE '%谢谢参与%'
         AND IFNULL(prize_name,'') NOT LIKE '%谢谢惠顾%'`,
      [userId, ...chinaDayRangeUtc(today)]
    )
    return Number((rows && rows[0] && rows[0].n) || 0)
  } catch (_) {
    return 0
  }
}

async function todayWinUserCountAsync(today = dayKey()) {
  const nowMs = Date.now()
  if (_winUserCache.day === today && nowMs - _winUserCache.at < 5000) return _winUserCache.n
  ensureSchema()
  try {
    const [rows] = await dbMod.queryAsync(
      `SELECT COUNT(DISTINCT user_id) AS n FROM lottery_draw
       WHERE created_at >= ? AND created_at < ?
         AND IFNULL(prize_type,'') NOT IN ('','empty')
         AND IFNULL(prize_name,'') NOT LIKE '%谢谢参与%'
         AND IFNULL(prize_name,'') NOT LIKE '%谢谢惠顾%'`,
      [...chinaDayRangeUtc(today)]
    )
    const n = Number((rows && rows[0] && rows[0].n) || 0)
    _winUserCache = { day: today, n, at: nowMs }
    return n
  } catch (_) {
    return _winUserCache.day === today ? _winUserCache.n : 0
  }
}

async function getPityAsync(userId, poolId = 'default') {
  ensureSchema()
  const [rows] = await dbMod.queryAsync(
    `SELECT * FROM user_lottery_pity WHERE user_id=? AND pool_id=? LIMIT 1`,
    [userId, poolId]
  )
  if (rows && rows[0]) return rows[0]
  try {
    await dbMod.queryAsync(
      `INSERT INTO user_lottery_pity (user_id, pool_id, miss_streak, updated_at) VALUES (?,?,0,?)`,
      [userId, poolId, now()]
    )
  } catch (_) {}
  return { miss_streak: 0 }
}

async function setPityAsync(userId, poolId, missStreak) {
  await dbMod.queryAsync(
    `UPDATE user_lottery_pity SET miss_streak=?, updated_at=? WHERE user_id=? AND pool_id=?`,
    [missStreak, now(), userId, poolId]
  )
}

async function buildCandidatesAsync(userId, poolId, missStreak, opsSnap) {
  ensureSchema()
  const cfg = pityConfig()
  const [poolRows] = await dbMod.queryAsync(`SELECT * FROM lottery_pool WHERE status='on'`)
  const t = now()
  const pools = (poolRows || [])
    .filter((p) => {
      if (p.start_at && p.start_at > t) return false
      if (p.end_at && p.end_at < t) return false
      return true
    })
    .map((p) => p.id)
  const poolFilter = pools.includes(poolId) ? poolId : 'default'
  const [prizes] = await dbMod.queryAsync(
    `SELECT * FROM lottery_prize WHERE status='on' AND (stock=-1 OR stock>0)`
  )
  const filtered = (prizes || []).filter(
    (p) => !p.pool_id || p.pool_id === poolFilter || p.pool_id === 'default'
  )
  const productIds = [
    ...new Set(
      filtered
        .filter((p) => p.product_id && (p.prize_type === 'physical' || p.prize_type === 'seed'))
        .map((p) => p.product_id)
    ),
  ]
  const productMap = {}
  if (productIds.length) {
    const ph = productIds.map(() => '?').join(',')
    const [prods] = await dbMod.queryAsync(
      `SELECT id, stock, status, cost_cent FROM product WHERE id IN (${ph})`,
      productIds
    )
    ;(prods || []).forEach((r) => {
      productMap[r.id] = r
    })
  }
  const [uRows] = await dbMod.queryAsync(
    `SELECT created_at, risk_flag FROM user_account WHERE id=? LIMIT 1`,
    [userId]
  )
  const u = uRows && uRows[0]
  let newAcc = true
  if (u) {
    if (Number(u.risk_flag) > 0) newAcc = true
    else {
      const ct = Date.parse(u.created_at)
      newAcc = Number.isFinite(ct) ? Date.now() - ct < cfg.newAccountHours * 3600 * 1000 : false
    }
  }
  const softPity = missStreak >= cfg.softMiss
  const scored = []
  for (const p of filtered) {
    if (isEmptyPrize(p)) continue
    if (p.stock === 0) continue
    if (p.prize_type === 'physical' || p.prize_type === 'seed') {
      if (!p.product_id) {
        if (p.prize_type !== 'seed') continue
      } else {
        const sku = productMap[p.product_id]
        if (!sku || sku.status !== 'on') {
          if (!(p.prize_type === 'seed' && !p.product_id)) continue
        } else if (sku.stock <= 0 && p.prize_type === 'physical') continue
      }
    }
    if (p.prize_type === 'physical' && newAcc) continue
    // 成本 / 熔断：复用内存 snap
    let cost = 0
    if (p.product_id && productMap[p.product_id] && Number(productMap[p.product_id].cost_cent) > 0) {
      cost = Number(productMap[p.product_id].cost_cent)
    } else if (p.prize_type === 'seed') cost = cfg.seedDefaultCostCent
    else if (p.prize_type === 'energy')
      cost = Math.max(1, Number(p.prize_value || 0) * cfg.virtualCostEnergyCent)
    else if (p.prize_type === 'coin')
      cost = Math.max(1, Number(p.prize_value || 0) * cfg.virtualCostCoinCent)
    else if (p.prize_type === 'points')
      cost = Math.max(1, Number(p.prize_value || 0) * cfg.virtualCostPointsCent)
    const snap = opsSnap || {}
    if (cost > 0 && !isEmptyPrize(p)) {
      if (snap.fused && (p.prize_type === 'physical' || cost >= 20)) continue
      if (snap.dayLeftCent != null && cost > snap.dayLeftCent) continue
      if (snap.monthLeftCent != null && cost > snap.monthLeftCent) continue
      if (p.prize_type === 'physical' && snap.todayPhysicalOrders >= (snap.bigPrizeDailyCap || 30))
        continue
    }
    let w = Math.max(0, Number(p.weight) || 0)
    const rarity = prizeRarity(p)
    if (softPity && RARITY_RANK[rarity] >= RARITY_RANK.R) w = Math.round(w * cfg.softBoost)
    if (w <= 0) continue
    scored.push({ ...p, _w: w, _rarity: rarity, _cost: cost })
  }
  if (!scored.length) return [emptyPrizeFallback(filtered)]
  return scored
}

/**
 * C 端抽奖热路径：全程 queryAsync / withTransactionAsync，禁止 runSync。
 * 金币未扣却提示服务繁忙，就是旧 drawAsync 仍占 SyncGate 撞 DB_BUSY。
 */
async function drawAsync(userId, opts = {}) {
  ensureSchema()
  const actionId = (opts && opts.actionId) || ''
  const poolId = (opts && opts.poolId) || 'default'
  const ops = require('./opsService')
  const currency = require('./currencyService')
  let riskSnap = (opts && opts.riskSnap) || null
  let lotteryPage = (opts && opts.lotteryPage) || null
  try {
    if (!riskSnap || !lotteryPage) {
      await ops.getOpsAsync()
      if (!riskSnap) riskSnap = await ops.riskSnapshotAsync()
      if (!lotteryPage) lotteryPage = ops.lotteryPageConfig()
    }
  } catch (e) {
    console.warn('[lottery] drawAsync prefetch', e && e.message)
  }
  const lp =
    lotteryPage && typeof lotteryPage === 'object'
      ? lotteryPage
      : {
          emptyRatePercent: 70,
          globalWinRate: 30,
          dailyWinUserCap: 200,
          dailyDrawLimit: 15,
          maxWinsPerUserPerDay: 3,
        }
  const snap = riskSnap && typeof riskSnap === 'object' ? riskSnap : {}

  return require('./userLock').withUserLockAsync('lottery_draw', userId, async () => {
    if (actionId) {
      const prev = await findByActionIdAsync(userId, actionId)
      if (prev) return await drawResultFromRowAsync(prev, userId)
    }

    let sandbox = null
    try {
      sandbox = await require('./testAccountService').activeSandboxAsync(userId)
    } catch (_) {
      sandbox = null
    }

    const baseEnergyCost =
      Number(lp.energyCost) >= 0
        ? Number(lp.energyCost)
        : currency.getEconomy().lotteryEnergyCost
    const wallet0 = await currency.getWalletAsync(userId)
    const bal = Number((wallet0 && wallet0.energy) || 0)
    const today = dayKey()
    const [todayDraws, winUsers, userWins, pity] = await Promise.all([
      todayDrawCountAsync(userId, today),
      todayWinUserCountAsync(today),
      todayUserRealWinCountAsync(userId, today),
      getPityAsync(userId, poolId),
    ])
    const baseLimit = lp.dailyDrawLimit || snap.perUserDailyLotteryLimit || 15
    const quota = require('./testAccountService').applySandboxQuota({
      dailyLimit: baseLimit,
      todayUsed: todayDraws,
      energyCost: baseEnergyCost,
      sandbox,
    })
    const energyCost = quota.energyCost
    const drawLimit = quota.dailyLimit
    const skipEnergy = quota.bypassEnergyCost
    if (!skipEnergy && bal < energyCost) {
      const gap = energyCost - bal
      return {
        ok: false,
        msg:
          bal <= 0
            ? `还差 ${energyCost} 能量值才能抽奖，去做签到或任务攒一攒吧`
            : `还差 ${gap} 能量值才能抽奖（当前 ${bal} / 需 ${energyCost}）`,
      }
    }
    if (todayDraws >= drawLimit) return { ok: false, msg: '今日抽奖次数已达上限' }

    const missStreak = Number(pity.miss_streak) || 0
    const dailyCap = Number(lp.dailyWinUserCap) || 0
    const capReached = dailyCap > 0 && winUsers >= dailyCap
    const userWinCap = Number(lp.maxWinsPerUserPerDay) || 0
    const userWinCapped = userWinCap > 0 && userWins >= userWinCap
    const emptyRate = Math.min(
      100,
      Math.max(
        0,
        Number(
          lp.emptyRatePercent != null ? lp.emptyRatePercent : 100 - (Number(lp.globalWinRate) || 0)
        ) || 0
      )
    )
    const forceEmpty = capReached || userWinCapped
    const rolledEmpty = forceEmpty || Math.random() * 100 < emptyRate

    const [allOnRows] = await dbMod.queryAsync(`SELECT * FROM lottery_prize WHERE status='on'`)
    const allOn = allOnRows || []
    let hit
    if (rolledEmpty) {
      hit = emptyPrizeFallback(allOn)
    } else {
      const candidates = await buildCandidatesAsync(userId, poolId, missStreak, snap)
      const filtered =
        snap.allowLotteryPhysical === false
          ? candidates.filter((p) => p.prize_type !== 'physical' && !isEmptyPrize(p))
          : candidates.filter((p) => !isEmptyPrize(p))
      const pool = (filtered.length ? filtered : candidates).filter((p) => !isEmptyPrize(p))
      hit = pool.length ? pickWeighted(pool) : emptyPrizeFallback(candidates)
    }
    if (isEmptyPrize(hit)) hit = emptyPrizeFallback([hit])

    let drawId = 0
    try {
      drawId = await dbMod.withTransactionAsync(async ({ query }) => {
        if (actionId) {
          await query(
            `INSERT INTO lottery_action_lock (user_id, action_id, created_at) VALUES (?,?,?)`,
            [userId, actionId, now()]
          )
        }
        if (!skipEnergy && energyCost > 0) {
          const t = now()
          const [spent] = await query(
            `UPDATE user_wallet SET energy=energy-?, updated_at=? WHERE user_id=? AND energy>=?`,
            [energyCost, t, userId, energyCost]
          )
          if (!Number((spent && (spent.affectedRows || spent.changes)) || 0)) {
            throw Object.assign(new Error('能量值不足'), { code: 'ENERGY_SHORT' })
          }
          const [afterRows] = await query(`SELECT energy FROM user_wallet WHERE user_id=? LIMIT 1`, [
            userId,
          ])
          const after = afterRows && afterRows[0] && afterRows[0].energy
          try {
            await query(
              `INSERT INTO wallet_ledger (user_id, delta, balance_after, direction, note, ref_type, ref_id, created_at)
               VALUES (?,?,?,?,?,?,?,?)`,
              [userId, -energyCost, Number(after) || 0, 'out', 'lottery', 'lottery', '', t]
            )
          } catch (_) {}
        }
        if (hit.stock > 0) {
          const [r] = await query(
            `UPDATE lottery_prize SET stock=stock-1, updated_at=? WHERE id=? AND stock>0`,
            [now(), hit.id]
          )
          if (!Number((r && (r.affectedRows || r.changes)) || 0)) {
            const [again] = await query(`SELECT * FROM lottery_prize WHERE status='on'`)
            hit = emptyPrizeFallback(again || [])
          }
        }
        if (hit.prize_type === 'coin' || hit.prize_type === 'energy' || hit.prize_type === 'points') {
          const grant = Number(hit.prize_value) || 0
          if (grant > 0) {
            const t = now()
            await query(`UPDATE user_wallet SET energy=energy+?, updated_at=? WHERE user_id=?`, [
              grant,
              t,
              userId,
            ])
            const [balRows] = await query(`SELECT energy FROM user_wallet WHERE user_id=? LIMIT 1`, [
              userId,
            ])
            try {
              await query(
                `INSERT INTO wallet_ledger (user_id, delta, balance_after, direction, note, ref_type, ref_id, created_at)
                 VALUES (?,?,?,?,?,?,?,?)`,
                [
                  userId,
                  grant,
                  Number((balRows && balRows[0] && balRows[0].energy) || 0),
                  'in',
                  `lottery:${hit.prize_type}`,
                  'lottery',
                  String(hit.id || ''),
                  t,
                ]
              )
            } catch (_) {}
          }
        }
        const [info] = await query(
          `INSERT INTO lottery_draw (user_id,prize_id,prize_name,cost_cent,created_at,action_id,prize_type,product_id)
           VALUES (?,?,?,?,?,?,?,?)`,
          [
            userId,
            hit.id,
            hit.name,
            0,
            now(),
            actionId || '',
            hit.prize_type,
            hit.product_id || '',
          ]
        )
        return Number((info && (info.insertId || info.lastInsertRowid)) || 0)
      })
    } catch (e) {
      if (e && e.code === 'ENERGY_SHORT') {
        return {
          ok: false,
          msg: `还差 ${energyCost} 能量值才能抽奖`,
        }
      }
      const dupAction =
        actionId &&
        e &&
        (e.code === 'ER_DUP_ENTRY' || /UNIQUE|Duplicate|PRIMARY/i.test(e.message || ''))
      if (!dupAction) throw e
      const prev = await findByActionIdAsync(userId, actionId)
      if (prev) return await drawResultFromRowAsync(prev, userId)
      return { ok: false, msg: '抽奖处理中，请勿重复点击' }
    }

    let claimToken = ''
    let expireAt = ''
    if (hit.prize_type === 'physical' && hit.product_id) {
      const token = makeClaimToken()
      const expire = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
      await dbMod.queryAsync(
        `INSERT INTO lottery_win_claim (claim_token, draw_id, user_id, prize_id, sku_id, status, expire_at, order_no, created_at)
         VALUES (?,?,?,?,?,'open',?,'',?)`,
        [token, drawId, userId, hit.id, hit.product_id, expire, now()]
      )
      claimToken = token
      expireAt = expire
    }
    if (hit.prize_type === 'seed') {
      try {
        require('./treeService').grantSeed(
          userId,
          hit.product_id || '',
          Math.max(1, Number(hit.prize_value) || 1)
        )
      } catch (e) {
        console.warn('[lottery] grantSeed', e && e.message)
      }
    }

    try {
      // 财务记账尽量异步；失败不影响开奖结果
      recordFinanceCost(hit, drawId, userId)
    } catch (_) {}

    if (!isEmptyPrize(hit)) _winUserCache.at = 0
    if (!isEmptyPrize(hit) && RARITY_RANK[prizeRarity(hit)] >= RARITY_RANK.R) {
      await setPityAsync(userId, poolId, 0)
    } else {
      await setPityAsync(userId, poolId, missStreak + 1)
    }

    let imageUrl = hit.image_url || ''
    if (!imageUrl && hit.product_id) {
      try {
        const [oRows] = await dbMod.queryAsync(
          `SELECT image_url FROM product WHERE id=? LIMIT 1`,
          [hit.product_id]
        )
        imageUrl = (oRows && oRows[0] && oRows[0].image_url) || ''
      } catch (_) {}
    }

    const wallet = await currency.getWalletAsync(userId)
    const usedAfter = todayDraws + 1
    const quotaAfter = require('./testAccountService').applySandboxQuota({
      dailyLimit: baseLimit,
      todayUsed: usedAfter,
      energyCost: baseEnergyCost,
      sandbox,
    })
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
        imageUrl,
      },
      wallet,
      pity: { missStreak: isEmptyPrize(hit) ? missStreak + 1 : 0 },
      dailyLimit: quotaAfter.dailyLimit,
      policyDailyLimit: baseLimit,
      todayUsed: usedAfter,
      todayLeft: quotaAfter.todayLeft,
      testMode: quotaAfter.testMode,
      bypassDrawLimit: quotaAfter.bypassDrawLimit,
      bypassEnergyCost: quotaAfter.bypassEnergyCost,
      energyCost: quotaAfter.energyCost,
    }
  })
}

module.exports = {
  ensureSchema,
  draw: (userId, opts) => require('./userLock').withUserLock('lottery_draw', userId, () => draw(userId, opts)),
  drawAsync,
  history,
  historyAsync,
  consumeClaim,
  markClaimUsed,
  reopenClaimByOrder,
  grantActivityPhysicalClaim,
  walletPayload,
  listPools,
  upsertPool,
  setUserRiskFlag,
  pityConfig,
  activePoolIds,
  todayWinUserCount,
  todayUserRealWinCount,
  todayDrawCount,
  lotteryQuotaForUser,
  isEmptyPrize,
  repairEmptyPrizes,
}

/**
 * 统一能量值口径：
 * - 唯一可消耗虚拟货币 = user_wallet.energy（对外文案「能量值」）
 * - energyPerYuan：多少能量值 = 1 元人民币（默认 1000）
 * - lotteryEnergyCost：每次抽奖消耗能量值（默认 50）
 * - 旧 points/coins/lottery_chance 一次性并入能量后清零
 */
const dbMod = require('../db')

const DEFAULT_ECONOMY = {
  energyPerYuan: 1000,
  lotteryEnergyCost: 50,
}

function db() {
  return dbMod.open()
}
function now() {
  return dbMod.nowIso()
}

function nPos(v, d) {
  const x = Number(v)
  return Number.isFinite(x) && x > 0 ? x : d
}

function nInt(v, d = 0) {
  const x = Number(v)
  return Number.isFinite(x) ? Math.max(0, Math.round(x)) : d
}

/** 从已发布 game.economy 读取（缺省用默认） */
function getEconomy() {
  let eco = { ...DEFAULT_ECONOMY }
  try {
    const pub = require('./configService').getPublished() || {}
    const g = (pub.game && pub.game.economy) || {}
    eco.energyPerYuan = nPos(g.energyPerYuan, DEFAULT_ECONOMY.energyPerYuan)
    eco.lotteryEnergyCost = Math.max(0, nInt(g.lotteryEnergyCost, DEFAULT_ECONOMY.lotteryEnergyCost))
  } catch (_) {}
  // ops.monetize 兼容：若配置了 energyPerYuan 优先
  try {
    const ops = require('./opsService').getOps()
    const m = (ops && ops.monetize) || {}
    if (m.energyPerYuan != null) eco.energyPerYuan = nPos(m.energyPerYuan, eco.energyPerYuan)
    if (m.lotteryEnergyCost != null) {
      eco.lotteryEnergyCost = Math.max(0, nInt(m.lotteryEnergyCost, eco.lotteryEnergyCost))
    }
  } catch (_) {}
  return eco
}

function energyToYuan(energy) {
  const { energyPerYuan } = getEconomy()
  return Math.round((nInt(energy) / energyPerYuan) * 10000) / 10000
}

function yuanToEnergy(yuan) {
  const { energyPerYuan } = getEconomy()
  return Math.round(Number(yuan || 0) * energyPerYuan)
}

function energyToCent(energy) {
  return Math.round(energyToYuan(energy) * 100)
}

/**
 * 奖励类型归一：旧 points/coins/lottery → energy
 * lottery 的 amount 若表示「次数」，按 lotteryEnergyCost 折算；若已是能量量则直接用 amount
 */
function normalizeRewardType(type, amount = 0) {
  const t = String(type || 'energy').toLowerCase()
  const a = nInt(amount)
  if (t === 'energy' || t === '能量' || t === '能量值') return { type: 'energy', amount: a }
  if (t === 'points' || t === 'point' || t === '积分') return { type: 'energy', amount: a }
  if (t === 'coins' || t === 'coin' || t === '金币') return { type: 'energy', amount: a }
  if (t === 'lottery' || t === '抽次' || t === '抽奖') {
    const cost = getEconomy().lotteryEnergyCost || DEFAULT_ECONOMY.lotteryEnergyCost
    // amount 表示次数；若为 0 当 1 次
    return { type: 'energy', amount: Math.max(1, a || 1) * cost }
  }
  // gift / seed 等非货币保留原 type
  return { type: t, amount: a }
}

/** 客户端钱包视图：只暴露能量值；points 兼容字段 = energy */
function walletPayload(row) {
  if (!row) return null
  const energy = nInt(row.energy)
  return {
    energy,
    points: energy, // deprecated alias
    coins: 0,
    lotteryChance: 0,
    lottery_chance: 0,
    energyYuan: energyToYuan(energy),
    updatedAt: row.updated_at || '',
  }
}

/**
 * 一次性合并旧积分/金币/抽次到能量（按用户）。
 * 必须写流水：否则「当前能量」与「累计获得」会对不上（建号曾默认送 1 抽次）。
 */
function ensureMerged(userId) {
  const d = db()
  const w = d.prepare('SELECT * FROM user_wallet WHERE user_id=?').get(userId)
  if (!w) return null
  const points = nInt(w.points)
  const coins = nInt(w.coins)
  const chance = nInt(w.lottery_chance)
  if (points === 0 && coins === 0 && chance === 0) return w
  const cost = getEconomy().lotteryEnergyCost || DEFAULT_ECONOMY.lotteryEnergyCost
  const add = points + coins + chance * cost
  d.prepare(
    `UPDATE user_wallet SET energy=energy+?, points=0, coins=0, lottery_chance=0, updated_at=? WHERE user_id=?`
  ).run(add, now(), userId)
  const after = d.prepare('SELECT * FROM user_wallet WHERE user_id=?').get(userId)
  if (add > 0) {
    const parts = []
    if (points) parts.push(`积分${points}`)
    if (coins) parts.push(`金币${coins}`)
    if (chance) parts.push(`抽次${chance}×${cost}`)
    writeLedger(userId, add, after && after.energy, `旧资产折算(${parts.join('+') || 'merge'})`, {
      refType: 'wallet_merge',
      refId: String(userId),
    })
  }
  return d.prepare('SELECT * FROM user_wallet WHERE user_id=?').get(userId)
}

/**
 * 补齐「钱包余额 − 流水净额」的历史漏记账（如旧版 ensureMerged 未写流水）。
 * 只补正差额，不臆造扣减。
 */
function reconcileOrphanEnergy(userId) {
  try {
    ensureWalletLedger()
    const d = db()
    const w = d.prepare('SELECT energy FROM user_wallet WHERE user_id=?').get(userId)
    if (!w) return 0
    const bal = nInt(w.energy)
    const row = d
      .prepare(
        `SELECT COALESCE(SUM(delta),0) AS net FROM wallet_ledger WHERE user_id=?`
      )
      .get(userId)
    const net = Number(row && row.net) || 0
    const gap = bal - net
    if (gap <= 0) return 0
    // 避免重复补记：已有 reconcile 流水则跳过（按差额指纹）
    const existed = d
      .prepare(
        `SELECT 1 AS ok FROM wallet_ledger WHERE user_id=? AND ref_type='reconcile' AND delta=? LIMIT 1`
      )
      .get(userId, gap)
    if (existed) return 0
    writeLedger(userId, gap, bal, '账本补记（历史漏记/旧资产折算）', {
      refType: 'reconcile',
      refId: String(userId),
    })
    return gap
  } catch (e) {
    console.warn('[currency] reconcileOrphanEnergy', e && e.message)
    return 0
  }
}

function walletEnergy(userId) {
  const w = ensureMerged(userId)
  return w ? nInt(w.energy) : 0
}

function getWallet(userId) {
  const w = ensureMerged(userId)
  return walletPayload(w)
}

let ledgerReady = false

function ensureWalletLedger() {
  if (ledgerReady) return
  if (dbMod.DIALECT === 'mysql') {
    ledgerReady = true
    return
  }
  const d = db()
  if (dbMod.DIALECT === 'mysql') {
    d.prepare(
      `CREATE TABLE IF NOT EXISTS wallet_ledger (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        delta INT NOT NULL,
        balance_after INT NOT NULL DEFAULT 0,
        direction VARCHAR(16) NOT NULL DEFAULT 'in',
        note VARCHAR(191) NOT NULL DEFAULT '',
        ref_type VARCHAR(32) NOT NULL DEFAULT '',
        ref_id VARCHAR(64) NOT NULL DEFAULT '',
        created_at VARCHAR(40) NOT NULL,
        KEY idx_wl_user (user_id),
        KEY idx_wl_created (created_at)
      )`
    ).run()
  } else {
    d.exec(`
      CREATE TABLE IF NOT EXISTS wallet_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        delta INTEGER NOT NULL,
        balance_after INTEGER NOT NULL DEFAULT 0,
        direction TEXT NOT NULL DEFAULT 'in',
        note TEXT NOT NULL DEFAULT '',
        ref_type TEXT NOT NULL DEFAULT '',
        ref_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wl_user ON wallet_ledger(user_id);
      CREATE INDEX IF NOT EXISTS idx_wl_created ON wallet_ledger(created_at);
    `)
  }
  ledgerReady = true
}

function writeLedger(userId, delta, balanceAfter, note = '', ref = {}) {
  ensureWalletLedger()
  const dlt = Math.round(Number(delta) || 0)
  if (!dlt) return
  db()
    .prepare(
      `INSERT INTO wallet_ledger (user_id, delta, balance_after, direction, note, ref_type, ref_id, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(
      userId,
      dlt,
      nInt(balanceAfter),
      dlt >= 0 ? 'in' : 'out',
      String(note || '').slice(0, 191),
      String((ref && ref.refType) || '').slice(0, 32),
      String((ref && ref.refId) || '').slice(0, 64),
      now()
    )
}

function listWalletLedger(userId, { direction = '', page = 1, pageSize = 30 } = {}) {
  ensureWalletLedger()
  // 运营台打开流水时补齐历史漏记，使「累计获得」与钱包余额对齐
  reconcileOrphanEnergy(userId)
  const d = db()
  const where = ['user_id=?']
  const args = [userId]
  if (direction === 'in' || direction === 'out') {
    where.push('direction=?')
    args.push(direction)
  }
  const w = `WHERE ${where.join(' AND ')}`
  const total = d.prepare(`SELECT COUNT(*) AS n FROM wallet_ledger ${w}`).get(...args).n
  const offset = (Math.max(1, page) - 1) * pageSize
  const list = d
    .prepare(`SELECT * FROM wallet_ledger ${w} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, pageSize, offset)
  const sumIn = d
    .prepare(`SELECT COALESCE(SUM(delta),0) AS s FROM wallet_ledger WHERE user_id=? AND delta>0`)
    .get(userId).s
  const sumOut = d
    .prepare(`SELECT COALESCE(SUM(-delta),0) AS s FROM wallet_ledger WHERE user_id=? AND delta<0`)
    .get(userId).s
  return {
    total,
    page: Number(page),
    pageSize,
    sumIn: Number(sumIn || 0),
    sumOut: Number(sumOut || 0),
    list,
  }
}

function grantEnergy(userId, amount, { note = '', refType = '', refId = '' } = {}) {
  const delta = nInt(amount)
  if (delta <= 0) return getWallet(userId)
  ensureMerged(userId)
  const d = db()
  d.prepare(`UPDATE user_wallet SET energy=energy+?, updated_at=? WHERE user_id=?`).run(
    delta,
    now(),
    userId
  )
  const w = d.prepare('SELECT energy FROM user_wallet WHERE user_id=?').get(userId)
  writeLedger(userId, delta, w && w.energy, note, { refType, refId })
  return getWallet(userId)
}

async function getWalletAsync(userId) {
  const [rows] = await dbMod.queryAsync(`SELECT * FROM user_wallet WHERE user_id=? LIMIT 1`, [
    userId,
  ])
  const w = rows && rows[0]
  if (!w) return null
  return walletPayload(w)
}

async function grantEnergyAsync(userId, amount, { note = '', refType = '', refId = '' } = {}) {
  const delta = nInt(amount)
  if (delta <= 0) return getWalletAsync(userId)
  const t = now()
  await dbMod.queryAsync(`UPDATE user_wallet SET energy=energy+?, updated_at=? WHERE user_id=?`, [
    delta,
    t,
    userId,
  ])
  const [rows] = await dbMod.queryAsync(`SELECT energy FROM user_wallet WHERE user_id=? LIMIT 1`, [
    userId,
  ])
  const bal = rows && rows[0] && rows[0].energy
  try {
    await dbMod.queryAsync(
      `INSERT INTO wallet_ledger (user_id, delta, balance_after, direction, note, ref_type, ref_id, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        userId,
        delta,
        nInt(bal),
        'in',
        String(note || '').slice(0, 191),
        String(refType || '').slice(0, 32),
        String(refId || '').slice(0, 64),
        t,
      ]
    )
  } catch (_) {}
  return getWalletAsync(userId)
}

async function spendEnergyAsync(userId, amount, { note = '', refType = '', refId = '' } = {}) {
  const need = nInt(amount)
  if (need <= 0) return { ok: true, wallet: await getWalletAsync(userId), spent: 0 }
  const t = now()
  const [result] = await dbMod.queryAsync(
    `UPDATE user_wallet SET energy=energy-?, updated_at=? WHERE user_id=? AND energy>=?`,
    [need, t, userId, need]
  )
  const changed = Number((result && (result.affectedRows || result.changes)) || 0)
  if (!changed) {
    const [rows] = await dbMod.queryAsync(`SELECT energy FROM user_wallet WHERE user_id=? LIMIT 1`, [
      userId,
    ])
    if (!rows || !rows[0]) return { ok: false, msg: '钱包不存在' }
    const bal = nInt(rows[0].energy)
    const gap = Math.max(0, need - bal)
    return {
      ok: false,
      msg:
        bal <= 0
          ? `还差 ${need} 能量值，去做签到或任务攒一攒吧`
          : `还差 ${gap} 能量值（当前 ${bal} / 需 ${need}）`,
    }
  }
  const [afterRows] = await dbMod.queryAsync(
    `SELECT energy FROM user_wallet WHERE user_id=? LIMIT 1`,
    [userId]
  )
  const after = afterRows && afterRows[0] && afterRows[0].energy
  try {
    await dbMod.queryAsync(
      `INSERT INTO wallet_ledger (user_id, delta, balance_after, direction, note, ref_type, ref_id, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        userId,
        -need,
        nInt(after),
        'out',
        String(note || '').slice(0, 191),
        String(refType || '').slice(0, 32),
        String(refId || '').slice(0, 64),
        t,
      ]
    )
  } catch (_) {}
  return { ok: true, wallet: await getWalletAsync(userId), spent: need, note }
}

/**
 * 扣能量；不足返回 { ok:false }
 */
function spendEnergy(userId, amount, { note = '', refType = '', refId = '' } = {}) {
  const need = nInt(amount)
  ensureMerged(userId)
  if (need <= 0) return { ok: true, wallet: getWallet(userId), spent: 0 }
  const d = db()
  // 单语句原子扣减，避免先读后写并发超扣
  const info = d
    .prepare(
      `UPDATE user_wallet SET energy=energy-?, updated_at=? WHERE user_id=? AND energy>=?`
    )
    .run(need, now(), userId, need)
  if (!info || !info.changes) {
    const w = d.prepare('SELECT energy FROM user_wallet WHERE user_id=?').get(userId)
    if (!w) return { ok: false, msg: '钱包不存在' }
    const bal = nInt(w.energy)
    const gap = Math.max(0, need - bal)
    return {
      ok: false,
      msg:
        bal <= 0
          ? `还差 ${need} 能量值，去做签到或任务攒一攒吧`
          : `还差 ${gap} 能量值（当前 ${bal} / 需 ${need}）`,
    }
  }
  const after = d.prepare('SELECT energy FROM user_wallet WHERE user_id=?').get(userId)
  writeLedger(userId, -need, after && after.energy, note, { refType, refId })
  return { ok: true, wallet: getWallet(userId), spent: need, note }
}

/**
 * 订单取消/超时/退款时回退能量值；按 order_no 幂等，避免重复加回。
 * @param {{ user_id:number, pay_points?:number, order_no?:string, id?:number|string }} order
 * @param {string} note
 */
function restoreOrderEnergy(order, note = 'order_energy_refund') {
  if (!order) return { ok: true, skipped: true }
  const pts = nInt(order.pay_points)
  if (pts <= 0) return { ok: true, skipped: true }
  const userId = order.user_id
  const orderNo = String(order.order_no || order.id || '').trim()
  if (!userId || !orderNo) return { ok: false, msg: '订单信息不完整' }
  ensureWalletLedger()
  const hit = db()
    .prepare(
      `SELECT id FROM wallet_ledger
       WHERE user_id=? AND ref_type='order_energy_refund' AND ref_id=? AND delta>0
       LIMIT 1`
    )
    .get(userId, orderNo)
  if (hit) return { ok: true, duplicate: true }
  grantEnergy(userId, pts, {
    note: String(note || 'order_energy_refund').slice(0, 191),
    refType: 'order_energy_refund',
    refId: orderNo,
  })
  return { ok: true, restored: pts }
}

/** 批量迁移全表（运维/启动可选）；走 ensureMerged 以写入流水 */
function mergeAllWallets() {
  const d = db()
  const rows = d
    .prepare(
      `SELECT user_id FROM user_wallet
       WHERE points>0 OR coins>0 OR lottery_chance>0`
    )
    .all()
  rows.forEach((r) => ensureMerged(r.user_id))
  return { ok: true, merged: rows.length }
}

function clientEconomyPayload() {
  const eco = getEconomy()
  return {
    energyPerYuan: eco.energyPerYuan,
    lotteryEnergyCost: eco.lotteryEnergyCost,
    label: '能量值',
    // 对客口径：营销积分；内部折算仅供运营成本估算，勿展示为可兑现汇率
    hint: '能量值=营销积分，不可提现/转赠/兑红包',
    energyPerYuan: eco.energyPerYuan,
  }
}

module.exports = {
  DEFAULT_ECONOMY,
  getEconomy,
  energyToYuan,
  yuanToEnergy,
  energyToCent,
  normalizeRewardType,
  walletPayload,
  ensureMerged,
  walletEnergy,
  getWallet,
  getWalletAsync,
  grantEnergy,
  grantEnergyAsync,
  restoreOrderEnergy,
  spendEnergy,
  spendEnergyAsync,
  mergeAllWallets,
  reconcileOrphanEnergy,
  clientEconomyPayload,
  ensureWalletLedger,
  listWalletLedger,
  writeLedger,
}

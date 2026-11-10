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
 * 一次性合并旧积分/金币/抽次到能量（按用户）
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
  return d.prepare('SELECT * FROM user_wallet WHERE user_id=?').get(userId)
}

function walletEnergy(userId) {
  const w = ensureMerged(userId)
  return w ? nInt(w.energy) : 0
}

function getWallet(userId) {
  const w = ensureMerged(userId)
  return walletPayload(w)
}

function grantEnergy(userId, amount, { note = '' } = {}) {
  const delta = nInt(amount)
  if (delta <= 0) return getWallet(userId)
  ensureMerged(userId)
  db()
    .prepare(`UPDATE user_wallet SET energy=energy+?, updated_at=? WHERE user_id=?`)
    .run(delta, now(), userId)
  return getWallet(userId)
}

/**
 * 扣能量；不足返回 { ok:false }
 */
function spendEnergy(userId, amount, { note = '' } = {}) {
  const need = nInt(amount)
  ensureMerged(userId)
  if (need <= 0) return { ok: true, wallet: getWallet(userId), spent: 0 }
  const d = db()
  const w = d.prepare('SELECT energy FROM user_wallet WHERE user_id=?').get(userId)
  if (!w) return { ok: false, msg: '钱包不存在' }
  if (nInt(w.energy) < need) return { ok: false, msg: '能量值不足' }
  d.prepare(`UPDATE user_wallet SET energy=energy-?, updated_at=? WHERE user_id=?`).run(
    need,
    now(),
    userId
  )
  return { ok: true, wallet: getWallet(userId), spent: need, note }
}

/** 批量迁移全表（运维/启动可选） */
function mergeAllWallets() {
  const d = db()
  const cost = getEconomy().lotteryEnergyCost || DEFAULT_ECONOMY.lotteryEnergyCost
  const rows = d
    .prepare(
      `SELECT user_id, energy, points, coins, lottery_chance FROM user_wallet
       WHERE points>0 OR coins>0 OR lottery_chance>0`
    )
    .all()
  const upd = d.prepare(
    `UPDATE user_wallet SET energy=?, points=0, coins=0, lottery_chance=0, updated_at=? WHERE user_id=?`
  )
  const t = now()
  const tx = d.transaction(() => {
    rows.forEach((r) => {
      const energy =
        nInt(r.energy) + nInt(r.points) + nInt(r.coins) + nInt(r.lottery_chance) * cost
      upd.run(energy, t, r.user_id)
    })
  })
  tx()
  return { ok: true, merged: rows.length }
}

function clientEconomyPayload() {
  const eco = getEconomy()
  return {
    energyPerYuan: eco.energyPerYuan,
    lotteryEnergyCost: eco.lotteryEnergyCost,
    label: '能量值',
    hint: `${eco.energyPerYuan}能量值 = ¥1`,
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
  grantEnergy,
  spendEnergy,
  mergeAllWallets,
  clientEconomyPayload,
}

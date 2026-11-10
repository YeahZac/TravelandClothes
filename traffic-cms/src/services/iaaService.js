/**
 * P2：IAA 激励视频发奖（补签 / 补抽次 / 任务能量）
 * 开关：ops.monetize.iaaEnabled；广告位 ID 在 game.iaa.adUnitId
 */
const dbMod = require('../db')
const configService = require('./configService')
const opsService = require('./opsService')
const stepsService = require('./stepsService')

function dayKey() {
  return stepsService.dayKey()
}

function ensureTables() {
  const d = dbMod.open()
  d.exec(`
    CREATE TABLE IF NOT EXISTS iaa_reward (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      action_id TEXT NOT NULL UNIQUE,
      reward_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_checkin (
      user_id INTEGER NOT NULL,
      day_key TEXT NOT NULL,
      streak INTEGER NOT NULL DEFAULT 1,
      reward_json TEXT NOT NULL DEFAULT '{}',
      source TEXT NOT NULL DEFAULT 'checkin',
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, day_key)
    );
  `)
}

function iaaConfig() {
  const pub = configService.getPublished() || {}
  const ops = opsService.getOps ? opsService.getOps() : (pub.ops || {})
  const monetize = (ops && ops.monetize) || (pub.ops && pub.ops.monetize) || {}
  const g = (pub.game && pub.game.iaa) || {}
  return {
    enabled: monetize.iaaEnabled === true || g.enabled === true,
    adUnitId: g.adUnitId || '',
    energy: Number(g.energy) > 0 ? Number(g.energy) : 30,
    lotteryChance: Number(g.lotteryChance) > 0 ? Number(g.lotteryChance) : 1,
    makeupEnergy: Number(g.makeupEnergy) > 0 ? Number(g.makeupEnergy) : 20,
    dailyLimit: {
      energy: Number(g.dailyEnergyLimit) > 0 ? Number(g.dailyEnergyLimit) : 1,
      lottery: Number(g.dailyLotteryLimit) > 0 ? Number(g.dailyLotteryLimit) : 2,
      makeup_checkin: Number(g.dailyMakeupLimit) > 0 ? Number(g.dailyMakeupLimit) : 1,
    },
  }
}

function countToday(userId, kind, dk = dayKey()) {
  ensureTables()
  return dbMod
    .open()
    .prepare(`SELECT COUNT(*) AS n FROM iaa_reward WHERE user_id=? AND day_key=? AND kind=?`)
    .get(userId, dk, kind).n
}

function status(userId) {
  ensureTables()
  const cfg = iaaConfig()
  const dk = dayKey()
  const used = {
    energy: countToday(userId, 'energy', dk),
    lottery: countToday(userId, 'lottery', dk),
    makeup_checkin: countToday(userId, 'makeup_checkin', dk),
  }
  return {
    enabled: cfg.enabled,
    adUnitId: cfg.adUnitId,
    rewards: {
      energy: cfg.energy,
      lotteryChance: cfg.lotteryChance,
      makeupEnergy: cfg.makeupEnergy,
    },
    used,
    left: {
      energy: Math.max(0, cfg.dailyLimit.energy - used.energy),
      lottery: Math.max(0, cfg.dailyLimit.lottery - used.lottery),
      makeup_checkin: Math.max(0, cfg.dailyLimit.makeup_checkin - used.makeup_checkin),
    },
    checkedIn: stepsService.hasCheckedInToday(userId, dk),
  }
}

function claim(userId, { kind = 'energy', actionId = '' } = {}) {
  ensureTables()
  const cfg = iaaConfig()
  if (!cfg.enabled) return { ok: false, msg: '激励视频暂未开启' }
  const allowed = ['energy', 'lottery', 'makeup_checkin']
  if (!allowed.includes(kind)) return { ok: false, msg: '未知激励类型' }
  if (!actionId) return { ok: false, msg: '缺少 actionId' }

  const d = dbMod.open()
  const dk = dayKey()
  const dup = d.prepare('SELECT id, reward_json FROM iaa_reward WHERE action_id=?').get(actionId)
  if (dup) {
    return { ok: true, idempotent: true, reward: JSON.parse(dup.reward_json || '{}'), ...status(userId) }
  }

  if (countToday(userId, kind, dk) >= cfg.dailyLimit[kind]) {
    return { ok: false, msg: '今日该激励次数已用完' }
  }

  let reward = {}
  const now = dbMod.nowIso()

  const currency = require('./currencyService')
  if (kind === 'energy') {
    reward = { energy: cfg.energy }
  } else if (kind === 'lottery') {
    // 原「送抽次」改为按抽奖耗能折算能量值
    const cost = currency.getEconomy().lotteryEnergyCost
    reward = { energy: Math.max(1, cfg.lotteryChance || 1) * cost, fromLotteryChance: cfg.lotteryChance }
  } else if (kind === 'makeup_checkin') {
    if (stepsService.hasCheckedInToday(userId, dk)) {
      return { ok: false, msg: '今天已经签过啦' }
    }
    reward = { energy: cfg.makeupEnergy, makeup: true }
  }

  const tx = d.transaction(() => {
    if (reward.energy) {
      currency.grantEnergy(userId, reward.energy, { note: `iaa:${kind}` })
    }
    if (kind === 'makeup_checkin') {
      const yesterday = (() => {
        const t = new Date()
        t.setDate(t.getDate() - 1)
        return stepsService.dayKey(t)
      })()
      const yRow = d
        .prepare(`SELECT streak FROM user_checkin WHERE user_id=? AND day_key=?`)
        .get(userId, yesterday)
      const nextStreak = yRow ? (yRow.streak || 0) + 1 : 1
      d.prepare(
        `INSERT OR REPLACE INTO user_checkin (user_id, day_key, streak, reward_json, source, created_at)
         VALUES (?,?,?,?, 'iaa_makeup', ?)`
      ).run(userId, dk, nextStreak, JSON.stringify(reward), now)
      try {
        d.prepare(
          `INSERT OR IGNORE INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
           VALUES (?,?,?,'done',?,?)`
        ).run(userId, 'checkin', dk, JSON.stringify(reward), now)
      } catch (e) {}
    }
    if (kind === 'energy') {
      try {
        d.prepare(
          `INSERT OR IGNORE INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
           VALUES (?,?,?,'done',?,?)`
        ).run(userId, 'ad', dk, JSON.stringify(reward), now)
      } catch (e) {}
    }
    d.prepare(
      `INSERT INTO iaa_reward (user_id, day_key, kind, action_id, reward_json, created_at)
       VALUES (?,?,?,?,?,?)`
    ).run(userId, dk, kind, actionId, JSON.stringify(reward), now)
  })
  tx()

  const msg =
    kind === 'lottery'
      ? `看完广告 · 能量值 +${reward.energy}`
      : kind === 'makeup_checkin'
        ? `补签成功 · 能量值 +${reward.energy}`
        : `看完广告 · 能量值 +${reward.energy}`

  return { ok: true, msg, reward, wallet: currency.getWallet(userId), ...status(userId) }
}

module.exports = {
  status,
  claim,
  iaaConfig,
  ensureTables,
}

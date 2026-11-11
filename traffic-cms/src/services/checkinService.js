/**
 * 签到服务端账本（读 game.rewards.checkin）
 * 规则：按「连续签到天数」取第 N 天奖励；中途漏签则 streak 归 1，从第 1 天重计。
 */
const dbMod = require('../db')
const configService = require('./configService')

function dayKey(d = new Date()) {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

function yesterdayKey(from = new Date()) {
  const t = new Date(from)
  t.setDate(t.getDate() - 1)
  return dayKey(t)
}

function ensureTables() {
  dbMod.open().exec(`
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

function defaultCheckinRewards() {
  return [
    { day: 1, type: 'energy', value: 20, label: '+20' },
    { day: 2, type: 'energy', value: 30, label: '+30' },
    { day: 3, type: 'energy', value: 40, label: '+40' },
    { day: 4, type: 'energy', value: 50, label: '+50' },
    { day: 5, type: 'energy', value: 60, label: '+60' },
    { day: 6, type: 'energy', value: 80, label: '+80' },
    { day: 7, type: 'energy', value: 100, label: '+100' },
  ]
}

function rewardsConfig() {
  const g = (configService.getPublished() || {}).game || {}
  const list = (g.rewards && Array.isArray(g.rewards.checkin) && g.rewards.checkin.length
    ? g.rewards.checkin
    : defaultCheckinRewards()
  )
    .map((r, i) => ({
      day: Number(r.day) || i + 1,
      type: r.type || 'energy',
      value: Number(r.value != null ? r.value : r.amount) || 0,
      amount: Number(r.amount != null ? r.amount : r.value) || 0,
      label: r.label || '',
      giftId: r.giftId || '',
      iconUrl: r.iconUrl || '',
    }))
    .sort((a, b) => a.day - b.day)
  return list
}

/** 连续第 streak 天对应的奖励档（满周期后循环） */
function dayIndexFromStreak(streak, cycleLen) {
  const n = Math.max(1, cycleLen || 1)
  const s = Math.max(1, Number(streak) || 1)
  return ((s - 1) % n) + 1
}

function nextStreakIfCheckinToday(userId, d) {
  const yRow = d
    .prepare(`SELECT streak FROM user_checkin WHERE user_id=? AND day_key=?`)
    .get(userId, yesterdayKey())
  return yRow ? (Number(yRow.streak) || 0) + 1 : 1
}

function status(userId) {
  ensureTables()
  const d = dbMod.open()
  const dk = dayKey()
  const today = d.prepare(`SELECT * FROM user_checkin WHERE user_id=? AND day_key=?`).get(userId, dk)
  const last = d
    .prepare(`SELECT * FROM user_checkin WHERE user_id=? ORDER BY day_key DESC LIMIT 1`)
    .get(userId)
  const rewards = rewardsConfig()
  const yKey = yesterdayKey()
  let streak = 0
  let dayIndex = 1
  if (today) {
    streak = Number(today.streak) || 1
    dayIndex = dayIndexFromStreak(streak, rewards.length)
  } else {
    // 未签：若昨天签过，展示当前连签；否则断签归零。今天将拿到的档位按「若今日签到」预览
    if (last && last.day_key === yKey) {
      streak = Number(last.streak) || 0
      dayIndex = dayIndexFromStreak(streak + 1, rewards.length)
    } else {
      streak = 0
      dayIndex = 1
    }
  }
  return {
    todayDone: !!today,
    streak,
    dayIndex,
    dayKey: dk,
    cycleDays: rewards.length,
    rewards,
  }
}

function checkin(userId, { source = 'checkin' } = {}) {
  ensureTables()
  const d = dbMod.open()
  const dk = dayKey()
  if (d.prepare(`SELECT 1 AS ok FROM user_checkin WHERE user_id=? AND day_key=?`).get(userId, dk)) {
    return { ok: false, msg: '今天已经签过啦', ...status(userId) }
  }
  const rewards = rewardsConfig()
  const streak = nextStreakIfCheckinToday(userId, d)
  const dayIndex = dayIndexFromStreak(streak, rewards.length)
  const rewardCfg = rewards.find((r) => r.day === dayIndex) || rewards[dayIndex - 1] || rewards[0]
  const now = dbMod.nowIso()
  const currency = require('./currencyService')
  const amount = Number(rewardCfg.amount) || Number(rewardCfg.value) || 0
  const norm = currency.normalizeRewardType(rewardCfg.type || 'energy', amount)
  const reward = {
    type: norm.type === 'energy' ? 'energy' : rewardCfg.type || 'energy',
    value: norm.type === 'energy' ? norm.amount : amount,
    amount: norm.type === 'energy' ? norm.amount : amount,
    label:
      rewardCfg.label ||
      (norm.type === 'energy' ? `+${norm.amount}` : `${rewardCfg.type}+${amount}`),
    giftId: rewardCfg.giftId || '',
    dayIndex,
  }

  const tx = d.transaction(() => {
    d.prepare(
      `INSERT INTO user_checkin (user_id, day_key, streak, reward_json, source, created_at)
       VALUES (?,?,?,?,?,?)`
    ).run(userId, dk, streak, JSON.stringify(reward), source, now)
    if (norm.type === 'energy' && norm.amount > 0) {
      currency.grantEnergy(userId, norm.amount, { note: 'checkin' })
    }
    // gift 等实物档位仅记账，履约走兑礼通道
    d.prepare(
      `INSERT OR IGNORE INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
       VALUES (?,?,?,'done',?,?)`
    ).run(userId, 'checkin', dk, JSON.stringify(reward), now)
  })
  tx()

  try {
    require('./inviteService').onInviteeCheckin(userId)
  } catch (e) {}

  let treeBonus = 0
  try {
    treeBonus = require('./treeService').applyCheckinBonus(userId) || 0
  } catch (e) {}

  const wallet = currency.getWallet(userId)
  return {
    ok: true,
    msg: treeBonus
      ? `签到成功 · ${reward.label} · 树营养 +${treeBonus}`
      : `签到成功 · ${reward.label}`,
    dayIndex,
    streak,
    reward,
    treeBonus,
    wallet,
    ...status(userId),
  }
}

module.exports = {
  dayKey,
  yesterdayKey,
  ensureTables,
  status,
  checkin,
  rewardsConfig,
  dayIndexFromStreak,
  nextStreakIfCheckinToday,
}

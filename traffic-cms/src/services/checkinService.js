/**
 * P0：签到服务端账本（读 game.rewards.checkin）
 */
const dbMod = require('../db')
const configService = require('./configService')

function dayKey(d = new Date()) {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
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
    { day: 1, type: 'energy', value: 20, label: '能量+20' },
    { day: 2, type: 'energy', value: 25, label: '能量+25' },
    { day: 3, type: 'lottery', value: 1, label: '抽次+1' },
    { day: 4, type: 'energy', value: 30, label: '能量+30' },
    { day: 5, type: 'coins', value: 50, label: '金币+50' },
    { day: 6, type: 'energy', value: 40, label: '能量+40' },
    { day: 7, type: 'lottery', value: 2, label: '抽次+2' },
  ]
}

function rewardsConfig() {
  const g = (configService.getPublished() || {}).game || {}
  const list = (g.rewards && Array.isArray(g.rewards.checkin) && g.rewards.checkin.length
    ? g.rewards.checkin
    : defaultCheckinRewards()
  ).map((r, i) => ({
    day: Number(r.day) || i + 1,
    type: r.type || 'energy',
    value: Number(r.value) || Number(r.amount) || 0,
    label: r.label || '',
    giftId: r.giftId || '',
  }))
  return list
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
  const count = d.prepare(`SELECT COUNT(*) AS n FROM user_checkin WHERE user_id=?`).get(userId).n
  const dayIndex = today
    ? ((count - 1) % rewards.length) + 1
    : (count % rewards.length) + 1
  return {
    todayDone: !!today,
    streak: today ? today.streak : last && last.day_key === (() => {
      const t = new Date()
      t.setDate(t.getDate() - 1)
      return dayKey(t)
    })()
      ? last.streak
      : 0,
    dayIndex,
    dayKey: dk,
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
  const count = d.prepare(`SELECT COUNT(*) AS n FROM user_checkin WHERE user_id=?`).get(userId).n
  const dayIndex = (count % Math.max(1, rewards.length)) + 1
  const rewardCfg = rewards[dayIndex - 1] || rewards[0]
  const yesterday = (() => {
    const t = new Date()
    t.setDate(t.getDate() - 1)
    return dayKey(t)
  })()
  const yRow = d.prepare(`SELECT streak FROM user_checkin WHERE user_id=? AND day_key=?`).get(userId, yesterday)
  const streak = yRow ? (yRow.streak || 0) + 1 : 1
  const now = dbMod.nowIso()
  const reward = {
    type: rewardCfg.type,
    value: rewardCfg.value,
    label: rewardCfg.label || `${rewardCfg.type}+${rewardCfg.value}`,
    giftId: rewardCfg.giftId || '',
  }

  const tx = d.transaction(() => {
    d.prepare(
      `INSERT INTO user_checkin (user_id, day_key, streak, reward_json, source, created_at)
       VALUES (?,?,?,?,?,?)`
    ).run(userId, dk, streak, JSON.stringify(reward), source, now)
    if (reward.type === 'energy') {
      d.prepare(`UPDATE user_wallet SET energy=energy+?, updated_at=? WHERE user_id=?`).run(reward.value, now, userId)
    } else if (reward.type === 'lottery') {
      d.prepare(`UPDATE user_wallet SET lottery_chance=lottery_chance+?, updated_at=? WHERE user_id=?`).run(
        reward.value,
        now,
        userId
      )
    } else if (reward.type === 'coins') {
      d.prepare(`UPDATE user_wallet SET coins=coins+?, updated_at=? WHERE user_id=?`).run(reward.value, now, userId)
    } else if (reward.type === 'points') {
      d.prepare(`UPDATE user_wallet SET points=points+?, updated_at=? WHERE user_id=?`).run(reward.value, now, userId)
    }
    d.prepare(
      `INSERT OR IGNORE INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
       VALUES (?,?,?,'done',?,?)`
    ).run(userId, 'checkin', dk, JSON.stringify(reward), now)
  })
  tx()

  // P1：首签触发邀请人进度
  try {
    require('./inviteService').onInviteeCheckin(userId)
  } catch (e) {}

  const wallet = d.prepare('SELECT energy, points, coins, lottery_chance FROM user_wallet WHERE user_id=?').get(userId)
  return {
    ok: true,
    msg: `签到成功 · ${reward.label}`,
    dayIndex,
    streak,
    reward,
    wallet: {
      energy: wallet.energy,
      points: wallet.points,
      coins: wallet.coins,
      lotteryChance: wallet.lottery_chance,
    },
    ...status(userId),
  }
}

module.exports = {
  dayKey,
  ensureTables,
  status,
  checkin,
  rewardsConfig,
}

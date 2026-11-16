/**
 * 签到服务端账本（读 game.rewards.checkin）
 * 规则：按「连续签到天数」取第 N 天奖励；中途漏签则 streak 归 1，从第 1 天重计。
 */
const dbMod = require('../db')
const configService = require('./configService')
const { dayKey, shiftDay } = require('./stepsService')

let tablesReady = false

function yesterdayKey() {
  return shiftDay(dayKey(), -1)
}

function ensureTables() {
  if (tablesReady) return
  if (dbMod.DIALECT === 'mysql') {
    tablesReady = true
    return
  }
  const d = dbMod.open()
  if (dbMod.DIALECT === 'mysql') {
    // day_key 必须是 VARCHAR：MySQL 禁止 TEXT 直接做 PRIMARY KEY
    d.prepare(
      `CREATE TABLE IF NOT EXISTS user_checkin (
        user_id INT NOT NULL,
        day_key VARCHAR(16) NOT NULL,
        streak INT NOT NULL DEFAULT 1,
        reward_json TEXT,
        source VARCHAR(32) NOT NULL DEFAULT 'checkin',
        created_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (user_id, day_key),
        KEY idx_checkin_day (day_key)
      )`
    ).run()
  } else {
    d.exec(`
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
  tablesReady = true
}

function defaultCheckinRewards() {
  return [
    { day: 1, type: 'energy', value: 20, label: '能量+20' },
    { day: 2, type: 'energy', value: 30, label: '能量+30' },
    { day: 3, type: 'energy', value: 40, label: '能量+40' },
    { day: 4, type: 'energy', value: 50, label: '能量+50' },
    { day: 5, type: 'energy', value: 60, label: '能量+60' },
    { day: 6, type: 'energy', value: 80, label: '能量+80' },
    { day: 7, type: 'energy', value: 100, label: '能量+100' },
  ]
}

function autoRewardLabel(type, amount, giftId) {
  if (type === 'gift') {
    const n = Number(amount) > 0 ? Number(amount) : 1
    if (giftId) {
      try {
        const o = require('./offerService').resolveOffer(giftId)
        const name = o && o.found && o.name ? String(o.name).trim() : ''
        if (name) return name.length > 8 ? name.slice(0, 8) : name
      } catch (_) {}
    }
    return `礼物+${n}`
  }
  return `能量+${Number(amount) || 0}`
}

function giftCoverUrl(giftId) {
  if (!giftId) return ''
  try {
    const o = require('./offerService').resolveOffer(giftId)
    return (o && o.found && (o.imageUrl || o.imageUrlAdmin)) || ''
  } catch (_) {
    return ''
  }
}

function rewardsConfig() {
  const g = (configService.getPublished() || {}).game || {}
  const list = (g.rewards && Array.isArray(g.rewards.checkin) && g.rewards.checkin.length
    ? g.rewards.checkin
    : defaultCheckinRewards()
  )
    .map((r, i) => {
      const type = r.type || 'energy'
      const amount = Number(r.amount != null ? r.amount : r.value) || 0
      const giftId = r.giftId || ''
      return {
        day: Number(r.day) || i + 1,
        type,
        value: Number(r.value != null ? r.value : r.amount) || 0,
        amount,
        label: autoRewardLabel(type, amount, giftId) || r.label || '',
        giftId,
        imageUrl: type === 'gift' ? giftCoverUrl(giftId) || r.imageUrl || '' : '',
        iconUrl: r.iconUrl || '',
      }
    })
    .sort((a, b) => a.day - b.day)
  return list
}

/** bootstrap 时把签到规则同步进首页签到条（文案/类型/礼品图） */
function syncCheckinStripInConfig(cfg) {
  if (!cfg || !cfg.pages || !cfg.pages.home) return cfg
  const mods = cfg.pages.home.modules
  if (!Array.isArray(mods)) return cfg
  const mod = mods.find((m) => m && m.type === 'checkin_strip')
  if (!mod) return cfg
  mod.payload = mod.payload || {}
  const prevMap = {}
  ;(mod.payload.rewards || []).forEach((x) => {
    if (x && x.day != null) prevMap[x.day] = x
  })
  const rows = rewardsConfig()
  mod.payload.rewards = rows.map((r) => {
    const prev = prevMap[r.day] || {}
    return {
      day: r.day,
      label: r.label,
      type: r.type,
      amount: r.amount,
      giftId: r.giftId || '',
      imageUrl: r.imageUrl || prev.imageUrl || '',
      iconUrl: prev.iconUrl || r.iconUrl || '',
    }
  })
  return cfg
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

function isGiftReward(reward) {
  const t = String((reward && reward.type) || '').toLowerCase()
  return (t === 'gift' || t === 'physical' || t === 'product') && !!(reward && reward.giftId)
}

/** 签到实物：写入中奖凭证，用户可在「中奖记录」去兑奖 */
function grantCheckinGiftClaim(userId, reward, dk) {
  if (!isGiftReward(reward)) return null
  try {
    return require('./lotteryService').grantActivityPhysicalClaim({
      userId,
      source: 'checkin',
      sourceKey: `${dk}_d${reward.dayIndex || ''}`,
      productId: reward.giftId,
      prizeName: reward.label || '',
      actionId: `checkin_gift_${userId}_${dk}`,
    })
  } catch (e) {
    console.warn('[checkin] grant gift claim', e && e.message)
    return { ok: false, msg: (e && e.message) || '礼品凭证发放失败' }
  }
}

/** 补发历史：已签到实物档但从未生成兑奖凭证（修复上线前漏发） */
function repairMissingCheckinGiftClaims(userId) {
  ensureTables()
  const d = dbMod.open()
  let rows = []
  try {
    rows = d
      .prepare(
        `SELECT day_key, reward_json FROM user_checkin WHERE user_id=? ORDER BY day_key DESC LIMIT 21`
      )
      .all(userId)
  } catch (_) {
    return []
  }
  const issued = []
  rows.forEach((row) => {
    let reward = null
    try {
      reward = JSON.parse(row.reward_json || '{}')
    } catch (_) {
      return
    }
    if (!isGiftReward(reward)) return
    const r = grantCheckinGiftClaim(userId, reward, row.day_key)
    if (r && r.ok && r.claimToken) issued.push(r)
  })
  return issued
}

function status(userId) {
  ensureTables()
  try {
    repairMissingCheckinGiftClaims(userId)
  } catch (e) {
    console.warn('[checkin] repair gift claims', e && e.message)
  }
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
  let pendingGiftClaim = null
  if (today) {
    try {
      let reward = {}
      try {
        reward = JSON.parse(today.reward_json || '{}')
      } catch (_) {}
      if (isGiftReward(reward)) {
        const claim = grantCheckinGiftClaim(userId, reward, dk)
        if (claim && claim.claimToken) {
          pendingGiftClaim = {
            claimToken: claim.claimToken,
            productId: claim.productId || reward.giftId,
            name: reward.label || '',
          }
        }
      }
    } catch (_) {}
  }
  return {
    todayDone: !!today,
    streak,
    dayIndex,
    dayKey: dk,
    cycleDays: rewards.length,
    rewards,
    pendingGiftClaim,
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
  const rawType = String(rewardCfg.type || 'energy').toLowerCase()
  const isGift = rawType === 'gift' || rawType === 'physical' || rawType === 'product'
  const norm = isGift
    ? { type: 'gift', amount: Math.max(1, amount || 1) }
    : currency.normalizeRewardType(rewardCfg.type || 'energy', amount)
  const reward = {
    type: isGift ? 'gift' : norm.type === 'energy' ? 'energy' : rewardCfg.type || 'energy',
    value: isGift ? Math.max(1, amount || 1) : norm.type === 'energy' ? norm.amount : amount,
    amount: isGift ? Math.max(1, amount || 1) : norm.type === 'energy' ? norm.amount : amount,
    label:
      rewardCfg.label ||
      autoRewardLabel(rewardCfg.type || norm.type, amount || norm.amount, rewardCfg.giftId),
    giftId: rewardCfg.giftId || '',
    dayIndex,
  }

  const taskSql =
    dbMod.DIALECT === 'mysql'
      ? `INSERT IGNORE INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
         VALUES (?,?,?,'done',?,?)`
      : `INSERT OR IGNORE INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
         VALUES (?,?,?,'done',?,?)`

  const tx = d.transaction(() => {
    d.prepare(
      `INSERT INTO user_checkin (user_id, day_key, streak, reward_json, source, created_at)
       VALUES (?,?,?,?,?,?)`
    ).run(userId, dk, streak, JSON.stringify(reward), source, now)
    if (!isGift && norm.type === 'energy' && norm.amount > 0) {
      currency.grantEnergy(userId, norm.amount, { note: 'checkin' })
    }
    d.prepare(taskSql).run(userId, 'checkin', dk, JSON.stringify(reward), now)
  })
  try {
    tx()
  } catch (e) {
    // 主键 (user_id, day_key) 已拦住并发重复签到，整笔回滚不会双发奖励
    if (e && (e.code === 'ER_DUP_ENTRY' || /UNIQUE|Duplicate|PRIMARY/i.test(e.message || ''))) {
      return { ok: false, msg: '今天已经签过啦', ...status(userId) }
    }
    throw e
  }

  let giftClaim = null
  if (isGift) {
    giftClaim = grantCheckinGiftClaim(userId, reward, dk)
  }

  try {
    require('./inviteService').onInviteeCheckin(userId)
  } catch (e) {}

  let treeBonus = 0
  try {
    treeBonus = require('./treeService').applyCheckinBonus(userId) || 0
  } catch (e) {}

  const wallet = currency.getWallet(userId)
  const parts = [`签到成功 · ${reward.label}`]
  if (giftClaim && giftClaim.claimToken) parts.push('请前往中奖记录兑奖')
  if (treeBonus) parts.push(`树营养 +${treeBonus}`)
  return {
    ok: true,
    msg: parts.join(' · '),
    dayIndex,
    streak,
    reward,
    treeBonus,
    wallet,
    claimToken: (giftClaim && giftClaim.claimToken) || '',
    productId: (giftClaim && giftClaim.productId) || reward.giftId || '',
    claimStatus: (giftClaim && giftClaim.claimStatus) || '',
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
  autoRewardLabel,
  syncCheckinStripInConfig,
  dayIndexFromStreak,
  nextStreakIfCheckinToday,
  grantCheckinGiftClaim,
  repairMissingCheckinGiftClaims,
}

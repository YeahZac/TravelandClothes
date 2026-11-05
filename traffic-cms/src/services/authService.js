const crypto = require('crypto')
const dbMod = require('../db')

/** 简易 token → userId（生产请换 JWT + Redis） */
const tokens = new Map()

function issueToken(userId) {
  const token = crypto.randomBytes(24).toString('hex')
  tokens.set(token, { userId, at: Date.now() })
  return token
}

function userFromToken(token) {
  if (!token) return null
  const hit = tokens.get(token)
  if (!hit) return null
  return hit.userId
}

function ensureDemoUser(platform = 'mp-weixin', openid = 'demo_openid') {
  const db = dbMod.open()
  const now = dbMod.nowIso()
  let row = db
    .prepare('SELECT id FROM user_account WHERE platform = ? AND openid = ?')
    .get(platform, openid)
  if (!row) {
    const info = db
      .prepare(
        `INSERT INTO user_account (platform, openid, nick_name, invite_code, channel, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(platform, openid, '阿柚', 'YX8601', 'organic', now, now)
    row = { id: info.lastInsertRowid }
    db.prepare(
      `INSERT INTO user_wallet (user_id, energy, points, coins, lottery_chance, updated_at)
       VALUES (?, 860, 1280, 14730, 3, ?)`
    ).run(row.id, now)
    db.prepare(
      `INSERT INTO jar_state (user_id, stage, liquid, pending, next_harvest_at, water_ready_at,
         water_count, steals_left, helped_json, event_json, updated_at)
       VALUES (?, 1, 60, 30, ?, ?, 0, 3, '[]', NULL, ?)`
    ).run(
      row.id,
      Date.now() + 2 * 60 * 60 * 1000 + 14 * 60 * 1000,
      Date.now() - 1000,
      now
    )
    // 种子社交动态
    db.prepare(
      `INSERT INTO social_feed (user_id, actor_name, feed_type, amount, tip, created_at, read_flag)
       VALUES (?, '小林', 'stolen', 18, '偷走了你的能量', ?, 0)`
    ).run(row.id, now)
    db.prepare(
      `INSERT INTO social_feed (user_id, actor_name, feed_type, amount, tip, created_at, read_flag)
       VALUES (?, '七七', 'helped', 20, '给你浇了水', ?, 0)`
    ).run(row.id, now)
  }
  return row.id
}

function login({ platform = 'mp-weixin', code = 'demo' }) {
  // 真实环境：用 code 换 openid；此处 demo 映射
  const openid = code && code !== 'demo' ? `oid_${crypto.createHash('md5').update(code).digest('hex').slice(0, 12)}` : 'demo_openid'
  const userId = ensureDemoUser(platform, openid)
  const token = issueToken(userId)
  const db = dbMod.open()
  const user = db.prepare('SELECT id, platform, nick_name, avatar_url, invite_code, channel FROM user_account WHERE id = ?').get(userId)
  const wallet = db.prepare('SELECT energy, points, coins, lottery_chance FROM user_wallet WHERE user_id = ?').get(userId)
  return {
    token,
    user: {
      id: user.id,
      platform: user.platform,
      nickName: user.nick_name,
      avatarUrl: user.avatar_url,
      inviteCode: user.invite_code,
      channel: user.channel,
    },
    wallet: {
      energy: wallet.energy,
      points: wallet.points,
      coins: wallet.coins,
      lotteryChance: wallet.lottery_chance,
    },
  }
}

function me(userId) {
  const db = dbMod.open()
  const user = db.prepare('SELECT id, platform, nick_name, avatar_url, invite_code FROM user_account WHERE id = ?').get(userId)
  const wallet = db.prepare('SELECT energy, points, coins, lottery_chance FROM user_wallet WHERE user_id = ?').get(userId)
  const jar = db.prepare('SELECT stage, liquid, pending FROM jar_state WHERE user_id = ?').get(userId)
  if (!user) return null
  return {
    user: {
      id: user.id,
      nickName: user.nick_name,
      avatarUrl: user.avatar_url,
      inviteCode: user.invite_code,
      platform: user.platform,
    },
    wallet,
    jar: jar
      ? { stage: jar.stage, liquid: jar.liquid, pending: jar.pending }
      : null,
  }
}

module.exports = {
  login,
  me,
  userFromToken,
  ensureDemoUser,
  issueToken,
}

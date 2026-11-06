const crypto = require('crypto')
const dbMod = require('../db')
const { code2Session, wxConfig } = require('./wxAuth')

/** token → userId（进程内；登出可吊销） */
const tokens = new Map()

function issueToken(userId) {
  const token = crypto.randomBytes(24).toString('hex')
  tokens.set(token, { userId, at: Date.now() })
  return token
}

function revokeToken(token) {
  if (token) tokens.delete(token)
  return { ok: true }
}

function userFromToken(token) {
  if (!token) return null
  const hit = tokens.get(token)
  if (!hit) return null
  return hit.userId
}

function ensureUserColumns() {
  const db = dbMod.open()
  const cols = db.prepare('PRAGMA table_info(user_account)').all().map((c) => c.name)
  ;[
    ['session_key', `ALTER TABLE user_account ADD COLUMN session_key TEXT NOT NULL DEFAULT ''`],
    ['unionid', `ALTER TABLE user_account ADD COLUMN unionid VARCHAR(128) NOT NULL DEFAULT ''`],
    ['status', `ALTER TABLE user_account ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`],
  ].forEach(([name, sql]) => {
    if (!cols.includes(name)) {
      try {
        db.exec(sql)
      } catch (e) {}
    }
  })
}

function createUser(platform, openid, { nickName = '', avatarUrl = '', unionid = '', sessionKey = '', channel = 'organic' } = {}) {
  const db = dbMod.open()
  const now = dbMod.nowIso()
  const inviteCode = `YX${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  const info = db
    .prepare(
      `INSERT INTO user_account (platform, openid, unionid, nick_name, avatar_url, invite_code, channel, session_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      platform,
      openid,
      unionid || '',
      nickName || '微信用户',
      avatarUrl || '',
      inviteCode,
      channel || 'organic',
      sessionKey || '',
      now,
      now
    )
  const userId = info.lastInsertRowid
  db.prepare(
    `INSERT INTO user_wallet (user_id, energy, points, coins, lottery_chance, updated_at)
     VALUES (?, 100, 0, 0, 1, ?)`
  ).run(userId, now)
  db.prepare(
    `INSERT INTO jar_state (user_id, stage, liquid, pending, next_harvest_at, water_ready_at,
       water_count, steals_left, helped_json, event_json, updated_at)
     VALUES (?, 1, 0, 0, ?, ?, 0, 3, '[]', NULL, ?)`
  ).run(userId, Date.now() + 3 * 60 * 60 * 1000, Date.now() - 1000, now)
  return userId
}

function findOrCreateByOpenid(platform, openid, extras = {}) {
  ensureUserColumns()
  const db = dbMod.open()
  let row = db.prepare('SELECT id FROM user_account WHERE platform = ? AND openid = ?').get(platform, openid)
  if (!row) {
    return createUser(platform, openid, extras)
  }
  const now = dbMod.nowIso()
  const patches = []
  const args = []
  if (extras.sessionKey) {
    patches.push('session_key=?')
    args.push(extras.sessionKey)
  }
  if (extras.unionid) {
    patches.push('unionid=?')
    args.push(extras.unionid)
  }
  if (extras.nickName) {
    patches.push('nick_name=?')
    args.push(extras.nickName)
  }
  if (extras.avatarUrl) {
    patches.push('avatar_url=?')
    args.push(extras.avatarUrl)
  }
  if (patches.length) {
    patches.push('updated_at=?')
    args.push(now, row.id)
    db.prepare(`UPDATE user_account SET ${patches.join(', ')} WHERE id=?`).run(...args)
  }
  return row.id
}

/** 兼容旧调用 */
function ensureDemoUser(platform = 'mp-weixin', openid = 'demo_openid') {
  return findOrCreateByOpenid(platform, openid, {
    nickName: openid === 'demo_openid' ? '阿柚' : '微信用户',
  })
}

async function login({
  platform = 'mp-weixin',
  code = '',
  inviteCode = '',
  channel = '',
  nickName = '',
  avatarUrl = '',
} = {}) {
  ensureUserColumns()
  const wx = await code2Session(code || 'demo')
  const userId = findOrCreateByOpenid(platform, wx.openid, {
    nickName,
    avatarUrl,
    unionid: wx.unionid,
    sessionKey: wx.session_key,
    channel: channel || 'organic',
  })

  if (channel) {
    try {
      dbMod
        .open()
        .prepare(
          `UPDATE user_account SET channel=? WHERE id=? AND (channel IS NULL OR channel='' OR channel='organic')`
        )
        .run(String(channel).slice(0, 64), userId)
    } catch (e) {}
  }

  let bind = null
  if (inviteCode) {
    try {
      bind = require('./inviteService').tryBind(userId, inviteCode)
    } catch (e) {}
  }
  try {
    require('./socialService').seedDemoFriends(userId)
  } catch (e) {}

  const token = issueToken(userId)
  const db = dbMod.open()
  const user = db
    .prepare('SELECT id, platform, nick_name, avatar_url, invite_code, channel FROM user_account WHERE id = ?')
    .get(userId)
  const wallet = db.prepare('SELECT energy, points, coins, lottery_chance FROM user_wallet WHERE user_id = ?').get(userId)
  const cfg = wxConfig()
  return {
    token,
    wxDemo: !!wx.demo,
    appId: cfg.appId,
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
    inviteBind: bind,
  }
}

function updateProfile(userId, { nickName, avatarUrl } = {}) {
  const db = dbMod.open()
  const now = dbMod.nowIso()
  if (nickName != null) {
    db.prepare(`UPDATE user_account SET nick_name=?, updated_at=? WHERE id=?`).run(
      String(nickName).slice(0, 64),
      now,
      userId
    )
  }
  if (avatarUrl != null) {
    db.prepare(`UPDATE user_account SET avatar_url=?, updated_at=? WHERE id=?`).run(
      String(avatarUrl).slice(0, 512),
      now,
      userId
    )
  }
  return me(userId)
}

function me(userId) {
  const db = dbMod.open()
  const user = db
    .prepare('SELECT id, platform, nick_name, avatar_url, invite_code FROM user_account WHERE id = ?')
    .get(userId)
  const wallet = db.prepare('SELECT energy, points, coins, lottery_chance FROM user_wallet WHERE user_id = ?').get(userId)
  const jar = db.prepare('SELECT stage, liquid, pending FROM jar_state WHERE user_id = ?').get(userId)
  if (!user) return null
  let checkin = null
  let invite = null
  try {
    checkin = require('./checkinService').status(userId)
  } catch (e) {}
  try {
    const unlock = require('./inviteService').unlockDue(userId)
    invite = require('./inviteService').summary(userId)
    if (unlock && unlock.unlocked && unlock.unlocked.length) {
      invite.justUnlocked = unlock
    }
  } catch (e) {}
  const wallet2 = db.prepare('SELECT energy, points, coins, lottery_chance FROM user_wallet WHERE user_id = ?').get(userId)
  return {
    user: {
      id: user.id,
      nickName: user.nick_name,
      avatarUrl: user.avatar_url,
      inviteCode: user.invite_code,
      platform: user.platform,
      frozenInviteReward: invite ? invite.frozenEnergy : 0,
    },
    wallet: wallet2 || wallet,
    jar: jar ? { stage: jar.stage, liquid: jar.liquid, pending: jar.pending } : null,
    checkin,
    invite,
  }
}

module.exports = {
  login,
  me,
  updateProfile,
  userFromToken,
  ensureDemoUser,
  issueToken,
  revokeToken,
  wxConfig,
}

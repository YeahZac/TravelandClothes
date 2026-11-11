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
  dbMod.addColumnIfMissing(db, 'user_account', 'session_key', `VARCHAR(128) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  dbMod.addColumnIfMissing(db, 'user_account', 'unionid', `VARCHAR(128) NOT NULL DEFAULT ''`, `VARCHAR(128) NOT NULL DEFAULT ''`)
  dbMod.addColumnIfMissing(db, 'user_account', 'status', `VARCHAR(16) NOT NULL DEFAULT 'active'`, `TEXT NOT NULL DEFAULT 'active'`)
  dbMod.addColumnIfMissing(db, 'user_account', 'inviter_id', `INT NULL`, `INTEGER`)
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
  /** 云托管 callContainer 网关注入的 openid（优先于 code2session） */
  cloudOpenid = '',
  cloudUnionid = '',
  agreeLegal,
  tosVersion = '',
  privacyVersion = '',
} = {}) {
  ensureUserColumns()
  const legalService = require('./legalService')
  const agreement = legalService.requireAgreement({
    agreeLegal,
    tosVersion,
    privacyVersion,
  })
  let wx
  if (cloudOpenid) {
    // 云托管 callContainer 已注入 openid：立刻登录，默认不调 jscode2session（避免 TLS/开放接口噪声与超时）
    wx = {
      openid: String(cloudOpenid),
      session_key: '',
      unionid: cloudUnionid || '',
      demo: false,
      fromCloudHeader: true,
    }
    const wantSessionKey =
      process.env.WX_FETCH_SESSION_KEY === '1' || process.env.WX_FETCH_SESSION_KEY === 'true'
    if (wantSessionKey && code && code !== 'demo') {
      Promise.resolve()
        .then(() => code2Session(code))
        .then((full) => {
          if (!full || !full.session_key) return
          if (full.openid && full.openid !== wx.openid) return
          try {
            dbMod
              .open()
              .prepare(
                `UPDATE user_account SET session_key=?, unionid=COALESCE(NULLIF(?,''), unionid) WHERE openid=?`
              )
              .run(full.session_key, full.unionid || '', wx.openid)
          } catch (e) {
            console.warn('[auth] persist session_key', e.message)
          }
        })
        .catch((e) => console.warn('[auth] code2Session background fail:', e.message))
    }
  } else {
    wx = await code2Session(code || 'demo')
  }
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

  try {
    legalService.persistUserAgreement(userId, agreement)
  } catch (e) {
    console.warn('[auth] persist legal agreement', e.message)
  }

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
    legal: {
      tosVersion: agreement.tosVersion,
      privacyVersion: agreement.privacyVersion,
      agreedAt: agreement.agreedAt,
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

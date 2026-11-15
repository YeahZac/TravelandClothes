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

let userColumnsReady = false

function ensureUserColumns() {
  if (userColumnsReady) return
  const db = dbMod.open()
  dbMod.addColumnIfMissing(db, 'user_account', 'session_key', `VARCHAR(128) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  dbMod.addColumnIfMissing(db, 'user_account', 'unionid', `VARCHAR(128) NOT NULL DEFAULT ''`, `VARCHAR(128) NOT NULL DEFAULT ''`)
  dbMod.addColumnIfMissing(db, 'user_account', 'status', `VARCHAR(16) NOT NULL DEFAULT 'active'`, `TEXT NOT NULL DEFAULT 'active'`)
  dbMod.addColumnIfMissing(db, 'user_account', 'inviter_id', `INT NULL`, `INTEGER`)
  dbMod.addColumnIfMissing(db, 'user_account', 'gender', `VARCHAR(16) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  dbMod.addColumnIfMissing(db, 'user_account', 'province', `VARCHAR(64) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  dbMod.addColumnIfMissing(db, 'user_account', 'city', `VARCHAR(64) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  dbMod.addColumnIfMissing(db, 'user_account', 'district', `VARCHAR(64) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  dbMod.addColumnIfMissing(db, 'user_account', 'last_active_at', `VARCHAR(40) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  dbMod.addColumnIfMissing(db, 'user_account', 'active_count', `INT NOT NULL DEFAULT 0`, `INTEGER NOT NULL DEFAULT 0`)
  userColumnsReady = true
}

const activeTouchCache = new Map()

/** 节流记活跃：同一用户 60s 内只 +1 */
function touchActive(userId) {
  if (!userId) return
  const now = Date.now()
  const prev = activeTouchCache.get(userId) || 0
  if (now - prev < 60 * 1000) return
  activeTouchCache.set(userId, now)
  try {
    ensureUserColumns()
    const db = dbMod.open()
    const iso = dbMod.nowIso()
    db.prepare(
      `UPDATE user_account SET last_active_at=?, active_count=IFNULL(active_count,0)+1, updated_at=? WHERE id=?`
    ).run(iso, iso, userId)
  } catch (e) {
    console.warn('[auth] touchActive', e.message)
  }
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

/**
 * 在「未 await」的同步栈里跑 deasync DB。
 * Node20：async 函数里一旦 await 过，再 prepare().get/run 会 Maximum call stack size exceeded。
 */
function runDbSync(fn) {
  return dbMod.runSync(fn)
}

/** 后台补 session_key：必须再套一层 setImmediate，禁止在 Promise.then 里 deasync */
function saveSessionKeySync(userId, sessionKey, unionid) {
  if (!userId || !sessionKey) return
  const db = dbMod.open()
  const now = dbMod.nowIso()
  if (unionid) {
    db.prepare(`UPDATE user_account SET session_key=?, unionid=?, updated_at=? WHERE id=?`).run(
      sessionKey,
      unionid,
      now,
      userId
    )
  } else {
    db.prepare(`UPDATE user_account SET session_key=?, updated_at=? WHERE id=?`).run(
      sessionKey,
      now,
      userId
    )
  }
  console.log('[auth] session_key saved for', userId)
}

async function login({
  platform = 'mp-weixin',
  code = '',
  inviteCode = '',
  channel = '',
  nickName = '',
  avatarUrl = '',
  gender = '',
  /** 云托管 callContainer 网关注入的 openid（优先于 code2session） */
  cloudOpenid = '',
  cloudUnionid = '',
  agreeLegal,
  tosVersion = '',
  privacyVersion = '',
} = {}) {
  const legalService = require('./legalService')
  const agreement = legalService.requireAgreement({
    agreeLegal,
    tosVersion,
    privacyVersion,
  })

  // 1) 只做网络：拿到 openid（可 await）
  let wx
  if (cloudOpenid) {
    wx = {
      openid: String(cloudOpenid),
      session_key: '',
      unionid: cloudUnionid || '',
      demo: false,
      fromCloudHeader: true,
    }
  } else {
    try {
      wx = await Promise.race([
        code2Session(code || 'demo'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('微信登录超时，请重试')), 6000)),
      ])
    } catch (e) {
      console.error('[auth] code2Session', e && e.message)
      throw e
    }
  }

  // 2) 所有 deasync DB 必须在 setImmediate 同步栈里跑（禁止紧接在 await 之后）
  const result = await runDbSync(() => {
    ensureUserColumns()
    const userId = findOrCreateByOpenid(platform, wx.openid, {
      nickName,
      avatarUrl,
      unionid: wx.unionid,
      sessionKey: wx.session_key,
      channel: channel || 'organic',
    })

    if (gender) {
      try {
        const dbG = dbMod.open()
        const nowG = dbMod.nowIso()
        dbG
          .prepare(`UPDATE user_account SET gender=?, updated_at=? WHERE id=?`)
          .run(String(gender).slice(0, 16), nowG, userId)
      } catch (_) {}
    }

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
      .prepare(
        'SELECT id, platform, nick_name, avatar_url, invite_code, channel, gender, province, city, district, created_at FROM user_account WHERE id = ?'
      )
      .get(userId)
    const wallet = db
      .prepare('SELECT energy, points, coins, lottery_chance FROM user_wallet WHERE user_id = ?')
      .get(userId)
    let checkin = null
    try {
      checkin = require('./checkinService').status(userId)
    } catch (_) {}
    const cfg = wxConfig()
    try {
      touchActive(userId)
    } catch (_) {}

    return {
      userId,
      token,
      wxDemo: !!wx.demo,
      appId: cfg.appId,
      bind,
      user,
      wallet,
      checkin,
      agreement,
    }
  })

  // 3) 后台补 session_key：网络回调后再 setImmediate，才能安全 deasync
  if (cloudOpenid && code && code !== 'demo') {
    const uidForKey = result.userId
    setImmediate(() => {
      code2Session(code)
        .then((full) => {
          if (!full || !full.session_key) return
          if (full.openid && full.openid !== String(cloudOpenid)) return
          setImmediate(() => {
            try {
              saveSessionKeySync(uidForKey, full.session_key, full.unionid || '')
            } catch (e) {
              console.warn('[auth] session_key save', e && e.message)
            }
          })
        })
        .catch((e) => console.warn('[auth] async code2Session', e && e.message))
    })
  }

  const { token, wxDemo, appId, bind, user, wallet, checkin, agreement: ag } = result
  return {
    token,
    wxDemo,
    appId,
    user: {
      id: user.id,
      platform: user.platform,
      nickName: user.nick_name,
      avatarUrl: user.avatar_url,
      gender: user.gender || '',
      province: user.province || '',
      city: user.city || '',
      district: user.district || '',
      inviteCode: user.invite_code,
      channel: user.channel,
      createdAt: user.created_at || '',
    },
    legal: {
      tosVersion: ag.tosVersion,
      privacyVersion: ag.privacyVersion,
      agreedAt: ag.agreedAt,
    },
    wallet: {
      energy: wallet.energy,
      points: wallet.points,
      coins: wallet.coins,
      lotteryChance: wallet.lottery_chance,
    },
    checkin,
    inviteBind: bind,
  }
}

function updateProfileSync(userId, { nickName, avatarUrl, gender, province, city, district } = {}) {
  ensureUserColumns()
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
  if (gender != null) {
    const g = String(gender).slice(0, 16)
    db.prepare(`UPDATE user_account SET gender=?, updated_at=? WHERE id=?`).run(g, now, userId)
  }
  if (province != null || city != null || district != null) {
    const row = db.prepare('SELECT province, city, district FROM user_account WHERE id=?').get(userId) || {}
    db.prepare(`UPDATE user_account SET province=?, city=?, district=?, updated_at=? WHERE id=?`).run(
      province != null ? String(province).slice(0, 64) : row.province || '',
      city != null ? String(city).slice(0, 64) : row.city || '',
      district != null ? String(district).slice(0, 64) : row.district || '',
      now,
      userId
    )
  }
  return me(userId)
}

/** 对外：始终经 setImmediate，避免头像上传等 await 之后再 deasync */
async function updateProfile(userId, patch = {}) {
  return runDbSync(() => updateProfileSync(userId, patch))
}

async function meAsync(userId) {
  return runDbSync(() => me(userId))
}

function me(userId) {
  ensureUserColumns()
  const db = dbMod.open()
  const user = db
    .prepare(
      'SELECT id, platform, nick_name, avatar_url, invite_code, gender, province, city, district, created_at, last_active_at, active_count FROM user_account WHERE id = ?'
    )
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
      gender: user.gender || '',
      province: user.province || '',
      city: user.city || '',
      district: user.district || '',
      inviteCode: user.invite_code,
      platform: user.platform,
      createdAt: user.created_at || '',
      lastActiveAt: user.last_active_at || '',
      activeCount: Number(user.active_count || 0),
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
  meAsync,
  updateProfile,
  updateProfileSync,
  touchActive,
  ensureUserColumns,
  userFromToken,
  ensureDemoUser,
  issueToken,
  revokeToken,
  wxConfig,
  runDbSync,
}

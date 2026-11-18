const crypto = require('crypto')
const dbMod = require('../db')
const { code2Session, wxConfig } = require('./wxAuth')

/** 进程内热缓存；权威在 DB auth_token（防云托管重启/多实例丢登录） */
const tokens = new Map()
/** 登录后尽量长期在线：默认约 10 年；可用 AUTH_TOKEN_TTL_DAYS 覆盖 */
const TOKEN_TTL_MS =
  Math.max(1, Number(process.env.AUTH_TOKEN_TTL_DAYS || 3650)) * 24 * 3600 * 1000
/** 滑动续期写库节流：同一 token 最多每天落盘一次 */
const TOKEN_TOUCH_DB_MS = 24 * 3600 * 1000
const tokenTouchAt = new Map()
let authTokenTableReady = false

function ensureAuthTokenTable() {
  if (authTokenTableReady) return
  // MySQL：表由 boot warmSchemas；热路径禁止 CREATE 抢 SyncGate
  if (dbMod.DIALECT === 'mysql') {
    authTokenTableReady = true
    return
  }
  const db = dbMod.open()
  db.prepare(
    `CREATE TABLE IF NOT EXISTS auth_token (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`
  ).run()
  authTokenTableReady = true
}

function issueToken(userId) {
  ensureAuthTokenTable()
  const token = crypto.randomBytes(24).toString('hex')
  const at = Date.now()
  const createdAt = dbMod.nowIso()
  const expiresAt = new Date(at + TOKEN_TTL_MS).toISOString()
  tokens.set(token, { userId, at, expiresAt: at + TOKEN_TTL_MS })
  tokenTouchAt.set(token, at)
  try {
    dbMod
      .open()
      .prepare(`INSERT INTO auth_token (token, user_id, created_at, expires_at) VALUES (?,?,?,?)`)
      .run(token, userId, createdAt, expiresAt)
  } catch (e) {
    console.warn('[auth] persist token', e && e.message)
  }
  return token
}

function revokeToken(token) {
  if (!token) return { ok: true }
  tokens.delete(token)
  tokenTouchAt.delete(token)
  try {
    ensureAuthTokenTable()
    dbMod.open().prepare(`DELETE FROM auth_token WHERE token=?`).run(token)
  } catch (_) {}
  return { ok: true }
}

/** 有效访问时把过期时间往后推，避免「隔天就要重新登录」 */
function slideTokenExpiry(token, userId) {
  if (!token || !userId) return
  const now = Date.now()
  const nextExp = now + TOKEN_TTL_MS
  tokens.set(token, { userId, at: now, expiresAt: nextExp })
  const last = tokenTouchAt.get(token) || 0
  if (now - last < TOKEN_TOUCH_DB_MS) return
  tokenTouchAt.set(token, now)
  // #region agent log
  typeof fetch === 'function' &&
    fetch('http://127.0.0.1:7737/ingest/27f9eadc-e387-420f-9ea4-b7d73a10ebe8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2f088c' },
      body: JSON.stringify({
        sessionId: '2f088c',
        runId: 'pre-fix',
        hypothesisId: 'H3',
        location: 'authService.js:slideTokenExpiry:before-db',
        message: 'token expiry DB write starting',
        data: { userId: Number(userId), dialect: dbMod.DIALECT, gate: dbMod.getStabilityStats() },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
  // #endregion
  try {
    ensureAuthTokenTable()
    dbMod
      .open()
      .prepare(`UPDATE auth_token SET expires_at=? WHERE token=?`)
      .run(new Date(nextExp).toISOString(), token)
    // #region agent log
    typeof fetch === 'function' &&
      fetch('http://127.0.0.1:7737/ingest/27f9eadc-e387-420f-9ea4-b7d73a10ebe8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2f088c' },
        body: JSON.stringify({
          sessionId: '2f088c',
          runId: 'pre-fix',
          hypothesisId: 'H3',
          location: 'authService.js:slideTokenExpiry:after-db',
          message: 'token expiry DB write completed',
          data: { userId: Number(userId), gate: dbMod.getStabilityStats() },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
    // #endregion
  } catch (e) {
    console.warn('[auth] slide token', e && e.message)
  }
}

function rememberToken(token, userId, expiresAtMs) {
  const exp = expiresAtMs || Date.now() + TOKEN_TTL_MS
  tokens.set(token, { userId, at: Date.now(), expiresAt: exp })
  slideTokenExpiry(token, userId)
  return userId
}

function userFromToken(token) {
  if (!token) return null
  const hit = tokens.get(token)
  if (hit) {
    if (hit.expiresAt && Date.now() > hit.expiresAt) {
      revokeToken(token)
      return null
    }
    slideTokenExpiry(token, hit.userId)
    return hit.userId
  }
  // MySQL 冷路径：闸门忙时禁止 sync 查库（返回未登录，避免拖垮整站）
  if (dbMod.DIALECT === 'mysql' && typeof dbMod.isSyncGateBusy === 'function' && dbMod.isSyncGateBusy()) {
    return null
  }
  try {
    ensureAuthTokenTable()
    const row = dbMod.open().prepare(`SELECT user_id, expires_at FROM auth_token WHERE token=?`).get(token)
    if (!row) return null
    const exp = Date.parse(row.expires_at || '') || 0
    if (exp && Date.now() > exp) {
      revokeToken(token)
      return null
    }
    return rememberToken(token, row.user_id, exp || Date.now() + TOKEN_TTL_MS)
  } catch (_) {
    return null
  }
}

/** async 路由鉴权：不占 SyncGate */
async function userFromTokenAsync(token) {
  if (!token) return null
  const hit = tokens.get(token)
  if (hit) {
    if (hit.expiresAt && Date.now() > hit.expiresAt) {
      revokeToken(token)
      return null
    }
    slideTokenExpiry(token, hit.userId)
    return hit.userId
  }
  try {
    ensureAuthTokenTable()
    const [rows] = await dbMod.queryAsync(
      `SELECT user_id, expires_at FROM auth_token WHERE token=? LIMIT 1`,
      [token]
    )
    const row = rows && rows[0]
    if (!row) return null
    const exp = Date.parse(row.expires_at || '') || 0
    if (exp && Date.now() > exp) {
      revokeToken(token)
      return null
    }
    return rememberToken(token, row.user_id, exp || Date.now() + TOKEN_TTL_MS)
  } catch (_) {
    return null
  }
}

let userColumnsReady = false

function markUserColumnsReady() {
  userColumnsReady = true
}

function ensureUserColumns() {
  if (userColumnsReady) return
  // MySQL：列由 openAsync.ensureUserAccountColumnsAsync 补齐；热路径禁止 deasync information_schema
  if (dbMod.DIALECT === 'mysql') {
    userColumnsReady = true
    return
  }
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
  ensureAuthTokenTable()
  userColumnsReady = true
}

const activeTouchCache = new Map()

/** 节流记活跃：同一用户 60s 内只 +1；永不在请求栈同步 UPDATE（防 deasync 占池） */
function touchActive(userId) {
  if (!userId) return
  const now = Date.now()
  const prev = activeTouchCache.get(userId) || 0
  if (now - prev < 60 * 1000) return
  activeTouchCache.set(userId, now)
  const iso = dbMod.nowIso()
  const uid = userId
  setImmediate(() => {
    dbMod
      .queryAsync(
        `UPDATE user_account SET last_active_at=?, active_count=IFNULL(active_count,0)+1, updated_at=? WHERE id=?`,
        [iso, iso, uid]
      )
      .catch((e) => {
        if (e && e.code === 'DB_BUSY') return
        console.warn('[auth] touchActive', e && e.message)
      })
  })
}

/** 新用户首次建号赠送能量；运营台 game.rewards.firstLoginEnergy，默认 120 */
function firstLoginEnergyAmount() {
  try {
    const pub = require('./configService').getPublished() || {}
    const rewards = (pub.game && pub.game.rewards) || {}
    const n = Number(rewards.firstLoginEnergy)
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  } catch (_) {}
  return 120
}

function createUser(platform, openid, { nickName = '', avatarUrl = '', unionid = '', sessionKey = '', channel = 'organic' } = {}) {
  const db = dbMod.open()
  const now = dbMod.nowIso()
  const inviteCode = `YX${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  const safeAvatar = sanitizeAvatarUrl(avatarUrl) || ''
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
      safeAvatar,
      inviteCode,
      channel || 'organic',
      sessionKey || '',
      now,
      now
    )
  const userId = info.lastInsertRowid
  const welcome = firstLoginEnergyAmount()
  db.prepare(
    `INSERT INTO user_wallet (user_id, energy, points, coins, lottery_chance, updated_at)
     VALUES (?, 0, 0, 0, 1, ?)`
  ).run(userId, now)
  if (welcome > 0) {
    try {
      require('./currencyService').grantEnergy(userId, welcome, {
        note: '首次登录赠送',
        refType: 'first_login',
        refId: String(userId),
      })
    } catch (e) {
      // 记账失败时仍保证钱包有欢迎能量
      db.prepare(`UPDATE user_wallet SET energy=?, updated_at=? WHERE user_id=?`).run(welcome, now, userId)
      console.warn('[auth] firstLogin grantEnergy', e && e.message)
    }
  }
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
    const safeAvatar = sanitizeAvatarUrl(extras.avatarUrl)
    if (safeAvatar) {
      patches.push('avatar_url=?')
      args.push(safeAvatar)
    }
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

  // 3) 云头 openid 登录必须尽快拿到 session_key，否则微信运动解密必失败
  if (cloudOpenid && code && code !== 'demo') {
    const uidForKey = result.userId
    try {
      const full = await Promise.race([
        code2Session(code),
        new Promise((_, rej) => setTimeout(() => rej(new Error('session_key timeout')), 5000)),
      ])
      if (full && full.session_key && (!full.openid || full.openid === String(cloudOpenid))) {
        await runDbSync(() => {
          saveSessionKeySync(uidForKey, full.session_key, full.unionid || '')
        })
      } else {
        console.warn('[auth] code2Session missing session_key after cloud login')
      }
    } catch (e) {
      console.warn('[auth] sync session_key', e && e.message)
      // 兜底异步再试一次，不阻断登录响应
      setImmediate(() => {
        code2Session(code)
          .then((full) => {
            if (!full || !full.session_key) return
            if (full.openid && full.openid !== String(cloudOpenid)) return
            setImmediate(() => {
              try {
                saveSessionKeySync(uidForKey, full.session_key, full.unionid || '')
              } catch (err) {
                console.warn('[auth] session_key save', err && err.message)
              }
            })
          })
          .catch((err) => console.warn('[auth] async code2Session', err && err.message))
      })
    }
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

function sanitizeAvatarUrl(avatarUrl) {
  if (avatarUrl == null) return null
  if (typeof avatarUrl === 'object') {
    avatarUrl = avatarUrl.path || avatarUrl.avatarUrl || ''
  }
  let s = String(avatarUrl || '').trim()
  if (!s || s === '[object Object]') return ''
  // 拒绝把微信临时路径写进库（须先走 /me/avatar 上传为 /uploads/...）
  if (/^wxfile:\/\//i.test(s) || /^file:\/\//i.test(s)) return ''
  if (/^https?:\/\/tmp\b/i.test(s) || /^https?:\/\/usr\b/i.test(s)) return ''
  if (s.includes('/tmp/') || s.includes('tmp_')) return ''
  if (!/^https?:\/\//i.test(s) && !s.startsWith('/uploads/')) return ''
  if (s.length > 512) s = s.slice(0, 512)
  return s
}

function updateProfileSync(userId, { nickName, avatarUrl, gender, province, city, district } = {}) {
  ensureUserColumns()
  const db = dbMod.open()
  const now = dbMod.nowIso()
  if (nickName != null) {
    let nick = String(nickName).trim().slice(0, 64)
    // 拒绝把 CTA 文案写进库
    if (nick === '点击登录' || nick === '游客') nick = ''
    if (nick) {
      db.prepare(`UPDATE user_account SET nick_name=?, updated_at=? WHERE id=?`).run(nick, now, userId)
    }
  }
  if (avatarUrl != null) {
    const safe = sanitizeAvatarUrl(avatarUrl)
    if (safe) {
      db.prepare(`UPDATE user_account SET avatar_url=?, updated_at=? WHERE id=?`).run(safe, now, userId)
    }
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

function shapeMe(user, wallet, jar, checkin, invite) {
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
    wallet: wallet || null,
    jar: jar ? { stage: jar.stage, liquid: jar.liquid, pending: jar.pending } : null,
    checkin,
    invite,
  }
}

/**
 * C 端 /me 热路径：全程 queryAsync，不占 SyncGate。
 * checkin/invite 附属信息尽量异步；闸门忙时降级为 null，避免整页 503。
 */
async function meAsync(userId) {
  ensureUserColumns()
  const [[users], [wallets], [jars]] = await Promise.all([
    dbMod.queryAsync(
      `SELECT id, platform, nick_name, avatar_url, invite_code, gender, province, city, district,
              created_at, last_active_at, active_count
       FROM user_account WHERE id = ?`,
      [userId]
    ),
    dbMod.queryAsync(
      `SELECT energy, points, coins, lottery_chance FROM user_wallet WHERE user_id = ?`,
      [userId]
    ),
    dbMod.queryAsync(`SELECT stage, liquid, pending FROM jar_state WHERE user_id = ?`, [userId]),
  ])
  const user = users && users[0]
  if (!user) return null
  let wallet = (wallets && wallets[0]) || null
  const jar = jars && jars[0]

  let checkin = null
  let invite = null
  const softSync = async (label, fn) => {
    try {
      return await runDbSync(fn)
    } catch (e) {
      if (e && (e.code === 'DB_BUSY' || e.code === 'DB_TIMEOUT')) return null
      console.warn(`[auth] meAsync ${label}`, e && e.message)
      return null
    }
  }
  checkin = await softSync('checkin', () => require('./checkinService').status(userId))
  invite = await softSync('invite', () => require('./inviteService').summary(userId))
  return shapeMe(user, wallet, jar, checkin, invite)
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
    invite = require('./inviteService').summary(userId)
  } catch (e) {}
  return shapeMe(user, wallet, jar, checkin, invite)
}

/**
 * 用最新 wx.login code 刷新 session_key（步数解密前调用）
 */
async function refreshSessionKey(userId, code) {
  if (!userId || !code || code === 'demo') return { ok: false, msg: 'missing code' }
  const full = await Promise.race([
    code2Session(code),
    new Promise((_, rej) => setTimeout(() => rej(new Error('session_key timeout')), 5000)),
  ])
  if (!full || !full.session_key) return { ok: false, msg: 'no session_key' }
  await runDbSync(() => {
    saveSessionKeySync(userId, full.session_key, full.unionid || '')
  })
  return { ok: true }
}

module.exports = {
  login,
  me,
  meAsync,
  updateProfile,
  updateProfileSync,
  touchActive,
  ensureUserColumns,
  markUserColumnsReady,
  userFromToken,
  userFromTokenAsync,
  ensureDemoUser,
  issueToken,
  revokeToken,
  refreshSessionKey,
  wxConfig,
  runDbSync,
}

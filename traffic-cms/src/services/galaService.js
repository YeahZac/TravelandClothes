/**
 * 年会抽奖独立域：主办方短信账号、多场次、签到、抽奖、弹幕
 */
const crypto = require('crypto')
const dbMod = require('../db')
const galaSms = require('./galaSms')
const mediaUrl = require('../mediaUrl')

let schemaReady = false
const hostTokens = new Map() // token -> { accountId, expiresAt }
const screenTokens = new Map() // token -> { eventId, accountId, expiresAt }

const HOST_TTL_MS = Math.max(1, Number(process.env.GALA_HOST_TTL_DAYS || 30)) * 24 * 3600 * 1000
const SCREEN_TTL_MS = 7 * 24 * 3600 * 1000
const SMS_TTL_MS = 5 * 60 * 1000
const SMS_COOLDOWN_MS = 60 * 1000
const SMS_DAY_LIMIT = 20

function nowIso() {
  return dbMod.nowIso()
}

function shortCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  const buf = crypto.randomBytes(6)
  for (let i = 0; i < 6; i++) s += alphabet[buf[i] % alphabet.length]
  return s
}

function randDigits(n = 6) {
  let s = ''
  for (let i = 0; i < n; i++) s += String(crypto.randomInt(0, 10))
  return s
}

function ensureSchema() {
  if (schemaReady) return
  if (dbMod.DIALECT === 'mysql') {
    schemaReady = true
    return
  }
  const d = dbMod.open()
  d.exec(`
    CREATE TABLE IF NOT EXISTS gala_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gala_host_token (
      token TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gala_sms_code (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'login',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS gala_event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      require_real_name INTEGER NOT NULL DEFAULT 0,
      current_round_id INTEGER NOT NULL DEFAULT 0,
      screen_mode TEXT NOT NULL DEFAULT 'checkin',
      starts_at TEXT NOT NULL DEFAULT '',
      ends_at TEXT NOT NULL DEFAULT '',
      allow_redraw INTEGER NOT NULL DEFAULT 1,
      allow_repeat_win INTEGER NOT NULL DEFAULT 0,
      test_mode INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gala_prize (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      level_label TEXT NOT NULL,
      name TEXT NOT NULL,
      value_text TEXT NOT NULL DEFAULT '',
      show_value INTEGER NOT NULL DEFAULT 0,
      image_url TEXT NOT NULL DEFAULT '',
      winner_count INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      one_person_one_prize INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gala_prize_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prize_id INTEGER NOT NULL,
      event_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      value_text TEXT NOT NULL DEFAULT '',
      show_value INTEGER NOT NULL DEFAULT 0,
      image_url TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gala_round (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      prize_id INTEGER NOT NULL,
      round_no INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      winner_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gala_participant (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL DEFAULT 0,
      openid TEXT NOT NULL DEFAULT '',
      nick_name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      real_name TEXT NOT NULL DEFAULT '',
      checked_in_at TEXT NOT NULL,
      UNIQUE(event_id, openid)
    );
    CREATE TABLE IF NOT EXISTS gala_winner (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      round_id INTEGER NOT NULL,
      participant_id INTEGER NOT NULL,
      prize_item_id INTEGER NOT NULL DEFAULT 0,
      voided INTEGER NOT NULL DEFAULT 0,
      is_test INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gala_danmaku (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      participant_id INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER NOT NULL DEFAULT 0,
      nick_name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gala_screen_token (
      token TEXT PRIMARY KEY,
      event_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gala_event_account ON gala_event(account_id);
    CREATE INDEX IF NOT EXISTS idx_gala_prize_event ON gala_prize(event_id);
    CREATE INDEX IF NOT EXISTS idx_gala_round_event ON gala_round(event_id);
    CREATE INDEX IF NOT EXISTS idx_gala_part_event ON gala_participant(event_id);
    CREATE INDEX IF NOT EXISTS idx_gala_winner_round ON gala_winner(round_id);
    CREATE INDEX IF NOT EXISTS idx_gala_dm_event ON gala_danmaku(event_id);
  `)
  migrateGalaColumns(d)
  schemaReady = true
}

function migrateGalaColumns(d) {
  const alters = [
    ['gala_event', 'starts_at', `TEXT NOT NULL DEFAULT ''`],
    ['gala_event', 'ends_at', `TEXT NOT NULL DEFAULT ''`],
    ['gala_event', 'allow_redraw', `INTEGER NOT NULL DEFAULT 1`],
    ['gala_event', 'allow_repeat_win', `INTEGER NOT NULL DEFAULT 0`],
    ['gala_event', 'test_mode', `INTEGER NOT NULL DEFAULT 0`],
    ['gala_winner', 'is_test', `INTEGER NOT NULL DEFAULT 0`],
    ['gala_winner', 'prize_item_id', `INTEGER NOT NULL DEFAULT 0`],
    ['gala_prize', 'one_person_one_prize', `INTEGER NOT NULL DEFAULT 1`],
  ]
  for (const [table, col, def] of alters) {
    try {
      d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
    } catch (_) {}
  }
  try {
    d.exec(`
      CREATE TABLE IF NOT EXISTS gala_prize_item (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prize_id INTEGER NOT NULL,
        event_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        value_text TEXT NOT NULL DEFAULT '',
        show_value INTEGER NOT NULL DEFAULT 0,
        image_url TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_gala_item_prize ON gala_prize_item(prize_id);
    `)
  } catch (_) {}
  backfillPrizeItems(d)
}

/** 旧奖项（仅 name/image）补一条默认奖品，便于一奖项多奖品模型 */
function backfillPrizeItems(d) {
  try {
    const prizes = d.prepare(`SELECT * FROM gala_prize`).all()
    const now = nowIso()
    const has = d.prepare(`SELECT COUNT(1) AS c FROM gala_prize_item WHERE prize_id=?`)
    const ins = d.prepare(
      `INSERT INTO gala_prize_item (prize_id, event_id, name, value_text, show_value, image_url, sort_order, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    for (const p of prizes) {
      const c = Number((has.get(p.id) || {}).c) || 0
      if (c > 0) continue
      const name = String(p.name || p.level_label || '奖品').trim() || '奖品'
      ins.run(
        p.id,
        p.event_id,
        name,
        p.value_text || '',
        Number(p.show_value) || 0,
        p.image_url || '',
        0,
        now,
        now
      )
    }
  } catch (e) {
    console.warn('[gala] backfillPrizeItems', e && e.message)
  }
}

async function ensureSchemaAsync() {
  if (dbMod.DIALECT !== 'mysql') {
    ensureSchema()
    return
  }
  const run = async (sql) => {
    try {
      await dbMod.queryAsync(sql)
    } catch (e) {
      if (/Duplicate|already exists|ER_TABLE_EXISTS/i.test(String(e && e.message))) return
      console.warn('[gala] schema', e && e.message)
    }
  }
  await run(`CREATE TABLE IF NOT EXISTS gala_account (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    display_name VARCHAR(64) NOT NULL DEFAULT '',
    company VARCHAR(128) NOT NULL DEFAULT '',
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    UNIQUE KEY uk_gala_phone (phone)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS gala_host_token (
    token VARCHAR(64) NOT NULL PRIMARY KEY,
    account_id INT NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    expires_at VARCHAR(40) NOT NULL,
    KEY idx_gala_host_acc (account_id)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS gala_sms_code (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(16) NOT NULL,
    purpose VARCHAR(16) NOT NULL DEFAULT 'login',
    created_at VARCHAR(40) NOT NULL,
    expires_at VARCHAR(40) NOT NULL,
    used TINYINT NOT NULL DEFAULT 0,
    KEY idx_gala_sms_phone (phone)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS gala_event (
    id INT AUTO_INCREMENT PRIMARY KEY,
    account_id INT NOT NULL,
    title VARCHAR(128) NOT NULL,
    code VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    require_real_name TINYINT NOT NULL DEFAULT 0,
    current_round_id INT NOT NULL DEFAULT 0,
    screen_mode VARCHAR(16) NOT NULL DEFAULT 'checkin',
    starts_at VARCHAR(40) NOT NULL DEFAULT '',
    ends_at VARCHAR(40) NOT NULL DEFAULT '',
    allow_redraw TINYINT NOT NULL DEFAULT 1,
    allow_repeat_win TINYINT NOT NULL DEFAULT 0,
    test_mode TINYINT NOT NULL DEFAULT 0,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    UNIQUE KEY uk_gala_event_code (code),
    KEY idx_gala_event_acc (account_id)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS gala_prize (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    level_label VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    value_text VARCHAR(64) NOT NULL DEFAULT '',
    show_value TINYINT NOT NULL DEFAULT 0,
    image_url VARCHAR(512) NOT NULL DEFAULT '',
    winner_count INT NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    one_person_one_prize TINYINT NOT NULL DEFAULT 1,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    KEY idx_gala_prize_ev (event_id)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS gala_prize_item (
    id INT AUTO_INCREMENT PRIMARY KEY,
    prize_id INT NOT NULL,
    event_id INT NOT NULL,
    name VARCHAR(128) NOT NULL,
    value_text VARCHAR(64) NOT NULL DEFAULT '',
    show_value TINYINT NOT NULL DEFAULT 0,
    image_url VARCHAR(512) NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    KEY idx_gala_item_prize (prize_id),
    KEY idx_gala_item_ev (event_id)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS gala_round (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    prize_id INT NOT NULL,
    round_no INT NOT NULL DEFAULT 1,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    winner_count INT NOT NULL DEFAULT 1,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    KEY idx_gala_round_ev (event_id)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS gala_participant (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NOT NULL DEFAULT 0,
    openid VARCHAR(64) NOT NULL DEFAULT '',
    nick_name VARCHAR(64) NOT NULL DEFAULT '',
    avatar_url VARCHAR(512) NOT NULL DEFAULT '',
    real_name VARCHAR(64) NOT NULL DEFAULT '',
    checked_in_at VARCHAR(40) NOT NULL,
    UNIQUE KEY uk_gala_part (event_id, openid),
    KEY idx_gala_part_ev (event_id)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS gala_winner (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    round_id INT NOT NULL,
    participant_id INT NOT NULL,
    prize_item_id INT NOT NULL DEFAULT 0,
    voided TINYINT NOT NULL DEFAULT 0,
    is_test TINYINT NOT NULL DEFAULT 0,
    created_at VARCHAR(40) NOT NULL,
    KEY idx_gala_win_round (round_id),
    KEY idx_gala_win_ev (event_id)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS gala_danmaku (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    participant_id INT NOT NULL DEFAULT 0,
    user_id INT NOT NULL DEFAULT 0,
    nick_name VARCHAR(64) NOT NULL DEFAULT '',
    avatar_url VARCHAR(512) NOT NULL DEFAULT '',
    content VARCHAR(200) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    KEY idx_gala_dm_ev (event_id)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS gala_screen_token (
    token VARCHAR(64) NOT NULL PRIMARY KEY,
    event_id INT NOT NULL,
    account_id INT NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    expires_at VARCHAR(40) NOT NULL
  )`)
  const mysqlAlters = [
    ['gala_event', 'starts_at', `VARCHAR(40) NOT NULL DEFAULT ''`],
    ['gala_event', 'ends_at', `VARCHAR(40) NOT NULL DEFAULT ''`],
    ['gala_event', 'allow_redraw', `TINYINT NOT NULL DEFAULT 1`],
    ['gala_event', 'allow_repeat_win', `TINYINT NOT NULL DEFAULT 0`],
    ['gala_event', 'test_mode', `TINYINT NOT NULL DEFAULT 0`],
    ['gala_winner', 'is_test', `TINYINT NOT NULL DEFAULT 0`],
    ['gala_winner', 'prize_item_id', `INT NOT NULL DEFAULT 0`],
    ['gala_prize', 'one_person_one_prize', `TINYINT NOT NULL DEFAULT 1`],
  ]
  for (const [table, col, def] of mysqlAlters) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
  }
  try {
    backfillPrizeItems(dbMod.open())
  } catch (e) {
    console.warn('[gala] mysql backfill', e && e.message)
  }
  schemaReady = true
}

function db() {
  ensureSchema()
  return dbMod.open()
}

function absMedia(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw
  return mediaUrl.adminDisplayUrl(raw) || mediaUrl.adminProxyUrl(raw) || raw
}

/* ---------- host auth ---------- */

function issueHostToken(accountId) {
  ensureSchema()
  const token = crypto.randomBytes(24).toString('hex')
  const created = nowIso()
  const expiresAt = new Date(Date.now() + HOST_TTL_MS).toISOString()
  db()
    .prepare(
      `INSERT INTO gala_host_token (token, account_id, created_at, expires_at) VALUES (?,?,?,?)`
    )
    .run(token, accountId, created, expiresAt)
  hostTokens.set(token, { accountId, expiresAt: Date.now() + HOST_TTL_MS })
  return token
}

function hostFromToken(token) {
  if (!token) return null
  const mem = hostTokens.get(token)
  if (mem) {
    if (Date.now() > mem.expiresAt) {
      hostTokens.delete(token)
      return null
    }
    return mem.accountId
  }
  ensureSchema()
  const row = db()
    .prepare(`SELECT account_id, expires_at FROM gala_host_token WHERE token=?`)
    .get(token)
  if (!row) return null
  const exp = Date.parse(row.expires_at) || 0
  if (exp && Date.now() > exp) return null
  hostTokens.set(token, { accountId: row.account_id, expiresAt: exp || Date.now() + HOST_TTL_MS })
  return row.account_id
}

function issueScreenToken(eventId, accountId) {
  ensureSchema()
  const token = crypto.randomBytes(20).toString('hex')
  const created = nowIso()
  const expiresAt = new Date(Date.now() + SCREEN_TTL_MS).toISOString()
  db()
    .prepare(
      `INSERT INTO gala_screen_token (token, event_id, account_id, created_at, expires_at) VALUES (?,?,?,?,?)`
    )
    .run(token, eventId, accountId, created, expiresAt)
  screenTokens.set(token, { eventId, accountId, expiresAt: Date.now() + SCREEN_TTL_MS })
  return token
}

function screenFromToken(token) {
  if (!token) return null
  const mem = screenTokens.get(token)
  if (mem && Date.now() <= mem.expiresAt) return mem
  ensureSchema()
  const row = db()
    .prepare(`SELECT event_id, account_id, expires_at FROM gala_screen_token WHERE token=?`)
    .get(token)
  if (!row) return null
  const exp = Date.parse(row.expires_at) || 0
  if (exp && Date.now() > exp) return null
  const info = { eventId: row.event_id, accountId: row.account_id, expiresAt: exp }
  screenTokens.set(token, info)
  return info
}

async function sendSms(phone) {
  ensureSchema()
  const mobile = String(phone || '').replace(/\D/g, '')
  if (!/^1\d{10}$/.test(mobile)) throw new Error('请输入正确的手机号')

  const recent = db()
    .prepare(
      `SELECT created_at FROM gala_sms_code WHERE phone=? ORDER BY id DESC LIMIT 1`
    )
    .get(mobile)
  if (recent) {
    const t = Date.parse(recent.created_at) || 0
    if (Date.now() - t < SMS_COOLDOWN_MS) throw new Error('发送太频繁，请稍后再试')
  }
  const dayKey = new Date().toISOString().slice(0, 10)
  const dayCount = db()
    .prepare(
      `SELECT COUNT(1) AS c FROM gala_sms_code WHERE phone=? AND created_at LIKE ?`
    )
    .get(mobile, `${dayKey}%`)
  if (dayCount && Number(dayCount.c) >= SMS_DAY_LIMIT) throw new Error('今日发送次数已达上限')

  const code = randDigits(6)
  const created = nowIso()
  const expiresAt = new Date(Date.now() + SMS_TTL_MS).toISOString()
  db()
    .prepare(
      `INSERT INTO gala_sms_code (phone, code, purpose, created_at, expires_at, used) VALUES (?,?,?,?,?,0)`
    )
    .run(mobile, code, 'login', created, expiresAt)

  await galaSms.sendLoginCode(mobile, code, 5)
  return {
    ok: true,
    cooldownSec: Math.ceil(SMS_COOLDOWN_MS / 1000),
    smsReady: galaSms.smsConfigured(),
    hint: galaSms.smsConfigured() ? '' : '开发模式：验证码见服务日志，或使用 888888',
  }
}

function loginWithSms({ phone, code, displayName = '', company = '' } = {}) {
  ensureSchema()
  const mobile = String(phone || '').replace(/\D/g, '')
  if (!/^1\d{10}$/.test(mobile)) throw new Error('请输入正确的手机号')
  const input = String(code || '').trim()
  if (!input) throw new Error('请输入验证码')

  let okCode = false
  if (!galaSms.smsConfigured() && galaSms.isDevCode(input)) {
    okCode = true
  } else {
    const row = db()
      .prepare(
        `SELECT id, code, expires_at, used FROM gala_sms_code
         WHERE phone=? AND purpose='login' AND used=0 ORDER BY id DESC LIMIT 1`
      )
      .get(mobile)
    if (!row) throw new Error('请先获取验证码')
    if (Number(row.used)) throw new Error('验证码已使用')
    const exp = Date.parse(row.expires_at) || 0
    if (exp && Date.now() > exp) throw new Error('验证码已过期')
    if (String(row.code) !== input) throw new Error('验证码错误')
    db().prepare(`UPDATE gala_sms_code SET used=1 WHERE id=?`).run(row.id)
    okCode = true
  }
  if (!okCode) throw new Error('验证码错误')

  let acc = db().prepare(`SELECT * FROM gala_account WHERE phone=?`).get(mobile)
  const now = nowIso()
  if (!acc) {
    const name = String(displayName || '').trim() || `主办方${mobile.slice(-4)}`
    const co = String(company || '').trim()
    const info = db()
      .prepare(
        `INSERT INTO gala_account (phone, display_name, company, created_at, updated_at) VALUES (?,?,?,?,?)`
      )
      .run(mobile, name, co, now, now)
    const id = info.lastInsertRowid || info.insertId
    acc = db().prepare(`SELECT * FROM gala_account WHERE id=?`).get(id)
  } else if (displayName || company) {
    db()
      .prepare(
        `UPDATE gala_account SET display_name=COALESCE(NULLIF(?,''), display_name),
         company=COALESCE(NULLIF(?,''), company), updated_at=? WHERE id=?`
      )
      .run(String(displayName || '').trim(), String(company || '').trim(), now, acc.id)
    acc = db().prepare(`SELECT * FROM gala_account WHERE id=?`).get(acc.id)
  }

  const token = issueHostToken(acc.id)
  return {
    token,
    account: {
      id: acc.id,
      phone: acc.phone,
      displayName: acc.display_name,
      company: acc.company,
      isNew: !acc,
    },
  }
}

function getAccount(accountId) {
  ensureSchema()
  const acc = db().prepare(`SELECT * FROM gala_account WHERE id=?`).get(accountId)
  if (!acc) return null
  return {
    id: acc.id,
    phone: acc.phone,
    displayName: acc.display_name,
    company: acc.company,
  }
}

/* ---------- events / prizes / rounds ---------- */

function colOr(row, key, fallback) {
  if (!row || row[key] == null) return fallback
  return row[key]
}

function mapEvent(row, prizeCount = 0) {
  if (!row) return null
  const n = Number(prizeCount) || 0
  const allowRedraw = row.allow_redraw == null ? true : !!Number(row.allow_redraw)
  return {
    id: row.id,
    accountId: row.account_id,
    title: row.title,
    code: row.code,
    status: row.status,
    requireRealName: !!Number(row.require_real_name),
    currentRoundId: Number(row.current_round_id) || 0,
    screenMode: row.screen_mode || 'checkin',
    startsAt: String(colOr(row, 'starts_at', '') || ''),
    endsAt: String(colOr(row, 'ends_at', '') || ''),
    allowRedraw,
    allowRepeatWin: !!Number(colOr(row, 'allow_repeat_win', 0)),
    testMode: !!Number(colOr(row, 'test_mode', 0)),
    prizeCount: n,
    themeMode: n > 5 ? 'dark' : 'blue',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 校验场次是否可签到/抽奖；testMode 可绕过有效期 */
function assertEventOpen(ev, { forDraw = false } = {}) {
  if (!ev) throw new Error('场次不存在')
  if (ev.status === 'closed') throw new Error('场次已关闭')
  if (ev.status === 'draft' && forDraw) throw new Error('场次仍为草稿，请先在设置中改为「就绪/进行中」')
  const testMode = !!Number(ev.test_mode)
  if (testMode) return
  const now = Date.now()
  const starts = String(ev.starts_at || '').trim()
  const ends = String(ev.ends_at || '').trim()
  if (starts) {
    const t = Date.parse(starts)
    if (Number.isFinite(t) && now < t) throw new Error('场次尚未开始')
  }
  if (ends) {
    const t = Date.parse(ends)
    if (Number.isFinite(t) && now > t) throw new Error('场次已过有效期')
  }
}

function mapPrizeItem(row) {
  if (!row) return null
  return {
    id: row.id,
    prizeId: row.prize_id,
    eventId: row.event_id,
    name: row.name || '',
    valueText: row.value_text || '',
    showValue: !!Number(row.show_value),
    imageUrl: absMedia(row.image_url),
    sortOrder: Number(row.sort_order) || 0,
  }
}

function listPrizeItems(prizeId) {
  ensureSchema()
  try {
    return db()
      .prepare(
        `SELECT * FROM gala_prize_item WHERE prize_id=? ORDER BY sort_order ASC, id ASC`
      )
      .all(prizeId)
      .map((r) => mapPrizeItem(r))
  } catch (e) {
    // 云托管冷启 DDL 未就绪时，不能让大屏 snapshot 整页挂掉
    console.warn('[gala] listPrizeItems', e && e.message)
    return []
  }
}

function mapPrize(row, items) {
  if (!row) return null
  const list = items || listPrizeItems(row.id)
  const cover = list[0] || null
  return {
    id: row.id,
    eventId: row.event_id,
    levelLabel: row.level_label,
    // 兼容旧字段：摘要取首个奖品
    name: (cover && cover.name) || row.name || '',
    valueText: (cover && cover.valueText) || row.value_text || '',
    showValue: cover ? !!cover.showValue : !!Number(row.show_value),
    imageUrl: (cover && cover.imageUrl) || absMedia(row.image_url),
    winnerCount: Math.max(1, Number(row.winner_count) || 1),
    sortOrder: Number(row.sort_order) || 0,
    onePersonOnePrize: row.one_person_one_prize == null ? true : !!Number(row.one_person_one_prize),
    items: list,
  }
}

function mapRound(row, prize) {
  if (!row) return null
  return {
    id: row.id,
    eventId: row.event_id,
    prizeId: row.prize_id,
    roundNo: Number(row.round_no) || 1,
    status: row.status,
    winnerCount: Math.max(1, Number(row.winner_count) || 1),
    prize: prize || null,
  }
}

function prizeCountOf(eventId) {
  const r = db().prepare(`SELECT COUNT(1) AS c FROM gala_prize WHERE event_id=?`).get(eventId)
  return Number(r && r.c) || 0
}

function assertEventOwner(eventId, accountId) {
  const ev = db().prepare(`SELECT * FROM gala_event WHERE id=?`).get(eventId)
  if (!ev) throw new Error('场次不存在')
  if (Number(ev.account_id) !== Number(accountId)) throw new Error('无权操作该场次')
  return ev
}

function listEvents(accountId) {
  ensureSchema()
  const rows = db()
    .prepare(`SELECT * FROM gala_event WHERE account_id=? ORDER BY id DESC`)
    .all(accountId)
  return rows.map((r) => mapEvent(r, prizeCountOf(r.id)))
}

function createEvent(accountId, { title, requireRealName = false } = {}) {
  ensureSchema()
  const t = String(title || '').trim() || '年会抽奖'
  const now = nowIso()
  let code = shortCode()
  for (let i = 0; i < 8; i++) {
    const hit = db().prepare(`SELECT id FROM gala_event WHERE code=?`).get(code)
    if (!hit) break
    code = shortCode()
  }
  const info = db()
    .prepare(
      `INSERT INTO gala_event (
         account_id, title, code, status, require_real_name, current_round_id, screen_mode,
         starts_at, ends_at, allow_redraw, allow_repeat_win, test_mode, created_at, updated_at
       ) VALUES (?,?,?,'ready',?,?, 'checkin', '', '', 1, 0, 0, ?, ?)`
    )
    .run(accountId, t, code, requireRealName ? 1 : 0, 0, now, now)
  const id = info.lastInsertRowid || info.insertId
  return mapEvent(db().prepare(`SELECT * FROM gala_event WHERE id=?`).get(id), 0)
}

function normalizeStatus(s) {
  const v = String(s || '').trim().toLowerCase()
  if (['draft', 'ready', 'live', 'closed'].includes(v)) return v
  return 'ready'
}

function updateEvent(accountId, eventId, patch = {}) {
  ensureSchema()
  const ev = assertEventOwner(eventId, accountId)
  const title = patch.title != null ? String(patch.title).trim() : ev.title
  const requireRealName =
    patch.requireRealName != null ? (patch.requireRealName ? 1 : 0) : ev.require_real_name
  const status = patch.status != null ? normalizeStatus(patch.status) : ev.status
  const screenMode = patch.screenMode != null ? String(patch.screenMode) : ev.screen_mode
  const currentRoundId =
    patch.currentRoundId != null ? Number(patch.currentRoundId) || 0 : ev.current_round_id
  const startsAt =
    patch.startsAt != null ? String(patch.startsAt || '').trim() : String(ev.starts_at || '')
  const endsAt = patch.endsAt != null ? String(patch.endsAt || '').trim() : String(ev.ends_at || '')
  const allowRedraw =
    patch.allowRedraw != null ? (patch.allowRedraw ? 1 : 0) : ev.allow_redraw == null ? 1 : Number(ev.allow_redraw)
  const allowRepeatWin =
    patch.allowRepeatWin != null
      ? patch.allowRepeatWin
        ? 1
        : 0
      : Number(ev.allow_repeat_win) || 0
  const wasTest = !!Number(ev.test_mode)
  const testMode = patch.testMode != null ? (patch.testMode ? 1 : 0) : Number(ev.test_mode) || 0
  db()
    .prepare(
      `UPDATE gala_event SET
         title=?, require_real_name=?, status=?, screen_mode=?, current_round_id=?,
         starts_at=?, ends_at=?, allow_redraw=?, allow_repeat_win=?, test_mode=?, updated_at=?
       WHERE id=?`
    )
    .run(
      title,
      requireRealName,
      status,
      screenMode,
      currentRoundId,
      startsAt,
      endsAt,
      allowRedraw,
      allowRepeatWin,
      testMode,
      nowIso(),
      eventId
    )
  // 关闭测试模式时作废全部测试中奖，避免污染正式名单
  if (wasTest && !testMode) {
    db()
      .prepare(`UPDATE gala_winner SET voided=1 WHERE event_id=? AND is_test=1 AND voided=0`)
      .run(eventId)
  }
  return mapEvent(db().prepare(`SELECT * FROM gala_event WHERE id=?`).get(eventId), prizeCountOf(eventId))
}

function getEventByCode(code) {
  ensureSchema()
  const c = String(code || '')
    .trim()
    .toUpperCase()
  if (!c) return null
  const ev = db().prepare(`SELECT * FROM gala_event WHERE code=?`).get(c)
  if (!ev) return null
  return mapEvent(ev, prizeCountOf(ev.id))
}

function getEventById(eventId) {
  ensureSchema()
  const ev = db().prepare(`SELECT * FROM gala_event WHERE id=?`).get(eventId)
  if (!ev) return null
  return mapEvent(ev, prizeCountOf(ev.id))
}

function listPrizes(eventId) {
  ensureSchema()
  return db()
    .prepare(`SELECT * FROM gala_prize WHERE event_id=? ORDER BY sort_order ASC, id ASC`)
    .all(eventId)
    .map((r) => mapPrize(r))
}

function normalizePrizeItemsInput(body, fallbackName) {
  let items = Array.isArray(body.items) ? body.items : null
  if (!items || !items.length) {
    // 兼容旧客户端：单奖品字段
    items = [
      {
        name: String(body.name || fallbackName || '奖品').trim() || '奖品',
        valueText: String(body.valueText || body.value || '').trim(),
        showValue: !!body.showValue,
        imageUrl: String(body.imageUrl || '').trim(),
        sortOrder: 0,
      },
    ]
  }
  return items
    .map((it, idx) => ({
      id: it.id ? Number(it.id) : 0,
      name: String(it.name || '').trim() || `奖品${idx + 1}`,
      valueText: String(it.valueText || it.value || '').trim(),
      showValue: it.showValue ? 1 : 0,
      imageUrl: String(it.imageUrl || '').trim(),
      sortOrder: Number(it.sortOrder != null ? it.sortOrder : idx) || 0,
    }))
    .filter((it) => it.name)
}

function replacePrizeItems(eventId, prizeId, items, now) {
  const keepIds = []
  const update = db().prepare(
    `UPDATE gala_prize_item SET name=?, value_text=?, show_value=?, image_url=?, sort_order=?, updated_at=?
     WHERE id=? AND prize_id=?`
  )
  const insert = db().prepare(
    `INSERT INTO gala_prize_item (prize_id, event_id, name, value_text, show_value, image_url, sort_order, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  )
  for (const it of items) {
    if (it.id) {
      const old = db()
        .prepare(`SELECT id FROM gala_prize_item WHERE id=? AND prize_id=?`)
        .get(it.id, prizeId)
      if (old) {
        update.run(it.name, it.valueText, it.showValue, it.imageUrl, it.sortOrder, now, it.id, prizeId)
        keepIds.push(it.id)
        continue
      }
    }
    const info = insert.run(
      prizeId,
      eventId,
      it.name,
      it.valueText,
      it.showValue,
      it.imageUrl,
      it.sortOrder,
      now,
      now
    )
    keepIds.push(Number(info.lastInsertRowid || info.insertId))
  }
  const keepSet = new Set(keepIds.map(Number))
  const existing = db()
    .prepare(`SELECT id FROM gala_prize_item WHERE prize_id=?`)
    .all(prizeId)
  for (const row of existing) {
    if (!keepSet.has(Number(row.id))) {
      db().prepare(`DELETE FROM gala_prize_item WHERE id=?`).run(row.id)
    }
  }
  return listPrizeItems(prizeId)
}

function upsertPrize(accountId, eventId, body = {}) {
  ensureSchema()
  assertEventOwner(eventId, accountId)
  const now = nowIso()
  const levelLabel = String(body.levelLabel || body.level || '').trim() || '奖项'
  const items = normalizePrizeItemsInput(body, levelLabel)
  if (!items.length) throw new Error('请至少添加一个奖品')
  const onePersonOnePrize =
    body.onePersonOnePrize == null ? 1 : body.onePersonOnePrize ? 1 : 0
  // 抽取人数：显式传入优先；否则多人一奖品用 winnerCount；多奖品默认=奖品条数
  let winnerCount = Math.max(1, Math.min(200, Number(body.winnerCount) || 0))
  if (!winnerCount) winnerCount = items.length > 1 ? items.length : Math.max(1, Number(body.winnerCount) || 1)
  if (items.length === 1 && Number(body.winnerCount) > 0) winnerCount = Math.max(1, Number(body.winnerCount))
  if (items.length > 1 && onePersonOnePrize) winnerCount = Math.max(winnerCount, items.length)
  const sortOrder = Number(body.sortOrder) || 0
  const cover = items[0]
  const name = cover.name
  const valueText = cover.valueText
  const showValue = cover.showValue
  const imageUrl = cover.imageUrl

  let prizeId = body.id ? Number(body.id) : 0
  if (prizeId) {
    const old = db().prepare(`SELECT * FROM gala_prize WHERE id=? AND event_id=?`).get(prizeId, eventId)
    if (!old) throw new Error('奖项不存在')
    db()
      .prepare(
        `UPDATE gala_prize SET level_label=?, name=?, value_text=?, show_value=?, image_url=?,
         winner_count=?, sort_order=?, one_person_one_prize=?, updated_at=? WHERE id=?`
      )
      .run(
        levelLabel,
        name,
        valueText,
        showValue,
        imageUrl,
        winnerCount,
        sortOrder,
        onePersonOnePrize,
        now,
        prizeId
      )
  } else {
    const info = db()
      .prepare(
        `INSERT INTO gala_prize (
           event_id, level_label, name, value_text, show_value, image_url,
           winner_count, sort_order, one_person_one_prize, created_at, updated_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        eventId,
        levelLabel,
        name,
        valueText,
        showValue,
        imageUrl,
        winnerCount,
        sortOrder,
        onePersonOnePrize,
        now,
        now
      )
    prizeId = info.lastInsertRowid || info.insertId
    const maxRound = db()
      .prepare(`SELECT MAX(round_no) AS m FROM gala_round WHERE event_id=?`)
      .get(eventId)
    const roundNo = (Number(maxRound && maxRound.m) || 0) + 1
    db()
      .prepare(
        `INSERT INTO gala_round (event_id, prize_id, round_no, status, winner_count, created_at, updated_at)
         VALUES (?,?,?,'pending',?,?,?)`
      )
      .run(eventId, prizeId, roundNo, winnerCount, now, now)
  }
  replacePrizeItems(eventId, prizeId, items, now)
  db()
    .prepare(`UPDATE gala_round SET winner_count=?, updated_at=? WHERE prize_id=? AND event_id=?`)
    .run(winnerCount, now, prizeId, eventId)
  return mapPrize(db().prepare(`SELECT * FROM gala_prize WHERE id=?`).get(prizeId))
}

function deletePrize(accountId, eventId, prizeId) {
  ensureSchema()
  assertEventOwner(eventId, accountId)
  db().prepare(`DELETE FROM gala_prize_item WHERE prize_id=? AND event_id=?`).run(prizeId, eventId)
  db().prepare(`DELETE FROM gala_prize WHERE id=? AND event_id=?`).run(prizeId, eventId)
  db().prepare(`DELETE FROM gala_round WHERE prize_id=? AND event_id=?`).run(prizeId, eventId)
  return { ok: true }
}

function deleteEvent(accountId, eventId) {
  ensureSchema()
  assertEventOwner(eventId, accountId)
  const id = Number(eventId)
  db().prepare(`DELETE FROM gala_winner WHERE event_id=?`).run(id)
  db().prepare(`DELETE FROM gala_danmaku WHERE event_id=?`).run(id)
  db().prepare(`DELETE FROM gala_participant WHERE event_id=?`).run(id)
  db().prepare(`DELETE FROM gala_round WHERE event_id=?`).run(id)
  db().prepare(`DELETE FROM gala_prize_item WHERE event_id=?`).run(id)
  db().prepare(`DELETE FROM gala_prize WHERE event_id=?`).run(id)
  try {
    db().prepare(`DELETE FROM gala_screen_token WHERE event_id=?`).run(id)
  } catch (_) {}
  db().prepare(`DELETE FROM gala_event WHERE id=? AND account_id=?`).run(id, accountId)
  return { ok: true }
}

function getPrize(accountId, eventId, prizeId) {
  ensureSchema()
  assertEventOwner(eventId, accountId)
  const row = db().prepare(`SELECT * FROM gala_prize WHERE id=? AND event_id=?`).get(prizeId, eventId)
  if (!row) throw new Error('奖项不存在')
  return mapPrize(row)
}

function listRounds(eventId) {
  ensureSchema()
  const rounds = db()
    .prepare(`SELECT * FROM gala_round WHERE event_id=? ORDER BY round_no ASC, id ASC`)
    .all(eventId)
  const prizes = listPrizes(eventId)
  const pmap = Object.fromEntries(prizes.map((p) => [p.id, p]))
  return rounds.map((r) => mapRound(r, pmap[r.prize_id] || null))
}

function syncRoundsFromPrizes(accountId, eventId) {
  ensureSchema()
  assertEventOwner(eventId, accountId)
  const prizes = db()
    .prepare(`SELECT * FROM gala_prize WHERE event_id=? ORDER BY sort_order ASC, id ASC`)
    .all(eventId)
  const now = nowIso()
  const existing = db().prepare(`SELECT * FROM gala_round WHERE event_id=?`).all(eventId)
  const byPrize = Object.fromEntries(existing.map((r) => [r.prize_id, r]))
  let no = 0
  for (const p of prizes) {
    no += 1
    const hit = byPrize[p.id]
    if (hit) {
      db()
        .prepare(
          `UPDATE gala_round SET round_no=?, winner_count=?, updated_at=? WHERE id=?`
        )
        .run(no, Math.max(1, Number(p.winner_count) || 1), now, hit.id)
    } else {
      db()
        .prepare(
          `INSERT INTO gala_round (event_id, prize_id, round_no, status, winner_count, created_at, updated_at)
           VALUES (?,?,?,'pending',?,?,?)`
        )
        .run(eventId, p.id, no, Math.max(1, Number(p.winner_count) || 1), now, now)
    }
  }
  return listRounds(eventId)
}

/* ---------- checkin / danmaku ---------- */

function mapParticipant(row) {
  if (!row) return null
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    nickName: row.nick_name || '',
    avatarUrl: absMedia(row.avatar_url),
    realName: row.real_name || '',
    checkedInAt: row.checked_in_at,
  }
}

function checkin(eventIdOrCode, user, profile = {}) {
  ensureSchema()
  let ev =
    typeof eventIdOrCode === 'number' || /^\d+$/.test(String(eventIdOrCode))
      ? db().prepare(`SELECT * FROM gala_event WHERE id=?`).get(Number(eventIdOrCode))
      : db()
          .prepare(`SELECT * FROM gala_event WHERE code=?`)
          .get(String(eventIdOrCode).trim().toUpperCase())
  if (!ev) throw new Error('场次不存在或已结束')
  assertEventOpen(ev, { forDraw: false })

  const nick = String(profile.nickName || '').trim()
  const avatar = String(profile.avatarUrl || '').trim()
  const realName = String(profile.realName || '').trim()
  if (!nick || nick === '点击登录' || nick === '微信用户') throw new Error('请授权微信昵称')
  if (!avatar) throw new Error('请选择微信头像')
  if (Number(ev.require_real_name) && !realName) throw new Error('请填写真实姓名')

  const userId = Number(user.userId || user.id || 0) || 0
  const openid =
    String(user.openid || profile.openid || '').trim() || (userId ? `uid:${userId}` : '')
  if (!openid) throw new Error('缺少用户标识，请重新登录')
  const now = nowIso()
  const old = db()
    .prepare(`SELECT * FROM gala_participant WHERE event_id=? AND openid=?`)
    .get(ev.id, openid)
  if (old) {
    db()
      .prepare(
        `UPDATE gala_participant SET nick_name=?, avatar_url=?, real_name=?, user_id=?, checked_in_at=? WHERE id=?`
      )
      .run(nick, avatar, realName || old.real_name, userId || old.user_id, now, old.id)
    return {
      ok: true,
      already: true,
      event: mapEvent(ev, prizeCountOf(ev.id)),
      participant: mapParticipant(db().prepare(`SELECT * FROM gala_participant WHERE id=?`).get(old.id)),
    }
  }
  const info = db()
    .prepare(
      `INSERT INTO gala_participant (event_id, user_id, openid, nick_name, avatar_url, real_name, checked_in_at)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(ev.id, userId, openid, nick, avatar, realName, now)
  const id = info.lastInsertRowid || info.insertId
  return {
    ok: true,
    already: false,
    event: mapEvent(ev, prizeCountOf(ev.id)),
    participant: mapParticipant(db().prepare(`SELECT * FROM gala_participant WHERE id=?`).get(id)),
  }
}

function listParticipants(eventId, { limit = 200 } = {}) {
  ensureSchema()
  const n = Math.min(500, Math.max(1, Number(limit) || 200))
  return db()
    .prepare(
      `SELECT * FROM gala_participant WHERE event_id=? ORDER BY id DESC LIMIT ?`
    )
    .all(eventId, n)
    .map((r) => mapParticipant(r))
}

function postDanmaku(eventId, user, content) {
  ensureSchema()
  const text = String(content || '').trim()
  if (text.length < 1) throw new Error('请输入弹幕内容')
  if (text.length > 40) throw new Error('弹幕请控制在 40 字内')
  const openid = String(user.openid || '').trim()
  const userId = Number(user.userId || user.id || 0) || 0
  const part = openid
    ? db()
        .prepare(`SELECT * FROM gala_participant WHERE event_id=? AND openid=?`)
        .get(eventId, openid)
    : userId
      ? db()
          .prepare(`SELECT * FROM gala_participant WHERE event_id=? AND user_id=? ORDER BY id DESC LIMIT 1`)
          .get(eventId, userId)
      : null
  if (!part) throw new Error('请先签到本场活动')
  const now = nowIso()
  const info = db()
    .prepare(
      `INSERT INTO gala_danmaku (event_id, participant_id, user_id, nick_name, avatar_url, content, created_at)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(eventId, part.id, userId, part.nick_name, part.avatar_url, text, now)
  return {
    id: info.lastInsertRowid || info.insertId,
    nickName: part.nick_name,
    avatarUrl: part.avatar_url,
    content: text,
    createdAt: now,
  }
}

function listDanmaku(eventId, { afterId = 0, limit = 50 } = {}) {
  ensureSchema()
  const n = Math.min(100, Math.max(1, Number(limit) || 50))
  const aid = Number(afterId) || 0
  const rows = aid
    ? db()
        .prepare(
          `SELECT * FROM gala_danmaku WHERE event_id=? AND id>? ORDER BY id ASC LIMIT ?`
        )
        .all(eventId, aid, n)
    : db()
        .prepare(
          `SELECT * FROM gala_danmaku WHERE event_id=? ORDER BY id DESC LIMIT ?`
        )
        .all(eventId, n)
        .reverse()
  return rows.map((r) => ({
    id: r.id,
    nickName: r.nick_name,
    avatarUrl: absMedia(r.avatar_url),
    content: r.content,
    createdAt: r.created_at,
  }))
}

/* ---------- draw ---------- */

function activeWinnerIds(eventId, { includeTest = false } = {}) {
  const rows = includeTest
    ? db()
        .prepare(`SELECT participant_id FROM gala_winner WHERE event_id=? AND voided=0`)
        .all(eventId)
    : db()
        .prepare(
          `SELECT participant_id FROM gala_winner WHERE event_id=? AND voided=0 AND IFNULL(is_test,0)=0`
        )
        .all(eventId)
  return rows.map((r) => r.participant_id)
}

function winnersOfRound(roundId) {
  const rows = db()
    .prepare(
      `SELECT w.id AS win_id, w.is_test, w.voided, w.created_at AS win_at, w.round_id,
              w.prize_item_id, pi.name AS item_name, pi.value_text AS item_value,
              pi.show_value AS item_show_value, pi.image_url AS item_image,
              pr.level_label, p.*
       FROM gala_winner w
       JOIN gala_participant p ON p.id=w.participant_id
       LEFT JOIN gala_prize_item pi ON pi.id=w.prize_item_id
       LEFT JOIN gala_round r ON r.id=w.round_id
       LEFT JOIN gala_prize pr ON pr.id=r.prize_id
       WHERE w.round_id=? AND w.voided=0 ORDER BY w.id ASC`
    )
    .all(roundId)
  return rows.map((r) => ({
    winId: r.win_id,
    isTest: !!Number(r.is_test),
    wonAt: r.win_at,
    roundId: r.round_id,
    prizeItemId: Number(r.prize_item_id) || 0,
    levelLabel: r.level_label || '',
    prizeItemName: r.item_name || '',
    prizeItemValue: r.item_value || '',
    prizeItemShowValue: !!Number(r.item_show_value),
    prizeItemImage: absMedia(r.item_image),
    ...mapParticipant(r),
  }))
}

function listWinners(eventId, { includeVoided = false } = {}) {
  ensureSchema()
  const where = includeVoided ? 'w.event_id=?' : 'w.event_id=? AND w.voided=0'
  const sql = `SELECT w.id AS win_id, w.is_test, w.voided, w.created_at AS win_at, w.round_id,
              w.prize_item_id, r.round_no, pr.level_label,
              pi.name AS item_name, pi.value_text AS item_value,
              pi.show_value AS item_show_value, pi.image_url AS item_image,
              pr.name AS prize_name, p.*
       FROM gala_winner w
       JOIN gala_participant p ON p.id=w.participant_id
       LEFT JOIN gala_round r ON r.id=w.round_id
       LEFT JOIN gala_prize pr ON pr.id=r.prize_id
       LEFT JOIN gala_prize_item pi ON pi.id=w.prize_item_id
       WHERE ${where} ORDER BY w.id DESC`
  return db()
    .prepare(sql)
    .all(eventId)
    .map((r) => ({
      winId: r.win_id,
      isTest: !!Number(r.is_test),
      voided: !!Number(r.voided),
      wonAt: r.win_at,
      roundId: r.round_id,
      roundNo: Number(r.round_no) || 0,
      levelLabel: r.level_label || '',
      prizeName: r.item_name || r.prize_name || '',
      prizeItemId: Number(r.prize_item_id) || 0,
      prizeItemName: r.item_name || r.prize_name || '',
      prizeItemValue: r.item_value || '',
      prizeItemShowValue: !!Number(r.item_show_value),
      prizeItemImage: absMedia(r.item_image),
      ...mapParticipant(r),
    }))
}

function voidWinner(accountId, eventId, winId) {
  ensureSchema()
  assertEventOwner(eventId, accountId)
  const row = db()
    .prepare(`SELECT * FROM gala_winner WHERE id=? AND event_id=?`)
    .get(winId, eventId)
  if (!row) throw new Error('中奖记录不存在')
  db().prepare(`UPDATE gala_winner SET voided=1 WHERE id=?`).run(winId)
  return { ok: true }
}

function clearTestWinners(accountId, eventId) {
  ensureSchema()
  assertEventOwner(eventId, accountId)
  const info = db()
    .prepare(`UPDATE gala_winner SET voided=1 WHERE event_id=? AND is_test=1 AND voided=0`)
    .run(eventId)
  return { ok: true, cleared: info.changes || 0 }
}

function pickRandom(arr, n) {
  const pool = arr.slice()
  const out = []
  const take = Math.min(n, pool.length)
  for (let i = 0; i < take; i++) {
    const j = crypto.randomInt(0, pool.length)
    out.push(pool[j])
    pool.splice(j, 1)
  }
  return out
}

function drawRound(accountId, eventId, roundId, { redraw = false } = {}) {
  ensureSchema()
  const ev = assertEventOwner(eventId, accountId)
  assertEventOpen(ev, { forDraw: true })
  const testMode = !!Number(ev.test_mode)
  const allowRedraw = ev.allow_redraw == null ? true : !!Number(ev.allow_redraw)
  const allowRepeatWin = !!Number(ev.allow_repeat_win)

  const round = db().prepare(`SELECT * FROM gala_round WHERE id=? AND event_id=?`).get(roundId, eventId)
  if (!round) throw new Error('轮次不存在')
  const prize = db().prepare(`SELECT * FROM gala_prize WHERE id=?`).get(round.prize_id)
  if (!prize) throw new Error('奖项不存在')
  const onePersonOnePrize = prize.one_person_one_prize == null ? true : !!Number(prize.one_person_one_prize)
  let items = listPrizeItems(prize.id)
  if (!items.length) {
    items = [
      {
        id: 0,
        name: prize.name || prize.level_label || '奖品',
        valueText: prize.value_text || '',
        showValue: !!Number(prize.show_value),
        imageUrl: absMedia(prize.image_url),
      },
    ]
  }
  const declaredPeople = Math.max(
    1,
    Number(round.winner_count) || Number(prize.winner_count) || 1
  )

  if (redraw) {
    if (!testMode && !allowRedraw) throw new Error('本场已关闭重抽，请在场次设置中开启')
    db()
      .prepare(
        `UPDATE gala_winner SET voided=1 WHERE round_id=? AND voided=0${testMode ? ' AND is_test=1' : ''}`
      )
      .run(roundId)
  } else {
    const exist = winnersOfRound(roundId).filter((w) => (testMode ? w.isTest : !w.isTest))
    if (exist.length) throw new Error('本轮已抽过，如需重抽请点重新抽奖')
  }

  // 正式中奖始终占坑；测试中奖不挡正式奖池。场次级允许一人多奖时不占坑。
  const taken = allowRepeatWin
    ? new Set()
    : new Set(activeWinnerIds(eventId, { includeTest: false }))
  const all = db()
    .prepare(`SELECT * FROM gala_participant WHERE event_id=?`)
    .all(eventId)
  const pool = all.filter((p) => !taken.has(p.id))
  if (!pool.length) throw new Error('没有可抽签到嘉宾（或均已中奖）')

  // 多奖品：每件奖品各发一条；单奖品：按抽取人数重复该奖品
  const giftSlots = []
  if (items.length > 1) {
    for (const it of pickRandom(items.slice(), items.length)) giftSlots.push(it)
  } else {
    for (let i = 0; i < declaredPeople; i++) giftSlots.push(items[0])
  }

  /** @type {{ participant: any, item: any }[]} */
  const assignments = []
  if (onePersonOnePrize) {
    if (pool.length < giftSlots.length) {
      throw new Error(`可抽人数不足：本奖项需 ${giftSlots.length} 人（一人一奖），剩余 ${pool.length} 人`)
    }
    const people = pickRandom(pool, giftSlots.length)
    for (let i = 0; i < giftSlots.length; i++) {
      assignments.push({ participant: people[i], item: giftSlots[i] })
    }
  } else {
    // 一人多奖：奖品全部发出；抽取人数=本轮入围人数（可小于奖品数，同一人可中多件）
    const peopleN = Math.min(Math.max(1, declaredPeople), pool.length, giftSlots.length)
    const chosenPeople = pickRandom(pool, peopleN)
    for (const item of giftSlots) {
      const p = chosenPeople[crypto.randomInt(0, chosenPeople.length)]
      assignments.push({ participant: p, item })
    }
  }

  const now = nowIso()
  const insert = db().prepare(
    `INSERT INTO gala_winner (event_id, round_id, participant_id, prize_item_id, voided, is_test, created_at)
     VALUES (?,?,?,?,0,?,?)`
  )
  for (const a of assignments) {
    insert.run(
      eventId,
      roundId,
      a.participant.id,
      Number(a.item && a.item.id) || 0,
      testMode ? 1 : 0,
      now
    )
  }
  if (!testMode) {
    db()
      .prepare(`UPDATE gala_round SET status='done', updated_at=? WHERE id=?`)
      .run(now, roundId)
  }
  db()
    .prepare(
      `UPDATE gala_event SET current_round_id=?, screen_mode='result', status=CASE WHEN status='ready' THEN 'live' ELSE status END, updated_at=? WHERE id=?`
    )
    .run(roundId, now, eventId)

  return {
    ok: true,
    testMode,
    round: mapRound(db().prepare(`SELECT * FROM gala_round WHERE id=?`).get(roundId), mapPrize(prize)),
    winners: winnersOfRound(roundId),
  }
}

function setScreenMode(accountId, eventId, mode, roundId) {
  ensureSchema()
  assertEventOwner(eventId, accountId)
  const patch = { screenMode: mode }
  if (roundId) patch.currentRoundId = roundId
  return updateEvent(accountId, eventId, patch)
}

/* ---------- screen snapshot ---------- */

function screenSnapshot(eventIdOrCode) {
  ensureSchema()
  let ev =
    typeof eventIdOrCode === 'number' || /^\d+$/.test(String(eventIdOrCode || ''))
      ? db().prepare(`SELECT * FROM gala_event WHERE id=?`).get(Number(eventIdOrCode))
      : db()
          .prepare(`SELECT * FROM gala_event WHERE code=?`)
          .get(String(eventIdOrCode || '').trim().toUpperCase())
  if (!ev) throw new Error('场次不存在')
  const event = mapEvent(ev, prizeCountOf(ev.id))
  const prizes = listPrizes(ev.id)
  const rounds = listRounds(ev.id)
  const participants = listParticipants(ev.id, { limit: 120 })
  const danmaku = listDanmaku(ev.id, { limit: 40 })
  const currentRoundId = Number(ev.current_round_id) || 0
  const currentRound = rounds.find((r) => r.id === currentRoundId) || rounds.find((r) => r.status === 'pending') || rounds[0] || null
  const winners = currentRound ? winnersOfRound(currentRound.id) : []
  return {
    event,
    prizes,
    rounds,
    participants,
    danmaku,
    currentRound,
    winners,
    checkinCount: participants.length,
    themeMode: event.themeMode,
  }
}

function myCheckin(user, eventId) {
  ensureSchema()
  const openid = String(user.openid || '').trim()
  const userId = Number(user.userId || user.id || 0) || 0
  let row = null
  if (openid) {
    row = db()
      .prepare(`SELECT * FROM gala_participant WHERE event_id=? AND openid=?`)
      .get(eventId, openid)
  }
  if (!row && userId) {
    row = db()
      .prepare(`SELECT * FROM gala_participant WHERE event_id=? AND user_id=? ORDER BY id DESC LIMIT 1`)
      .get(eventId, userId)
  }
  return row ? mapParticipant(row) : null
}

function openidOfUser(userId) {
  try {
    const row = db()
      .prepare(`SELECT openid FROM user_account WHERE id=? LIMIT 1`)
      .get(userId)
    return (row && row.openid) || ''
  } catch (_) {
    return ''
  }
}

module.exports = {
  ensureSchema,
  ensureSchemaAsync,
  sendSms,
  loginWithSms,
  hostFromToken,
  getAccount,
  issueScreenToken,
  screenFromToken,
  listEvents,
  createEvent,
  updateEvent,
  getEventByCode,
  getEventById,
  listPrizes,
  upsertPrize,
  deletePrize,
  deleteEvent,
  getPrize,
  listPrizeItems,
  listRounds,
  syncRoundsFromPrizes,
  checkin,
  listParticipants,
  postDanmaku,
  listDanmaku,
  drawRound,
  setScreenMode,
  screenSnapshot,
  myCheckin,
  openidOfUser,
  winnersOfRound,
  listWinners,
  voidWinner,
  clearTestWinners,
}

/**
 * 测试账号沙箱：运营台给指定用户加能量/抽奖配额等，可一键清掉后恢复正式政策。
 */
const dbMod = require('../db')
const { chinaDayKey, chinaDayRangeUtc } = require('./chinaDay')

let ready = false

/** 业务日一律东八区 00:00—24:00，禁止用容器本地时区或 substr(created_at,1,10) */
function dayKey(d = new Date()) {
  return chinaDayKey(d)
}

function deleteDrawsInChinaDay(db, userId, dk = dayKey()) {
  const [start, end] = chinaDayRangeUtc(dk)
  try {
    const r = db
      .prepare(`DELETE FROM lottery_draw WHERE user_id=? AND created_at >= ? AND created_at < ?`)
      .run(userId, start, end)
    return r && r.changes != null ? r.changes : 0
  } catch (e) {
    console.warn('[testAccount] reset draws', e && e.message)
    return 0
  }
}

function ensureSchema() {
  if (ready) return
  const d = dbMod.open()
  if (dbMod.DIALECT === 'mysql') {
    d.prepare(
      `CREATE TABLE IF NOT EXISTS user_test_sandbox (
        user_id INT NOT NULL PRIMARY KEY,
        enabled TINYINT NOT NULL DEFAULT 1,
        energy_granted INT NOT NULL DEFAULT 0,
        lottery_bonus INT NOT NULL DEFAULT 0,
        lottery_bonus_day VARCHAR(16) NOT NULL DEFAULT '',
        bypass_draw_limit TINYINT NOT NULL DEFAULT 0,
        bypass_energy_cost TINYINT NOT NULL DEFAULT 0,
        note VARCHAR(255) NOT NULL DEFAULT '',
        meta_json TEXT,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        KEY idx_test_enabled (enabled)
      )`
    ).run()
  } else {
    d.exec(`
      CREATE TABLE IF NOT EXISTS user_test_sandbox (
        user_id INTEGER NOT NULL PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        energy_granted INTEGER NOT NULL DEFAULT 0,
        lottery_bonus INTEGER NOT NULL DEFAULT 0,
        lottery_bonus_day TEXT NOT NULL DEFAULT '',
        bypass_draw_limit INTEGER NOT NULL DEFAULT 0,
        bypass_energy_cost INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        meta_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  }
  ready = true
}

function mapRow(row) {
  if (!row) return null
  const dk = dayKey()
  const bonusDay = String(row.lottery_bonus_day || '')
  const bonusActive = bonusDay === dk ? Number(row.lottery_bonus || 0) : 0
  let meta = {}
  try {
    meta = JSON.parse(row.meta_json || '{}') || {}
  } catch (_) {}
  return {
    userId: row.user_id,
    enabled: !!Number(row.enabled),
    energyGranted: Number(row.energy_granted || 0),
    lotteryBonus: Number(row.lottery_bonus || 0),
    lotteryBonusDay: bonusDay,
    lotteryBonusActive: bonusActive,
    bypassDrawLimit: !!Number(row.bypass_draw_limit),
    bypassEnergyCost: !!Number(row.bypass_energy_cost),
    note: row.note || '',
    meta,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

function getSandbox(userId) {
  if (!userId) return null
  ensureSchema()
  const row = dbMod
    .open()
    .prepare(`SELECT * FROM user_test_sandbox WHERE user_id=?`)
    .get(Number(userId))
  return mapRow(row)
}

/** 抽奖/配额用：仅 enabled 时生效 */
function activeSandbox(userId) {
  const s = getSandbox(userId)
  if (!s || !s.enabled) return null
  return s
}

/** C 端热路径：queryAsync，禁止 SyncGate */
async function getSandboxAsync(userId) {
  if (!userId) return null
  if (dbMod.DIALECT !== 'mysql') return getSandbox(userId)
  try {
    const [rows] = await dbMod.queryAsync(
      `SELECT * FROM user_test_sandbox WHERE user_id=? LIMIT 1`,
      [Number(userId)]
    )
    return mapRow(rows && rows[0])
  } catch (_) {
    return null
  }
}

async function activeSandboxAsync(userId) {
  const s = await getSandboxAsync(userId)
  if (!s || !s.enabled) return null
  return s
}

/**
 * 把沙箱叠加到日配额（规则页 / 开奖回包共用）。
 * bypass → 近似不限次；lotteryBonusActive → 正式上限 + 今日加次。
 */
function applySandboxQuota({ dailyLimit, todayUsed = 0, energyCost, sandbox }) {
  const baseLimit = Math.max(1, Number(dailyLimit) || 15)
  const used = Math.max(0, Number(todayUsed) || 0)
  const baseCost = Math.max(0, Number(energyCost) || 0)
  if (!sandbox || !sandbox.enabled) {
    return {
      dailyLimit: baseLimit,
      todayUsed: used,
      todayLeft: Math.max(0, baseLimit - used),
      energyCost: baseCost,
      testMode: false,
      bypassDrawLimit: false,
      bypassEnergyCost: false,
      lotteryBonusActive: 0,
    }
  }
  let lim = baseLimit
  if (sandbox.bypassDrawLimit) lim = Math.max(baseLimit, used + 999)
  else if (Number(sandbox.lotteryBonusActive) > 0) lim = baseLimit + Number(sandbox.lotteryBonusActive)
  const bypassEnergy = !!sandbox.bypassEnergyCost
  return {
    dailyLimit: lim,
    todayUsed: used,
    todayLeft: Math.max(0, lim - used),
    energyCost: bypassEnergy ? 0 : baseCost,
    testMode: true,
    bypassDrawLimit: !!sandbox.bypassDrawLimit,
    bypassEnergyCost: bypassEnergy,
    lotteryBonusActive: Number(sandbox.lotteryBonusActive) || 0,
  }
}

function listSandboxes() {
  ensureSchema()
  const d = dbMod.open()
  const rows = d
    .prepare(
      `SELECT s.*, u.nick_name, u.openid, u.invite_code, u.status AS user_status,
              w.energy
       FROM user_test_sandbox s
       LEFT JOIN user_account u ON u.id = s.user_id
       LEFT JOIN user_wallet w ON w.user_id = s.user_id
       ORDER BY s.updated_at DESC
       LIMIT 200`
    )
    .all()
  return rows.map((r) => ({
    ...mapRow(r),
    nickName: r.nick_name || '',
    openid: r.openid || '',
    inviteCode: r.invite_code || '',
    userStatus: r.user_status || '',
    energy: Number(r.energy || 0),
  }))
}

function mapSearchUser(u) {
  return {
    id: u.id,
    nickName: u.nick_name || '',
    openid: u.openid || '',
    inviteCode: u.invite_code || '',
    phone: u.phone || '',
    status: u.status || '',
    energy: Number(u.energy || 0),
    sandbox: getSandbox(u.id),
  }
}

/** 用户表搜索。纯数字按用户 ID（4 位以上再查手机号）；文字按昵称 / openid / 邀请码。空关键词=最近用户。 */
function searchUsers(q = '', limit = 30) {
  ensureSchema()
  const d = dbMod.open()
  const keyword = String(q || '').trim().slice(0, 32)
  const lim = Math.min(30, Math.max(1, Number(limit) || 20))
  const cols = `u.id, u.nick_name, u.openid, u.invite_code, u.status, w.energy`
  const from = `FROM user_account u LEFT JOIN user_wallet w ON w.user_id=u.id`
  if (!keyword) {
    return d
      .prepare(`SELECT ${cols} ${from} ORDER BY u.id DESC LIMIT ?`)
      .all(lim)
      .map(mapSearchUser)
  }
  if (/^\d+$/.test(keyword)) {
    const id = Number(keyword)
    const hit = d
      .prepare(`SELECT ${cols} ${from} WHERE u.id=? LIMIT 1`)
      .all(id)
      .map(mapSearchUser)
    if (hit.length || keyword.length < 4) return hit
    try {
      const ids = d
        .prepare(`SELECT DISTINCT user_id FROM user_address WHERE IFNULL(phone,'') LIKE ? LIMIT ?`)
        .all(`%${keyword}%`, lim)
        .map((r) => Number(r.user_id))
        .filter((n) => n > 0)
      if (!ids.length) return hit
      return d
        .prepare(
          `SELECT ${cols} ${from} WHERE u.id IN (${ids.map(() => '?').join(',')}) LIMIT ?`
        )
        .all(...ids, lim)
        .map(mapSearchUser)
    } catch (_) {
      return hit
    }
  }
  // 单字母英文太短；中文单字允许（如「微」）
  if (keyword.length < 2 && /^[\x00-\x7F]+$/.test(keyword)) return []
  const like = `%${keyword}%`
  try {
    return d
      .prepare(
        `SELECT ${cols} ${from}
         WHERE IFNULL(u.nick_name,'') LIKE ?
            OR IFNULL(u.openid,'') LIKE ?
            OR IFNULL(u.invite_code,'') LIKE ?
         ORDER BY u.id DESC LIMIT ?`
      )
      .all(like, like, like, lim)
      .map(mapSearchUser)
  } catch (e) {
    console.warn('[testAccount] searchUsers', e && e.message)
    return []
  }
}

function getDetail(userId) {
  ensureSchema()
  const uid = Number(userId)
  const d = dbMod.open()
  const u = d
    .prepare(
      `SELECT u.id, u.nick_name, u.openid, u.invite_code, u.status, u.created_at,
              w.energy
       FROM user_account u
       LEFT JOIN user_wallet w ON w.user_id=u.id
       WHERE u.id=?`
    )
    .get(uid)
  if (!u) return { ok: false, msg: '用户不存在' }
  let lotteryQuota = { dailyLimit: 15, todayUsed: 0, todayLeft: 15 }
  try {
    lotteryQuota = require('./lotteryService').lotteryQuotaForUser(uid)
  } catch (_) {}
  return {
    ok: true,
    user: {
      id: u.id,
      nickName: u.nick_name || '',
      openid: u.openid || '',
      inviteCode: u.invite_code || '',
      status: u.status || '',
      energy: Number(u.energy || 0),
      createdAt: u.created_at || '',
    },
    sandbox: getSandbox(uid),
    lotteryQuota,
  }
}

function upsertRow(userId, patch = {}) {
  ensureSchema()
  const d = dbMod.open()
  const uid = Number(userId)
  const now = dbMod.nowIso()
  const cur = d.prepare(`SELECT * FROM user_test_sandbox WHERE user_id=?`).get(uid)
  if (!cur) {
    d.prepare(
      `INSERT INTO user_test_sandbox
        (user_id, enabled, energy_granted, lottery_bonus, lottery_bonus_day,
         bypass_draw_limit, bypass_energy_cost, note, meta_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      uid,
      patch.enabled != null ? (patch.enabled ? 1 : 0) : 1,
      Number(patch.energy_granted || 0),
      Number(patch.lottery_bonus || 0),
      String(patch.lottery_bonus_day || ''),
      patch.bypass_draw_limit ? 1 : 0,
      patch.bypass_energy_cost ? 1 : 0,
      String(patch.note || '').slice(0, 255),
      JSON.stringify(patch.meta || {}),
      now,
      now
    )
  } else {
    d.prepare(
      `UPDATE user_test_sandbox SET
        enabled=?, energy_granted=?, lottery_bonus=?, lottery_bonus_day=?,
        bypass_draw_limit=?, bypass_energy_cost=?, note=?, meta_json=?, updated_at=?
       WHERE user_id=?`
    ).run(
      patch.enabled != null ? (patch.enabled ? 1 : 0) : cur.enabled,
      patch.energy_granted != null ? Number(patch.energy_granted) : cur.energy_granted,
      patch.lottery_bonus != null ? Number(patch.lottery_bonus) : cur.lottery_bonus,
      patch.lottery_bonus_day != null ? String(patch.lottery_bonus_day) : cur.lottery_bonus_day,
      patch.bypass_draw_limit != null ? (patch.bypass_draw_limit ? 1 : 0) : cur.bypass_draw_limit,
      patch.bypass_energy_cost != null ? (patch.bypass_energy_cost ? 1 : 0) : cur.bypass_energy_cost,
      patch.note != null ? String(patch.note).slice(0, 255) : cur.note,
      patch.meta != null ? JSON.stringify(patch.meta) : cur.meta_json || '{}',
      now,
      uid
    )
  }
  return getSandbox(uid)
}

/**
 * 启用并注入测试参数
 * body: {
 *   energyDelta?, lotteryBonusAdd?, bypassDrawLimit?, bypassEnergyCost?,
 *   resetTodayDraws?, note?
 * }
 */
function applyGrant(userId, body = {}) {
  ensureSchema()
  const uid = Number(userId)
  const d = dbMod.open()
  const user = d.prepare(`SELECT id FROM user_account WHERE id=?`).get(uid)
  if (!user) return { ok: false, msg: '用户不存在' }

  const currency = require('./currencyService')
  currency.ensureMerged(uid)

  const energyDelta = Math.floor(Number(body.energyDelta != null ? body.energyDelta : body.addEnergy) || 0)
  const lotteryBonusAdd = Math.max(
    0,
    Math.floor(Number(body.lotteryBonusAdd != null ? body.lotteryBonusAdd : body.addLottery) || 0)
  )
  const resetTodayDraws = !!body.resetTodayDraws
  const bypassDrawLimit =
    body.bypassDrawLimit != null ? !!body.bypassDrawLimit : body.bypass_draw_limit != null ? !!body.bypass_draw_limit : null
  const bypassEnergyCost =
    body.bypassEnergyCost != null
      ? !!body.bypassEnergyCost
      : body.bypass_energy_cost != null
        ? !!body.bypass_energy_cost
        : null
  const note = body.note != null ? String(body.note) : undefined

  const prev = getSandbox(uid) || {
    energyGranted: 0,
    lotteryBonus: 0,
    lotteryBonusDay: '',
    bypassDrawLimit: false,
    bypassEnergyCost: false,
    note: '',
  }

  if (energyDelta > 0) {
    currency.grantEnergy(uid, energyDelta, { note: 'test_sandbox_grant' })
  } else if (energyDelta < 0) {
    const bal = currency.walletEnergy(uid)
    const cut = Math.min(bal, Math.abs(energyDelta))
    if (cut > 0) currency.spendEnergy(uid, cut, { note: 'test_sandbox_adjust' })
  }

  let deletedDraws = 0
  const dk = dayKey()
  if (resetTodayDraws) {
    // created_at 是 UTC ISO；必须按东八区日区间删，禁止 substr(created_at,1,10)=北京日
    deletedDraws = deleteDrawsInChinaDay(d, uid, dk)
  }

  let nextBonus = prev.lotteryBonusDay === dk ? prev.lotteryBonus : 0
  nextBonus += lotteryBonusAdd

  const nextGranted = Math.max(0, prev.energyGranted + Math.max(0, energyDelta))

  const sandbox = upsertRow(uid, {
    enabled: true,
    energy_granted: nextGranted,
    lottery_bonus: nextBonus,
    lottery_bonus_day: dk,
    bypass_draw_limit: bypassDrawLimit != null ? bypassDrawLimit : prev.bypassDrawLimit,
    bypass_energy_cost: bypassEnergyCost != null ? bypassEnergyCost : prev.bypassEnergyCost,
    note: note != null ? note : prev.note,
  })

  return {
    ok: true,
    msg: '测试参数已写入',
    deletedDraws,
    energyDelta,
    lotteryBonusAdd,
    sandbox,
    ...getDetail(uid),
  }
}

/**
 * 清除测试数据：扣回沙箱发放的能量、清抽奖加成与旁路开关，可选清今日抽奖记录
 */
function clearSandbox(userId, body = {}) {
  ensureSchema()
  const uid = Number(userId)
  const d = dbMod.open()
  const cur = getSandbox(uid)
  if (!cur) return { ok: false, msg: '该用户无测试沙箱记录' }

  const currency = require('./currencyService')
  currency.ensureMerged(uid)

  let reclaimedEnergy = 0
  if (cur.energyGranted > 0) {
    const bal = currency.walletEnergy(uid)
    reclaimedEnergy = Math.min(bal, cur.energyGranted)
    if (reclaimedEnergy > 0) {
      currency.spendEnergy(uid, reclaimedEnergy, { note: 'test_sandbox_clear' })
    }
  }

  let deletedDraws = 0
  if (body.clearTodayDraws !== false) {
    deletedDraws = deleteDrawsInChinaDay(d, uid, dayKey())
  }

  const now = dbMod.nowIso()
  d.prepare(
    `UPDATE user_test_sandbox SET
      enabled=0, energy_granted=0, lottery_bonus=0, lottery_bonus_day='',
      bypass_draw_limit=0, bypass_energy_cost=0, updated_at=?
     WHERE user_id=?`
  ).run(now, uid)

  return {
    ok: true,
    msg: '测试数据已清除，账号恢复正式政策规则',
    reclaimedEnergy,
    deletedDraws,
    sandbox: getSandbox(uid),
    ...getDetail(uid),
  }
}

module.exports = {
  ensureSchema,
  dayKey,
  getSandbox,
  getSandboxAsync,
  activeSandbox,
  activeSandboxAsync,
  applySandboxQuota,
  listSandboxes,
  searchUsers,
  getDetail,
  applyGrant,
  clearSandbox,
}

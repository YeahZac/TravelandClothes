/**
 * P2：微信运动分档兑能量（防只走路打穿）
 * - 同步步数（真机 encryptedData 或 demo 上报）
 * - 按档领取；需当日已签到；日能量封顶
 */
const crypto = require('crypto')
const dbMod = require('../db')
const configService = require('./configService')

function dayKey(d = new Date()) {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

function ensureTables() {
  const d = dbMod.open()
  d.exec(`
    CREATE TABLE IF NOT EXISTS user_steps_day (
      user_id INTEGER NOT NULL,
      day_key TEXT NOT NULL,
      steps INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'report',
      claimed_json TEXT NOT NULL DEFAULT '[]',
      energy_claimed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, day_key)
    );
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

function stepsConfig() {
  const g = (configService.getPublished() || {}).game || {}
  const s = g.steps || {}
  const tiers = Array.isArray(s.tiers) && s.tiers.length
    ? s.tiers.map((t) => ({
        steps: Math.max(1, Number(t.steps) || 0),
        energy: Math.max(0, Number(t.energy) || 0),
      }))
    : [
        { steps: 3000, energy: 30 },
        { steps: 6000, energy: 80 },
        { steps: 10000, energy: 120 },
      ]
  const dailyMaxEnergy =
    Number(s.dailyMaxEnergy) > 0
      ? Number(s.dailyMaxEnergy)
      : tiers.reduce((sum, t) => sum + t.energy, 0)
  return {
    tiers: tiers.sort((a, b) => a.steps - b.steps),
    dailyMaxEnergy,
    maxReportSteps: Number(s.maxReportSteps) > 0 ? Number(s.maxReportSteps) : 30000,
    requireCheckin: s.requireCheckin !== false,
  }
}

function decryptWeRun(sessionKey, encryptedData, iv) {
  try {
    const key = Buffer.from(sessionKey, 'base64')
    const data = Buffer.from(encryptedData, 'base64')
    const ivBuf = Buffer.from(iv, 'base64')
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, ivBuf)
    decipher.setAutoPadding(true)
    let decoded = decipher.update(data, undefined, 'utf8')
    decoded += decipher.final('utf8')
    const obj = JSON.parse(decoded)
    const list = obj.stepInfoList || obj.stepInfo || []
    if (!Array.isArray(list) || !list.length) return null
    const today = dayKey()
    // WeChat timestamp is unix seconds for that day
    let best = 0
    list.forEach((row) => {
      const ts = Number(row.timestamp || row.time || 0)
      const day = ts > 1e12 ? dayKey(new Date(ts)) : dayKey(new Date(ts * 1000))
      if (day === today) best = Math.max(best, Number(row.step || row.steps || 0))
    })
    return best
  } catch (e) {
    return null
  }
}

function getRow(userId, dk = dayKey()) {
  ensureTables()
  const d = dbMod.open()
  return d.prepare('SELECT * FROM user_steps_day WHERE user_id=? AND day_key=?').get(userId, dk)
}

function hasCheckedInToday(userId, dk = dayKey()) {
  ensureTables()
  const d = dbMod.open()
  const c = d.prepare('SELECT 1 AS ok FROM user_checkin WHERE user_id=? AND day_key=?').get(userId, dk)
  if (c) return true
  const t = d
    .prepare(
      `SELECT 1 AS ok FROM task_completion WHERE user_id=? AND day_key=? AND task_id IN ('checkin','t_checkin')`
    )
    .get(userId, dk)
  return !!t
}

function status(userId) {
  ensureTables()
  const cfg = stepsConfig()
  const dk = dayKey()
  const row = getRow(userId, dk)
  const claimed = row ? JSON.parse(row.claimed_json || '[]') : []
  const steps = row ? row.steps : 0
  const tiers = cfg.tiers.map((t) => ({
    ...t,
    unlocked: steps >= t.steps,
    claimed: claimed.includes(t.steps),
  }))
  const claimable = tiers.filter((t) => t.unlocked && !t.claimed)
  const nextEnergy = claimable.reduce((s, t) => s + t.energy, 0)
  return {
    dayKey: dk,
    steps,
    source: row ? row.source : '',
    energyClaimed: row ? row.energy_claimed : 0,
    dailyMaxEnergy: cfg.dailyMaxEnergy,
    requireCheckin: cfg.requireCheckin,
    checkedIn: hasCheckedInToday(userId, dk),
    tiers,
    claimableEnergy: Math.min(
      nextEnergy,
      Math.max(0, cfg.dailyMaxEnergy - (row ? row.energy_claimed : 0))
    ),
  }
}

function sync(userId, body = {}) {
  ensureTables()
  const cfg = stepsConfig()
  const dk = dayKey()
  const d = dbMod.open()
  let user = d.prepare('SELECT id FROM user_account WHERE id=?').get(userId)
  try {
    const cols = d.prepare('PRAGMA table_info(user_account)').all().map((c) => c.name)
    if (!cols.includes('session_key')) {
      d.exec(`ALTER TABLE user_account ADD COLUMN session_key TEXT NOT NULL DEFAULT ''`)
    }
    user = d.prepare('SELECT id, session_key FROM user_account WHERE id=?').get(userId)
  } catch (e) {}
  let steps = null
  let source = 'report'

  if (body.encryptedData && body.iv) {
    const sk = (user && user.session_key) || body.sessionKey || ''
    if (!sk) {
      // 无 session_key 时允许开发态明文步数兜底
      if (body.steps != null && Number(body.steps) >= 0) {
        steps = Math.min(cfg.maxReportSteps, Math.floor(Number(body.steps)))
        source = 'report_fallback'
      } else {
        return { ok: false, msg: '请重新登录后再同步微信运动' }
      }
    } else {
      const decrypted = decryptWeRun(sk, body.encryptedData, body.iv)
      if (decrypted == null) return { ok: false, msg: '微信运动数据解密失败' }
      steps = Math.min(cfg.maxReportSteps, decrypted)
      source = 'werun'
    }
  } else if (body.steps != null) {
    steps = Math.min(cfg.maxReportSteps, Math.max(0, Math.floor(Number(body.steps))))
    source = body.source === 'werun_mock' ? 'werun_mock' : 'report'
  } else {
    return { ok: false, msg: '缺少步数或加密数据' }
  }

  const now = dbMod.nowIso()
  const cur = getRow(userId, dk)
  if (cur) {
    // 只升不降，防回写刷档
    const next = Math.max(cur.steps, steps)
    d.prepare(
      `UPDATE user_steps_day SET steps=?, source=?, updated_at=? WHERE user_id=? AND day_key=?`
    ).run(next, source, now, userId, dk)
  } else {
    d.prepare(
      `INSERT INTO user_steps_day (user_id, day_key, steps, source, claimed_json, energy_claimed, updated_at)
       VALUES (?,?,?,?, '[]', 0, ?)`
    ).run(userId, dk, steps, source, now)
  }
  return { ok: true, ...status(userId) }
}

function claim(userId, actionId = '') {
  ensureTables()
  const cfg = stepsConfig()
  const dk = dayKey()
  const d = dbMod.open()
  if (cfg.requireCheckin && !hasCheckedInToday(userId, dk)) {
    return { ok: false, msg: '先签到再兑步数 · 防刷步打穿' }
  }
  const st = status(userId)
  if (st.claimableEnergy <= 0) {
    return { ok: false, msg: st.steps <= 0 ? '请先同步今日步数' : '当前档位已领完' }
  }
  if (actionId) {
    const dup = d
      .prepare('SELECT id FROM jar_ledger WHERE user_id=? AND action_id=?')
      .get(userId, actionId)
    if (dup) return { ok: true, idempotent: true, ...status(userId) }
  }

  const row = getRow(userId, dk)
  const claimed = JSON.parse(row.claimed_json || '[]')
  let gain = 0
  const newly = []
  for (const t of cfg.tiers) {
    if (row.steps >= t.steps && !claimed.includes(t.steps)) {
      if (row.energy_claimed + gain + t.energy > cfg.dailyMaxEnergy) break
      claimed.push(t.steps)
      newly.push(t)
      gain += t.energy
    }
  }
  if (gain <= 0) return { ok: false, msg: '今日步数能量已达上限' }

  const now = dbMod.nowIso()
  const tx = d.transaction(() => {
    d.prepare(
      `UPDATE user_steps_day SET claimed_json=?, energy_claimed=energy_claimed+?, updated_at=?
       WHERE user_id=? AND day_key=?`
    ).run(JSON.stringify(claimed), gain, now, userId, dk)
    d.prepare(
      `UPDATE user_wallet SET energy=energy+?, updated_at=? WHERE user_id=?`
    ).run(gain, now, userId)
    if (actionId) {
      d.prepare(
        `INSERT INTO jar_ledger (user_id, action_id, action_type, delta_energy, delta_liquid, meta_json, created_at)
         VALUES (?,?,?,?,?,?,?)`
      ).run(userId, actionId, 'steps_claim', gain, 0, JSON.stringify({ tiers: newly }), now)
    }
    // 任务完成标记（幂等）
    try {
      d.prepare(
        `INSERT OR IGNORE INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
         VALUES (?,?,?,'done',?,?)`
      ).run(userId, 'steps', dk, JSON.stringify({ energy: gain }), now)
    } catch (e) {}
  })
  tx()
  return {
    ok: true,
    msg: `步数兑换 · 能量 +${gain}`,
    reward: { energy: gain, tiers: newly },
    ...status(userId),
  }
}

module.exports = {
  status,
  sync,
  claim,
  stepsConfig,
  hasCheckedInToday,
  dayKey,
  ensureTables,
}

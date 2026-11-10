/**
 * 步数兑能量：微信运动 / 开发态上报；档位后台可配；仅当日可领
 */
const crypto = require('crypto')
const dbMod = require('../db')
const configService = require('./configService')

function dayKey(d = new Date()) {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

function shiftDay(dk, delta) {
  const [y, m, d] = String(dk).split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  return dayKey(dt)
}

function ensureTables() {
  const d = dbMod.open()
  if (dbMod.DIALECT === 'mysql') {
    d.prepare(
      `CREATE TABLE IF NOT EXISTS user_steps_day (
        user_id INT NOT NULL,
        day_key VARCHAR(16) NOT NULL,
        steps INT NOT NULL DEFAULT 0,
        source VARCHAR(32) NOT NULL DEFAULT 'report',
        claimed_json VARCHAR(512) NOT NULL DEFAULT '[]',
        energy_claimed INT NOT NULL DEFAULT 0,
        updated_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (user_id, day_key)
      )`
    ).run()
    d.prepare(
      `CREATE TABLE IF NOT EXISTS user_checkin (
        user_id INT NOT NULL,
        day_key VARCHAR(16) NOT NULL,
        streak INT NOT NULL DEFAULT 1,
        reward_json VARCHAR(512) NOT NULL DEFAULT '{}',
        source VARCHAR(32) NOT NULL DEFAULT 'checkin',
        created_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (user_id, day_key)
      )`
    ).run()
  } else {
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
}

function stepsConfig() {
  const g = (configService.getPublished() || {}).game || {}
  const s = g.steps || {}
  const tiers = Array.isArray(s.tiers) && s.tiers.length
    ? s.tiers
        .map((t) => ({
          steps: Math.max(1, Number(t.steps) || 0),
          energy: Math.max(0, Number(t.energy) || 0),
        }))
        .filter((t) => t.steps > 0)
    : [
        { steps: 3000, energy: 30 },
        { steps: 6000, energy: 80 },
        { steps: 10000, energy: 120 },
      ]
  const sorted = tiers.sort((a, b) => a.steps - b.steps)
  const dailyMaxEnergy =
    Number(s.dailyMaxEnergy) > 0
      ? Number(s.dailyMaxEnergy)
      : sorted.reduce((sum, t) => sum + t.energy, 0)
  return {
    tiers: sorted,
    dailyMaxEnergy,
    maxReportSteps: Number(s.maxReportSteps) > 0 ? Number(s.maxReportSteps) : 30000,
    requireCheckin: s.requireCheckin !== false,
    primaryTierSteps:
      Number(s.primaryTierSteps) > 0 ? Number(s.primaryTierSteps) : sorted[1] ? sorted[1].steps : sorted[0].steps,
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
  return dbMod.open().prepare('SELECT * FROM user_steps_day WHERE user_id=? AND day_key=?').get(userId, dk)
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

function progressFor(steps, cfg, claimed) {
  const next = cfg.tiers.find((t) => steps < t.steps || !claimed.includes(t.steps))
  const target = next ? next.steps : cfg.tiers[cfg.tiers.length - 1].steps
  const pct = target > 0 ? Math.min(100, Math.round((Math.max(0, steps) / target) * 100)) : 0
  const reachedPrimary = steps >= cfg.primaryTierSteps
  return {
    progressPct: pct,
    progressTarget: target,
    primaryTierSteps: cfg.primaryTierSteps,
    reachedPrimary,
    tierLabel: reachedPrimary
      ? `已达 ${cfg.primaryTierSteps} 档`
      : `目标 ${cfg.primaryTierSteps} 步`,
  }
}

function daySummary(userId, dk, cfg) {
  const row = getRow(userId, dk)
  const steps = row ? Number(row.steps || 0) : 0
  const claimed = row ? JSON.parse(row.claimed_json || '[]') : []
  const energyClaimed = row ? Number(row.energy_claimed || 0) : 0
  const reached = cfg.tiers.some((t) => steps >= t.steps)
  const allClaimed =
    reached && cfg.tiers.filter((t) => steps >= t.steps).every((t) => claimed.includes(t.steps))
  return {
    dayKey: dk,
    weekday: ['日', '一', '二', '三', '四', '五', '六'][new Date(dk.replace(/-/g, '/')).getDay()],
    steps,
    source: row ? row.source : '',
    energyClaimed,
    claimedTiers: claimed,
    reached,
    claimed: energyClaimed > 0 || allClaimed,
    isToday: dk === dayKey(),
  }
}

function weekStatus(userId, cfg) {
  const today = dayKey()
  const days = []
  for (let i = 6; i >= 0; i--) {
    days.push(daySummary(userId, shiftDay(today, -i), cfg))
  }
  return days
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
  const energyClaimed = row ? row.energy_claimed : 0
  const claimableEnergy = Math.min(nextEnergy, Math.max(0, cfg.dailyMaxEnergy - energyClaimed))
  const prog = progressFor(steps, cfg, claimed)
  const todayClaimed = energyClaimed > 0 || (claimableEnergy <= 0 && tiers.some((t) => t.unlocked && t.claimed))
  let cta = '兑换'
  if (claimableEnergy > 0) cta = '领取'
  else if (todayClaimed) cta = '领取历史'

  return {
    dayKey: dk,
    steps,
    source: row ? row.source : '',
    energyClaimed,
    dailyMaxEnergy: cfg.dailyMaxEnergy,
    requireCheckin: cfg.requireCheckin,
    checkedIn: hasCheckedInToday(userId, dk),
    tiers,
    claimableEnergy,
    cta,
    canClaimToday: claimableEnergy > 0,
    todayClaimed,
    week: weekStatus(userId, cfg),
    ...prog,
  }
}

function history(userId, { days = 30 } = {}) {
  ensureTables()
  const cfg = stepsConfig()
  const today = dayKey()
  const n = Math.min(60, Math.max(7, Number(days) || 30))
  const list = []
  for (let i = 0; i < n; i++) {
    const dk = shiftDay(today, -i)
    const s = daySummary(userId, dk, cfg)
    const tiers = cfg.tiers.map((t) => ({
      ...t,
      unlocked: s.steps >= t.steps,
      claimed: s.claimedTiers.includes(t.steps),
    }))
    list.push({
      ...s,
      tiers,
      rewardText: s.energyClaimed > 0 ? `已领 +${s.energyClaimed} 能量值` : s.reached ? '达标未领（仅当日可领）' : '未达标',
    })
  }
  return { list, tiers: cfg.tiers, primaryTierSteps: cfg.primaryTierSteps }
}

function sync(userId, body = {}) {
  ensureTables()
  const cfg = stepsConfig()
  const dk = dayKey()
  const d = dbMod.open()
  let user = d.prepare('SELECT id FROM user_account WHERE id=?').get(userId)
  try {
    dbMod.addColumnIfMissing(
      d,
      'user_account',
      'session_key',
      `VARCHAR(128) NOT NULL DEFAULT ''`,
      `TEXT NOT NULL DEFAULT ''`
    )
    user = d.prepare('SELECT id, session_key FROM user_account WHERE id=?').get(userId)
  } catch (e) {}
  let steps = null
  let source = 'report'

  if (body.encryptedData && body.iv) {
    const sk = (user && user.session_key) || body.sessionKey || ''
    if (!sk) {
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
      // iOS 健康步数经微信运动同步后仍走 werun；前端 sourceHint 可标注 healthkit
      source = body.source === 'healthkit' || body.source === 'werun_health' ? 'werun_health' : 'werun'
    }
  } else if (body.steps != null) {
    steps = Math.min(cfg.maxReportSteps, Math.max(0, Math.floor(Number(body.steps))))
    source =
      body.source === 'werun_mock'
        ? 'werun_mock'
        : body.source === 'healthkit'
          ? 'healthkit_dev'
          : 'report'
  } else {
    return { ok: false, msg: '缺少步数或加密数据' }
  }

  const now = dbMod.nowIso()
  const cur = getRow(userId, dk)
  if (cur) {
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
    return { ok: false, msg: st.steps <= 0 ? '请先同步今日步数' : '当前档位已领完或仅可领当日' }
  }
  if (actionId) {
    const dup = d.prepare('SELECT id FROM jar_ledger WHERE user_id=? AND action_id=?').get(userId, actionId)
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
    d.prepare(`UPDATE user_wallet SET energy=energy+?, updated_at=? WHERE user_id=?`).run(
      gain,
      now,
      userId
    )
    if (actionId) {
      try {
        d.prepare(
          `INSERT INTO jar_ledger (user_id, action_id, action_type, delta_energy, delta_liquid, meta_json, created_at)
           VALUES (?,?,?,?,?,?,?)`
        ).run(userId, actionId, 'steps_claim', gain, 0, JSON.stringify({ tiers: newly }), now)
      } catch (e) {}
    }
    try {
      if (dbMod.DIALECT === 'mysql') {
        d.prepare(
          `INSERT IGNORE INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
           VALUES (?,?,?,'done',?,?)`
        ).run(userId, 'steps', dk, JSON.stringify({ energy: gain }), now)
      } else {
        d.prepare(
          `INSERT OR IGNORE INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
           VALUES (?,?,?,'done',?,?)`
        ).run(userId, 'steps', dk, JSON.stringify({ energy: gain }), now)
      }
    } catch (e) {}
  })
  tx()
  try {
    require('./currencyService').ensureMerged(userId)
  } catch (e) {}
  const wallet = d.prepare('SELECT energy, points, coins FROM user_wallet WHERE user_id=?').get(userId)
  return {
    ok: true,
    msg: `步数兑换 · 能量值 +${gain}`,
    reward: { energy: gain, tiers: newly },
    wallet: wallet
      ? { energy: wallet.energy, points: wallet.energy, coins: wallet.coins }
      : undefined,
    ...status(userId),
  }
}

module.exports = {
  status,
  sync,
  claim,
  history,
  stepsConfig,
  hasCheckedInToday,
  dayKey,
  ensureTables,
}

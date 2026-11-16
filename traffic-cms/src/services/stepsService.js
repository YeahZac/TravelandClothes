/**
 * 步数兑能量：微信运动 / 开发态上报；档位后台可配；仅当日可领
 */
const crypto = require('crypto')
const dbMod = require('../db')
const configService = require('./configService')

/** 业务日一律按 Asia/Shanghai，避免云托管 UTC 把「今日步数」算错天 */
function dayKey(d = new Date()) {
  const x = typeof d === 'string' ? new Date(d) : d instanceof Date ? d : new Date()
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(x)
    const y = (parts.find((p) => p.type === 'year') || {}).value
    const m = (parts.find((p) => p.type === 'month') || {}).value
    const day = (parts.find((p) => p.type === 'day') || {}).value
    if (y && m && day) return `${y}-${m}-${day}`
  } catch (_) {}
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

function shiftDay(dk, delta) {
  const [y, m, d] = String(dk).split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  return dayKey(dt)
}

let stepsTablesReady = false
function ensureTables() {
  if (stepsTablesReady) return
  if (dbMod.DIALECT === 'mysql') {
    stepsTablesReady = true
    return
  }
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
  stepsTablesReady = true
}

function productMeta(productId) {
  const id = String(productId || '').trim()
  if (!id) return { name: '', imageUrl: '' }
  try {
    const pub = configService.getPublished() || {}
    const products = (pub.catalog && pub.catalog.products) || []
    const hit = products.find((p) => String(p.id || p.productId || '') === id)
    if (hit) {
      return {
        name: String(hit.name || hit.title || '').trim(),
        imageUrl: String(hit.imageUrl || hit.coverUrl || hit.thumbUrl || '').trim(),
      }
    }
  } catch (_) {}
  return { name: '', imageUrl: '' }
}

/** energy | physical | both */
function normalizeRewardType(raw) {
  const s = String(raw || '').toLowerCase().trim()
  if (s === 'physical' || s === 'gift' || s === 'product') return 'physical'
  if (s === 'both' || s === 'all' || s === 'energy_physical' || s === 'energy+physical') return 'both'
  return 'energy'
}

function tierGivesEnergy(t) {
  const rt = normalizeRewardType(t && t.rewardType)
  return (rt === 'energy' || rt === 'both') && Number(t && t.energy) > 0
}

function tierGivesPhysical(t) {
  const rt = normalizeRewardType(t && t.rewardType)
  return (rt === 'physical' || rt === 'both') && !!(t && t.productId)
}

function enrichPhysicalTier(tiers) {
  return (tiers || []).map((t) => {
    if (!tierGivesPhysical(t)) return { ...t, rewardType: normalizeRewardType(t.rewardType) }
    const meta = productMeta(t.productId)
    return {
      ...t,
      rewardType: normalizeRewardType(t.rewardType),
      productName: t.label || meta.name || `达标${t.steps}步礼品`,
      productImageUrl: meta.imageUrl || '',
    }
  })
}

function stepsConfig() {
  const g = (configService.getPublished() || {}).game || {}
  const s = g.steps || {}
  const tiers = Array.isArray(s.tiers) && s.tiers.length
    ? s.tiers
        .map((t) => {
          const rewardType = normalizeRewardType(t.rewardType || t.reward_type)
          return {
            steps: Math.max(1, Number(t.steps) || 0),
            energy: Math.max(0, Number(t.energy) || 0),
            rewardType,
            productId: String(t.productId || t.product_id || '').trim(),
            label: String(t.label || '').trim(),
          }
        })
        .filter((t) => t.steps > 0)
    : [
        { steps: 3000, energy: 30, rewardType: 'energy', productId: '', label: '' },
        { steps: 6000, energy: 80, rewardType: 'energy', productId: '', label: '' },
        { steps: 10000, energy: 120, rewardType: 'energy', productId: '', label: '' },
      ]
  const sorted = enrichPhysicalTier(tiers.sort((a, b) => a.steps - b.steps))
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
    let latestTs = 0
    let latestSteps = 0
    list.forEach((row) => {
      const ts = Number(row.timestamp || row.time || 0)
      const ms = ts > 1e12 ? ts : ts * 1000
      const day = dayKey(new Date(ms))
      const n = Math.max(0, Number(row.step != null ? row.step : row.steps) || 0)
      if (day === today) best = Math.max(best, n)
      if (ms >= latestTs) {
        latestTs = ms
        latestSteps = n
      }
    })
    // 微信文档：列表末项通常为今日；时区/边界日兜底取最新一条
    if (best <= 0 && latestTs > 0) return latestSteps
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

/** 下一未领档位奖励（能量 / 实物 / 同时，不虚构礼物） */
function buildNextTier(cfg, claimed, steps) {
  const nextOpen = (cfg.tiers || []).find((t) => !claimed.includes(t.steps))
  if (!nextOpen) return null
  const rewardType = normalizeRewardType(nextOpen.rewardType)
  const gift = tierGivesPhysical(nextOpen)
    ? {
        productId: nextOpen.productId,
        name: nextOpen.productName || nextOpen.label || `达标${nextOpen.steps}步礼品`,
        imageUrl: nextOpen.productImageUrl || '',
      }
    : null
  const energy = tierGivesEnergy(nextOpen) ? Math.max(0, Number(nextOpen.energy) || 0) : 0
  const needSteps = Math.max(0, nextOpen.steps - Math.max(0, steps))
  return {
    steps: nextOpen.steps,
    needSteps,
    rewardType,
    energy,
    gift,
    unlocked: steps >= nextOpen.steps,
  }
}

function progressFor(steps, cfg, claimed, claimableEnergy = 0, claimablePhysical = []) {
  const nextTier = buildNextTier(cfg, claimed, steps)
  const last = cfg.tiers[cfg.tiers.length - 1] || { steps: cfg.primaryTierSteps || 3000, energy: 0 }
  const target = nextTier ? nextTier.steps : last.steps
  const needSteps = nextTier ? nextTier.needSteps : 0
  const pct = target > 0 ? Math.min(100, Math.round((Math.max(0, steps) / target) * 100)) : 0
  const reachedPrimary = steps >= cfg.primaryTierSteps

  // 展示奖励：可领时用可领内容；否则用下一档真实奖励
  const giftsNow = (claimablePhysical || []).filter((t) => t && (t.productId || t.name))
  const showEnergy =
    claimableEnergy > 0
      ? claimableEnergy
      : nextTier && nextTier.energy > 0
        ? nextTier.energy
        : 0
  const showGift =
    giftsNow.length > 0
      ? {
          productId: giftsNow[0].productId || '',
          name: giftsNow[0].name || giftsNow[0].label || '',
          imageUrl: giftsNow[0].imageUrl || giftsNow[0].productImageUrl || '',
        }
      : nextTier && nextTier.gift
        ? nextTier.gift
        : null

  let tierLabel = ''
  if (claimableEnergy > 0 || giftsNow.length) {
    const parts = []
    if (claimableEnergy > 0) parts.push(`+${claimableEnergy} 能量值`)
    if (giftsNow[0] && giftsNow[0].name) parts.push(giftsNow[0].name)
    tierLabel = `已达标 · 可领 ${parts.join(' / ')}`
  } else if (!nextTier) {
    tierLabel = '今日档位已领完'
  } else {
    const rewardParts = []
    if (nextTier.energy > 0) rewardParts.push(`+${nextTier.energy} 能量值`)
    if (nextTier.gift && nextTier.gift.name) rewardParts.push(nextTier.gift.name)
    const rewardText = rewardParts.join(' / ') || '奖励'
    if (needSteps > 0) {
      tierLabel = `还差 ${needSteps} 步到 ${nextTier.steps} · 可领 ${rewardText}`
    } else {
      tierLabel = `已达 ${nextTier.steps} 步 · 可领 ${rewardText}`
    }
  }

  return {
    progressPct: pct,
    progressTarget: target,
    progressTargetEnergy: showEnergy,
    progressTargetGift: showGift,
    nextTier,
    needSteps,
    primaryTierSteps: cfg.primaryTierSteps,
    reachedPrimary,
    tierLabel,
    allTiersDone: !nextTier,
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
  const nextEnergy = claimable.filter((t) => tierGivesEnergy(t)).reduce((s, t) => s + Number(t.energy || 0), 0)
  const energyClaimed = row ? row.energy_claimed : 0
  const claimableEnergy = Math.min(nextEnergy, Math.max(0, cfg.dailyMaxEnergy - energyClaimed))
  const claimablePhysicalRaw = claimable.filter((t) => tierGivesPhysical(t))
  const claimablePhysical = claimablePhysicalRaw.map((t) => ({
    steps: t.steps,
    productId: t.productId,
    label: t.productName || t.label || `达标${t.steps}步礼品`,
    name: t.productName || t.label || `达标${t.steps}步礼品`,
    imageUrl: t.productImageUrl || '',
  }))
  const checkedIn = hasCheckedInToday(userId, dk)
  const prog = progressFor(steps, cfg, claimed, claimableEnergy, claimablePhysical)
  const canClaimToday = claimableEnergy > 0 || claimablePhysical.length > 0
  const todayClaimed =
    !canClaimToday &&
    (energyClaimed > 0 || tiers.some((t) => t.unlocked && t.claimed))
  const allDone =
    !canClaimToday && cfg.tiers.every((t) => claimed.includes(t.steps) || steps < t.steps) && todayClaimed
  let cta = '同步'
  if (canClaimToday) {
    if (cfg.requireCheckin && !checkedIn) cta = '先签到'
    else if (claimableEnergy > 0 && claimablePhysical.length) cta = `领 +${claimableEnergy}·礼品`
    else if (claimableEnergy > 0) cta = `领 +${claimableEnergy}`
    else cta = '领礼品'
  } else if (allDone || todayClaimed || prog.allTiersDone) cta = '已领取'
  else if (steps > 0) cta = '再走走'

  return {
    dayKey: dk,
    steps,
    source: row ? row.source : '',
    energyClaimed,
    dailyMaxEnergy: cfg.dailyMaxEnergy,
    requireCheckin: cfg.requireCheckin,
    checkedIn,
    tiers,
    claimableEnergy,
    claimablePhysical,
    cta,
    canClaimToday,
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
        return { ok: false, msg: '请重新登录后再同步微信运动', needRelogin: true }
      }
    } else {
      const decrypted = decryptWeRun(sk, body.encryptedData, body.iv)
      if (decrypted == null) return { ok: false, msg: '微信运动数据解密失败', needRelogin: true }
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
  if (!st.canClaimToday) {
    return { ok: false, msg: st.steps <= 0 ? '请先同步今日步数' : '当前档位已领完或仅可领当日' }
  }
  if (actionId) {
    const dup = d.prepare('SELECT id FROM jar_ledger WHERE user_id=? AND action_id=?').get(userId, actionId)
    if (dup) return { ok: true, idempotent: true, ...status(userId) }
  }

  const row = getRow(userId, dk)
  const prevClaimedJson = row.claimed_json || '[]'
  const prevEnergyClaimed = Number(row.energy_claimed) || 0
  const claimed = JSON.parse(prevClaimedJson)
  let gain = 0
  const newly = []
  const physicalPending = []
  const energyGrantedSteps = new Set()
  for (const t of cfg.tiers) {
    if (row.steps < t.steps || claimed.includes(t.steps)) continue
    const wantPhys = tierGivesPhysical(t)
    const wantEnergy = tierGivesEnergy(t)
    let energyOk = false
    if (wantEnergy) {
      if (row.energy_claimed + gain + t.energy > cfg.dailyMaxEnergy) {
        if (!wantPhys) break
      } else {
        gain += t.energy
        energyOk = true
        energyGrantedSteps.add(t.steps)
      }
    }
    if (wantPhys) {
      physicalPending.push(t)
      continue
    }
    if (energyOk) {
      claimed.push(t.steps)
      newly.push(t)
    }
  }

  if (gain <= 0 && !physicalPending.length) {
    return { ok: false, msg: '今日步数奖励已达上限' }
  }

  // 能量档 + 实物档一次性抢占（CAS）：并发的第二个请求读到的是旧 claimed_json，条件不成立直接失败
  const reserved = claimed.concat(physicalPending.map((t) => t.steps))
  const now = dbMod.nowIso()
  let conflict = false
  const tx = d.transaction(() => {
    const tdb = dbMod.open()
    const cas = tdb
      .prepare(
        `UPDATE user_steps_day SET claimed_json=?, energy_claimed=energy_claimed+?, updated_at=?
         WHERE user_id=? AND day_key=? AND IFNULL(claimed_json,'[]')=? AND energy_claimed=?`
      )
      .run(JSON.stringify(reserved), gain, now, userId, dk, prevClaimedJson, prevEnergyClaimed)
    if (!cas || !cas.changes) {
      conflict = true
      return
    }
    if (gain > 0) {
      tdb.prepare(`UPDATE user_wallet SET energy=energy+?, updated_at=? WHERE user_id=?`).run(
        gain,
        now,
        userId
      )
    }
    if (actionId) {
      try {
        tdb.prepare(
          `INSERT INTO jar_ledger (user_id, action_id, action_type, delta_energy, delta_liquid, meta_json, created_at)
           VALUES (?,?,?,?,?,?,?)`
        ).run(userId, actionId, 'steps_claim', gain, 0, JSON.stringify({ tiers: newly }), now)
      } catch (e) {}
    }
  })
  tx()
  if (conflict) return { ok: false, msg: '正在领取中，请勿重复点击' }

  // 实物：发「中奖凭证」让用户填地址兑奖（与签到/抽奖一致），不再静默建无地址订单
  const physicalClaims = []
  const physicalClaimTokens = []
  const releaseSteps = []
  for (const hit of physicalPending) {
    try {
      const claim = require('./lotteryService').grantActivityPhysicalClaim({
        userId,
        source: 'steps',
        sourceKey: `${dk}_${hit.steps}`,
        productId: hit.productId,
        prizeName: hit.productName || hit.label || `步数达标${hit.steps}礼品`,
        actionId: `steps_gift_${userId}_${dk}_${hit.steps}`,
      })
      if (claim && claim.ok && (claim.claimToken || claim.claimStatus === 'used')) {
        newly.push(hit)
        physicalClaims.push(hit)
        if (claim.claimToken) {
          physicalClaimTokens.push({
            steps: hit.steps,
            productId: claim.productId || hit.productId,
            claimToken: claim.claimToken,
          })
        }
      } else {
        releaseSteps.push(hit.steps)
        console.warn('[steps] physical claim', claim && claim.msg)
      }
    } catch (e) {
      releaseSteps.push(hit.steps)
      console.warn('[steps] physical claim', e && e.message)
    }
  }
  if (releaseSteps.length) {
    try {
      // both 档若能量已发放：保留 claimed，避免释放后重复领能量；纯实物失败才释放可重试
      const cur = getRow(userId, dk)
      const kept = JSON.parse(cur.claimed_json || '[]').filter(
        (s) => !releaseSteps.includes(s) || energyGrantedSteps.has(s)
      )
      d.prepare(`UPDATE user_steps_day SET claimed_json=?, updated_at=? WHERE user_id=? AND day_key=?`).run(
        JSON.stringify(kept),
        dbMod.nowIso(),
        userId,
        dk
      )
    } catch (e) {
      console.warn('[steps] release physical tiers', e && e.message)
    }
  }

  if (gain <= 0 && !physicalClaims.length) {
    return { ok: false, msg: '礼品凭证发放失败，请稍后重试或联系客服' }
  }

  try {
    const sql =
      dbMod.DIALECT === 'mysql'
        ? `INSERT IGNORE INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
           VALUES (?,?,?,'done',?,?)`
        : `INSERT OR IGNORE INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
           VALUES (?,?,?,'done',?,?)`
    d.prepare(sql).run(userId, 'steps', dk, JSON.stringify({ energy: gain, physical: physicalClaims }), now)
  } catch (e) {}

  try {
    require('./currencyService').ensureMerged(userId)
  } catch (e) {}
  const wallet = d.prepare('SELECT energy, points, coins FROM user_wallet WHERE user_id=?').get(userId)
  const parts = []
  if (gain > 0) parts.push(`能量值 +${gain}`)
  if (physicalClaimTokens.length) parts.push('礼品请到中奖记录兑奖')
  else if (physicalClaims.length) parts.push('礼品已登记')
  return {
    ok: true,
    msg: `步数兑换 · ${parts.join(' · ') || '已领取'}`,
    reward: {
      energy: gain,
      tiers: newly,
      physical: physicalClaims.map((t) => ({ steps: t.steps, productId: t.productId })),
    },
    claimToken: (physicalClaimTokens[0] && physicalClaimTokens[0].claimToken) || '',
    productId: (physicalClaimTokens[0] && physicalClaimTokens[0].productId) || '',
    physicalClaims: physicalClaimTokens,
    wallet: wallet
      ? { energy: wallet.energy, points: wallet.energy, coins: wallet.coins }
      : undefined,
    ...status(userId),
  }
}

module.exports = {
  status,
  sync,
  claim: (userId, actionId) =>
    require('./userLock').withUserLock('steps_claim', userId, () => claim(userId, actionId)),
  history,
  stepsConfig,
  hasCheckedInToday,
  dayKey,
  shiftDay,
  ensureTables,
}

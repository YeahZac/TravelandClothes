/**
 * P2：订阅消息出站 —— 授权入库后，到点「可收 / 虫害告急」入队并 flush（mock 发送）
 * 真机接微信 subscribeMessage.send 时替换 deliverOne 即可。
 */
const dbMod = require('../db')
const configService = require('./configService')

function ensureTables() {
  dbMod.open().exec(`
    CREATE TABLE IF NOT EXISTS subscribe_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tmpl_key TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      ready_at INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT,
      created_at TEXT NOT NULL
    );
  `)
}

function tmplConfig() {
  const g = ((configService.getPublished() || {}).game || {}).subscribe || {}
  return {
    enabled: g.enabled !== false,
    tmplIds: g.tmplIds || {
      harvestReady: 'TMPL_HARVEST_READY_PLACEHOLDER',
      eventCritical: 'TMPL_EVENT_CRITICAL_PLACEHOLDER',
    },
  }
}

function hasGrant(userId, tmplKey) {
  const row = dbMod
    .open()
    .prepare(
      `SELECT status FROM subscribe_grant WHERE user_id=? AND tmpl_key=? ORDER BY id DESC LIMIT 1`
    )
    .get(userId, tmplKey)
  return row && row.status === 'accept'
}

/** 入队：同一用户同一 tmpl_key 仅保留一条 pending */
function enqueue(userId, tmplKey, payload = {}, readyAt = Date.now()) {
  ensureTables()
  if (!tmplConfig().enabled) return { ok: false, msg: '订阅关闭' }
  if (!hasGrant(userId, tmplKey)) return { ok: false, msg: '用户未授权该模板' }
  const d = dbMod.open()
  const now = dbMod.nowIso()
  const pending = d
    .prepare(
      `SELECT id FROM subscribe_outbox WHERE user_id=? AND tmpl_key=? AND status='pending'`
    )
    .get(userId, tmplKey)
  if (pending) {
    d.prepare(
      `UPDATE subscribe_outbox SET payload_json=?, ready_at=?, created_at=? WHERE id=?`
    ).run(JSON.stringify(payload), readyAt, now, pending.id)
    return { ok: true, id: pending.id, updated: true }
  }
  const info = d
    .prepare(
      `INSERT INTO subscribe_outbox (user_id, tmpl_key, payload_json, status, ready_at, created_at)
       VALUES (?,?,?,'pending',?,?)`
    )
    .run(userId, tmplKey, JSON.stringify(payload), readyAt, now)
  return { ok: true, id: info.lastInsertRowid }
}

/** 根据罐状态调度：可收 → harvestReady；虫害临近 → eventCritical */
function scheduleFromJar(userId, jarState) {
  if (!jarState) return { ok: true, scheduled: [] }
  const scheduled = []
  if (jarState.pending > 0) {
    const r = enqueue(
      userId,
      'harvestReady',
      {
        title: '能量可以收啦',
        amount: jarState.pending,
        tip: '打开小程序点一下气泡',
      },
      Date.now()
    )
    if (r.ok) scheduled.push('harvestReady')
  } else if (jarState.nextHarvestAt) {
    // 产出到点前提醒
    const r = enqueue(
      userId,
      'harvestReady',
      { title: '能量即将成熟', tip: '回来收取别浪费' },
      Number(jarState.nextHarvestAt)
    )
    if (r.ok) scheduled.push('harvestReady')
  }
  if (jarState.event && jarState.event.penaltyAt) {
    const warnAt = Math.max(Date.now(), Number(jarState.event.penaltyAt) - 60 * 60 * 1000)
    const r = enqueue(
      userId,
      'eventCritical',
      {
        title: jarState.event.type === 'pest' ? '罐子闹虫害了' : '罐子快干了',
        tip: '快回来处理，否则扣能量',
        penaltyAt: jarState.event.penaltyAt,
      },
      warnAt
    )
    if (r.ok) scheduled.push('eventCritical')
  }
  return { ok: true, scheduled }
}

function deliverOne(row) {
  const cfg = tmplConfig()
  const tmplId = (cfg.tmplIds && cfg.tmplIds[row.tmpl_key]) || ''
  const isPlaceholder = String(tmplId).includes('PLACEHOLDER') || !tmplId
  // 生产：调用微信 subscribeMessage.send；此处 mock 记日志
  const payload = {
    touser: row.user_id,
    template_id: tmplId,
    page: 'pages/index/index',
    data: JSON.parse(row.payload_json || '{}'),
    mock: isPlaceholder,
  }
  console.log('[subscribe] deliver', JSON.stringify(payload))
  return { ok: true, mock: isPlaceholder, payload }
}

function flush({ limit = 50 } = {}) {
  ensureTables()
  const d = dbMod.open()
  const now = Date.now()
  const rows = d
    .prepare(
      `SELECT * FROM subscribe_outbox
       WHERE status='pending' AND ready_at<=?
       ORDER BY id ASC LIMIT ?`
    )
    .all(now, limit)
  const results = []
  const sentAt = dbMod.nowIso()
  rows.forEach((row) => {
    const r = deliverOne(row)
    d.prepare(`UPDATE subscribe_outbox SET status='sent', sent_at=? WHERE id=?`).run(sentAt, row.id)
    results.push({ id: row.id, tmplKey: row.tmpl_key, userId: row.user_id, ...r })
  })
  return { ok: true, sent: results.length, results }
}

function outboxStats() {
  ensureTables()
  const d = dbMod.open()
  const rows = d
    .prepare(`SELECT status, COUNT(*) AS n FROM subscribe_outbox GROUP BY status`)
    .all()
  const map = { pending: 0, sent: 0 }
  rows.forEach((r) => {
    map[r.status] = r.n
  })
  return map
}

module.exports = {
  enqueue,
  scheduleFromJar,
  flush,
  outboxStats,
  hasGrant,
  ensureTables,
  tmplConfig,
}

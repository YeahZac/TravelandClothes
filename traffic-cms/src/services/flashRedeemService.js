/**
 * 准点兑换：多时段配置 + 日库存 + 兑换记录
 */
const dbMod = require('../db')

function db() {
  return dbMod.open()
}
function now() {
  return dbMod.nowIso()
}

/** 绑定 SKU 的展示信息：图 / 名 / 兑价（统一走 offerService） */
function productCard(productId) {
  const offer = require('./offerService').resolveOffer(productId)
  return {
    productId: offer.productId,
    productName: offer.name,
    imageUrl: offer.imageUrl,
    payLabel: offer.payLabel,
    payPoints: offer.payPoints,
    payCashCent: offer.payCashCent,
    payCashYuan: offer.payCashYuan,
    stock: offer.stock,
    kind: offer.kind,
    product: offer,
  }
}

function ensureSchema() {
  const d = db()
  // MySQL：TEXT 列不能带 DEFAULT；与 treeService 一样按方言建表
  if (dbMod.DIALECT === 'mysql') {
    d.prepare(
      `CREATE TABLE IF NOT EXISTS flash_slot (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        title VARCHAR(128) NOT NULL,
        tag VARCHAR(32) NOT NULL DEFAULT '限时',
        start_hm VARCHAR(8) NOT NULL,
        end_hm VARCHAR(8) NOT NULL,
        product_id VARCHAR(64) NOT NULL DEFAULT '',
        daily_stock INT NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        status VARCHAR(16) NOT NULL DEFAULT 'on',
        updated_at VARCHAR(40) NULL
      )`
    ).run()
    d.prepare(
      `CREATE TABLE IF NOT EXISTS flash_redeem_log (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        slot_id VARCHAR(64) NOT NULL,
        user_id INT NOT NULL,
        product_id VARCHAR(64) NOT NULL,
        day VARCHAR(16) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        KEY idx_flash_log_day (day, slot_id)
      )`
    ).run()
  } else {
    d.exec(`
      CREATE TABLE IF NOT EXISTS flash_slot (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        tag TEXT DEFAULT '限时',
        start_hm TEXT NOT NULL,
        end_hm TEXT NOT NULL,
        product_id TEXT NOT NULL,
        daily_stock INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        status TEXT DEFAULT 'on',
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS flash_redeem_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slot_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        product_id TEXT NOT NULL,
        day TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_flash_log_day ON flash_redeem_log(day, slot_id);
    `)
  }
  seedDefaultSlots()
}

function seedDefaultSlots() {
  const d = db()
  const n = d.prepare(`SELECT COUNT(*) AS n FROM flash_slot`).get().n
  if (n > 0) return
  const t = now()
  // product_id 留空，运营在后台绑定真实 SKU；标题统一「准点兑换」
  const rows = [
    ['fs_am', '准点兑换', '上午', '10:00', '11:00', '', 30, 1],
    ['fs_pm', '准点兑换', '下午', '14:00', '15:00', '', 20, 2],
    ['fs_night', '准点兑换', '晚场', '20:00', '22:00', '', 37, 3],
  ]
  const ins = d.prepare(
    `INSERT OR IGNORE INTO flash_slot (id,title,tag,start_hm,end_hm,product_id,daily_stock,sort_order,status,updated_at)
     VALUES (?,?,?,?,?,?,?,?, 'on', ?)`
  )
  rows.forEach((r) => ins.run(...r, t))
}

function hmToMin(hm) {
  const m = String(hm || '00:00').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}

function todayStr(d = new Date()) {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function fmtCountdown(sec) {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function listSlotsAdmin() {
  ensureSchema()
  return db()
    .prepare(`SELECT * FROM flash_slot ORDER BY sort_order, id`)
    .all()
    .map((r) => {
      const card = productCard(r.product_id)
      return {
        id: r.id,
        title: r.title,
        tag: r.tag,
        startHm: r.start_hm,
        endHm: r.end_hm,
        productId: r.product_id,
        productName: card.productName,
        imageUrl: card.imageUrl,
        payLabel: card.payLabel,
        dailyStock: r.daily_stock,
        sortOrder: r.sort_order,
        status: r.status,
      }
    })
}

function upsertSlot(body = {}) {
  ensureSchema()
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const d = db()
  const title = body.title || '准点兑换'
  const tag = body.tag || '限时'
  const startHm = body.startHm || '20:00'
  const endHm = body.endHm || '22:00'
  const productId = body.productId || ''
  const dailyStock = Number(body.dailyStock || 0)
  const sortOrder = Number(body.sortOrder || 0)
  const status = body.status || 'on'
  const t = now()
  if (dbMod.DIALECT === 'mysql') {
    d.prepare(
      `INSERT INTO flash_slot (id,title,tag,start_hm,end_hm,product_id,daily_stock,sort_order,status,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         title=VALUES(title), tag=VALUES(tag), start_hm=VALUES(start_hm), end_hm=VALUES(end_hm),
         product_id=VALUES(product_id), daily_stock=VALUES(daily_stock), sort_order=VALUES(sort_order),
         status=VALUES(status), updated_at=VALUES(updated_at)`
    ).run(id, title, tag, startHm, endHm, productId, dailyStock, sortOrder, status, t)
  } else {
    d.prepare(
      `INSERT INTO flash_slot (id,title,tag,start_hm,end_hm,product_id,daily_stock,sort_order,status,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, tag=excluded.tag, start_hm=excluded.start_hm, end_hm=excluded.end_hm,
         product_id=excluded.product_id, daily_stock=excluded.daily_stock, sort_order=excluded.sort_order,
         status=excluded.status, updated_at=excluded.updated_at`
    ).run(id, title, tag, startHm, endHm, productId, dailyStock, sortOrder, status, t)
  }
  return { ok: true }
}

/** 已有库场次标题从「*开兑」统一刷成「准点兑换」（仅改仍是旧默认名的行） */
function migrateLegacyTitles() {
  try {
    ensureSchema()
    db()
      .prepare(
        `UPDATE flash_slot SET title=?, updated_at=?
         WHERE title IN ('上午开兑','下午开兑','晚场开兑','限时开兑')`
      )
      .run('准点兑换', now())
  } catch (_) {}
}

function usedCount(slotId, day) {
  return (
    db()
      .prepare(`SELECT COUNT(*) AS n FROM flash_redeem_log WHERE slot_id=? AND day=?`)
      .get(slotId, day).n || 0
  )
}

function slotPayload(slot, { status, canRedeem, countdown, remain }) {
  const card = productCard(slot.product_id)
  return {
    moduleTitle: '准点兑换',
    status,
    canRedeem: !!canRedeem && !!card.productId,
    slotId: slot.id,
    title: slot.title || '准点兑换',
    tag: slot.tag || '限时',
    rangeText: `${slot.start_hm}–${slot.end_hm}`,
    countdown: countdown || '00:00:00',
    remain: remain != null ? remain : 0,
    stock: Number(slot.daily_stock || 0),
    ...card,
  }
}

function current(nowDate = new Date()) {
  migrateLegacyTitles()
  ensureSchema()
  const day = todayStr(nowDate)
  const mins = nowDate.getHours() * 60 + nowDate.getMinutes()
  const secs = nowDate.getSeconds()
  const slots = db()
    .prepare(`SELECT * FROM flash_slot WHERE status='on' ORDER BY sort_order, id`)
    .all()
  if (!slots.length) {
    return {
      moduleTitle: '准点兑换',
      status: 'closed',
      title: '准点兑换',
      canRedeem: false,
      countdown: '00:00:00',
      remain: 0,
      stock: 0,
      productId: '',
      productName: '',
      imageUrl: '',
      payLabel: '',
      payPoints: 0,
      payCashCent: 0,
      payCashYuan: 0,
    }
  }

  let active = null
  let next = null
  for (const s of slots) {
    const a = hmToMin(s.start_hm)
    const b = hmToMin(s.end_hm)
    if (mins >= a && mins < b) {
      active = s
      break
    }
    if (mins < a && (!next || a < hmToMin(next.start_hm))) next = s
  }

  if (active) {
    const used = usedCount(active.id, day)
    const remain = Math.max(0, Number(active.daily_stock) - used)
    const endMin = hmToMin(active.end_hm)
    const leftSec = (endMin - mins) * 60 - secs
    const hasSku = !!String(active.product_id || '').trim()
    return slotPayload(active, {
      status: !hasSku ? 'idle' : remain > 0 ? 'open' : 'soldout',
      canRedeem: hasSku && remain > 0,
      countdown: fmtCountdown(leftSec),
      remain,
    })
  }

  if (next) {
    const startMin = hmToMin(next.start_hm)
    const leftSec = (startMin - mins) * 60 - secs
    return slotPayload(next, {
      status: 'waiting',
      canRedeem: false,
      countdown: fmtCountdown(leftSec),
      remain: Math.max(0, next.daily_stock - usedCount(next.id, day)),
    })
  }

  const last = slots[slots.length - 1]
  return slotPayload(last, {
    status: 'closed',
    canRedeem: false,
    countdown: '00:00:00',
    remain: 0,
  })
}

function redeem(userId, { slotId, actionId } = {}) {
  ensureSchema()
  if (!userId) return { ok: false, msg: '未登录' }
  const cur = current()
  if (!cur.productId) return { ok: false, msg: '本场礼品未配置，请联系运营' }
  if (!cur.canRedeem) {
    if (cur.status === 'soldout') return { ok: false, msg: '本场已兑完' }
    if (cur.status === 'waiting') return { ok: false, msg: '尚未开兑，请稍候' }
    return { ok: false, msg: '当前不在开兑时段' }
  }
  if (slotId && slotId !== cur.slotId) return { ok: false, msg: '场次已切换，请刷新' }

  const d = db()
  const day = todayStr()
  // 每人每场每天限 1 次
  const dup = d
    .prepare(`SELECT id FROM flash_redeem_log WHERE user_id=? AND slot_id=? AND day=?`)
    .get(userId, cur.slotId, day)
  if (dup) return { ok: false, msg: '本场您已兑换过' }

  if (actionId) {
    try {
      const hit = d
        .prepare(`SELECT id FROM flash_redeem_log WHERE user_id=? AND created_at LIKE ?`)
        .get(userId, `%${String(actionId).slice(-8)}%`)
      // soft idempotency via action note not stored; skip
    } catch (_) {}
  }

  const used = usedCount(cur.slotId, day)
  if (used >= cur.stock) return { ok: false, msg: '本场已兑完' }

  d.prepare(
    `INSERT INTO flash_redeem_log (slot_id,user_id,product_id,day,created_at) VALUES (?,?,?,?,?)`
  ).run(cur.slotId, userId, cur.productId, day, now())

  return {
    ok: true,
    msg: '已锁定名额，请填写地址',
    needAddress: true,
    productId: cur.productId,
    slotId: cur.slotId,
  }
}

function maskNick(nick) {
  const s = String(nick || '用户').trim() || '用户'
  if (s.length <= 1) return '*'
  if (s.length === 2) return `${s[0]}*`
  return `${s[0]}*${s[s.length - 1]}`
}

function history({ page = 1, pageSize = 20 } = {}) {
  ensureSchema()
  const d = db()
  const total = d.prepare(`SELECT COUNT(*) AS n FROM flash_redeem_log`).get().n
  const offset = (Math.max(1, page) - 1) * pageSize
  const rows = d
    .prepare(
      `SELECT l.*, u.nick_name, p.name AS product_name, s.title AS slot_title
       FROM flash_redeem_log l
       LEFT JOIN user_account u ON u.id=l.user_id
       LEFT JOIN product p ON p.id=l.product_id
       LEFT JOIN flash_slot s ON s.id=l.slot_id
       ORDER BY l.id DESC LIMIT ? OFFSET ?`
    )
    .all(pageSize, offset)
  return {
    total,
    page: Number(page),
    pageSize,
    list: rows.map((r) => ({
      id: r.id,
      day: r.day,
      slotTitle: r.slot_title || r.slot_id,
      productName: r.product_name || r.product_id,
      nickMask: maskNick(r.nick_name),
      createdAt: r.created_at,
    })),
  }
}

function activityFeed(limit = 50) {
  ensureSchema()
  const d = db()
  const n = Math.min(50, Math.max(1, Number(limit) || 50))
  const flash = d
    .prepare(
      `SELECT l.id, l.created_at, u.nick_name, u.avatar_url, p.name AS gift_name
       FROM flash_redeem_log l
       LEFT JOIN user_account u ON u.id=l.user_id
       LEFT JOIN product p ON p.id=l.product_id
       ORDER BY l.id DESC LIMIT ?`
    )
    .all(n)
    .map((r) => ({
      id: `f${r.id}`,
      nickMask: maskNick(r.nick_name),
      avatarUrl: r.avatar_url || '',
      actionText: '成功兑换',
      giftName: r.gift_name || '礼品',
      time: r.created_at,
    }))

  let lottery = []
  try {
    lottery = d
      .prepare(
        `SELECT h.id, h.created_at, u.nick_name, u.avatar_url, h.prize_name
         FROM lottery_draw h
         LEFT JOIN user_account u ON u.id=h.user_id
         WHERE h.prize_type='physical'
         ORDER BY h.id DESC LIMIT ?`
      )
      .all(n)
      .map((r) => ({
        id: `l${r.id}`,
        nickMask: maskNick(r.nick_name),
        avatarUrl: r.avatar_url || '',
        actionText: '抽中',
        giftName: r.prize_name || '奖品',
        time: r.created_at,
      }))
  } catch (_) {}

  const merged = [...flash, ...lottery]
    .sort((a, b) => String(b.time).localeCompare(String(a.time)))
    .slice(0, n)
  return { items: merged }
}

module.exports = {
  ensureSchema,
  listSlotsAdmin,
  upsertSlot,
  current,
  redeem,
  history,
  activityFeed,
  maskNick,
  productCard,
  migrateLegacyTitles,
}

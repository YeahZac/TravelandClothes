/**
 * 准点兑换：24 小时整点档（可启停）+ 开兑窗口默认 2 分钟
 * 兑价：能量 / 现金可组合，至少填一项
 */
const dbMod = require('../db')

const WINDOW_SEC_DEFAULT = 120

function db() {
  return dbMod.open()
}
function now() {
  return dbMod.nowIso()
}

function payLabel(energy, cashCent) {
  const parts = []
  const e = Math.max(0, Number(energy) || 0)
  const c = Math.max(0, Number(cashCent) || 0)
  if (e > 0) parts.push(`${e}能量值`)
  if (c > 0) {
    const y = c / 100
    parts.push(`¥${y.toFixed(y % 1 ? 2 : 0)}`)
  }
  return parts.join('+') || ''
}

function productCard(productId, payEnergy, payCashCent) {
  const offer = require('./offerService').resolveOffer(productId)
  const energy = payEnergy != null && payEnergy !== '' ? Number(payEnergy) : offer.payPoints
  const cash = payCashCent != null && payCashCent !== '' ? Number(payCashCent) : offer.payCashCent
  const e = Math.max(0, Number(energy) || 0)
  const c = Math.max(0, Number(cash) || 0)
  return {
    productId: offer.productId,
    productName: offer.name,
    imageUrl: offer.imageUrl,
    payPoints: e,
    payCashCent: c,
    payCashYuan: c / 100,
    payLabel: payLabel(e, c) || offer.payLabel,
    stock: offer.stock,
    kind: offer.kind,
    product: offer,
  }
}

function ensureSchema() {
  const d = db()
  const add = dbMod.addColumnIfMissing
  if (dbMod.DIALECT === 'mysql') {
    d.prepare(
      `CREATE TABLE IF NOT EXISTS flash_slot (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        title VARCHAR(128) NOT NULL,
        tag VARCHAR(32) NOT NULL DEFAULT '',
        start_hm VARCHAR(8) NOT NULL DEFAULT '00:00',
        end_hm VARCHAR(8) NOT NULL DEFAULT '00:02',
        hour_num INT NOT NULL DEFAULT 0,
        product_id VARCHAR(64) NOT NULL DEFAULT '',
        pay_energy INT NOT NULL DEFAULT 0,
        pay_cash_cent INT NOT NULL DEFAULT 0,
        window_sec INT NOT NULL DEFAULT 120,
        daily_stock INT NOT NULL DEFAULT 9999,
        sort_order INT NOT NULL DEFAULT 0,
        status VARCHAR(16) NOT NULL DEFAULT 'off',
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
        tag TEXT DEFAULT '',
        start_hm TEXT NOT NULL DEFAULT '00:00',
        end_hm TEXT NOT NULL DEFAULT '00:02',
        hour_num INTEGER NOT NULL DEFAULT 0,
        product_id TEXT NOT NULL DEFAULT '',
        pay_energy INTEGER NOT NULL DEFAULT 0,
        pay_cash_cent INTEGER NOT NULL DEFAULT 0,
        window_sec INTEGER NOT NULL DEFAULT 120,
        daily_stock INTEGER NOT NULL DEFAULT 9999,
        sort_order INTEGER DEFAULT 0,
        status TEXT DEFAULT 'off',
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
  ;[
    ['hour_num', 'INT NOT NULL DEFAULT 0', 'INTEGER NOT NULL DEFAULT 0'],
    ['pay_energy', 'INT NOT NULL DEFAULT 0', 'INTEGER NOT NULL DEFAULT 0'],
    ['pay_cash_cent', 'INT NOT NULL DEFAULT 0', 'INTEGER NOT NULL DEFAULT 0'],
    ['window_sec', 'INT NOT NULL DEFAULT 120', 'INTEGER NOT NULL DEFAULT 120'],
  ].forEach(([col, my, sq]) => add(d, 'flash_slot', col, my, sq))
  ensureHourSlots()
}

function hourId(h) {
  return `fs_h${String(h).padStart(2, '0')}`
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

/** 把旧「时段」场次迁到 24 小时整点档，并补齐缺失小时 */
function ensureHourSlots() {
  const d = db()
  const t = now()
  const existing = d.prepare(`SELECT * FROM flash_slot`).all()
  const byHour = {}
  existing.forEach((r) => {
    let h = r.hour_num
    if (h == null || Number.isNaN(Number(h))) {
      h = Math.floor(hmToMin(r.start_hm) / 60) % 24
      try {
        d.prepare(`UPDATE flash_slot SET hour_num=? WHERE id=?`).run(h, r.id)
      } catch (_) {}
    }
    h = Number(h) % 24
    if (!byHour[h] || String(r.id).startsWith('fs_h')) byHour[h] = { ...r, hour_num: h }
  })

  // 旧默认三场 → 映射到整点（仅当整点档尚无商品时带入）
  const legacyMap = { fs_am: 10, fs_pm: 14, fs_night: 20 }
  Object.keys(legacyMap).forEach((lid) => {
    const row = existing.find((x) => x.id === lid)
    if (!row || !row.product_id) return
    const h = legacyMap[lid]
    const hourRow = existing.find((x) => x.id === hourId(h))
    if (hourRow && hourRow.product_id) return
    if (!byHour[h] || !byHour[h].product_id) {
      byHour[h] = {
        ...row,
        id: hourId(h),
        hour_num: h,
        status: 'on',
        start_hm: `${String(h).padStart(2, '0')}:00`,
        end_hm: `${String(h).padStart(2, '0')}:02`,
      }
    }
  })

  for (let h = 0; h < 24; h++) {
    const id = hourId(h)
    const prev = byHour[h]
    const startHm = `${String(h).padStart(2, '0')}:00`
    const endHm = `${String(h).padStart(2, '0')}:02`
    const title = (prev && prev.title) || '准点兑换'
    const tag = (prev && prev.tag) || `${h}点`
    const productId = (prev && prev.product_id) || ''
    let payEnergy = Number((prev && prev.pay_energy) || 0)
    let payCash = Number((prev && prev.pay_cash_cent) || 0)
    // 旧场次无独立兑价时，从商品主数据带入
    if (productId && payEnergy <= 0 && payCash <= 0) {
      try {
        const offer = require('./offerService').resolveOffer(productId)
        payEnergy = Number(offer.payPoints) || 0
        payCash = Number(offer.payCashCent) || 0
      } catch (_) {}
    }
    const windowSec = (prev && prev.window_sec) || WINDOW_SEC_DEFAULT
    const dailyStock = prev && prev.daily_stock != null ? prev.daily_stock : 9999
    const status =
      productId && (!prev || prev.status === 'on' || prev.status == null || prev.status === undefined)
        ? 'on'
        : 'off'
    const sortOrder = h
    const hit = d.prepare(`SELECT id, product_id, pay_energy, pay_cash_cent, status FROM flash_slot WHERE id=?`).get(id)
    if (!hit) {
      d.prepare(
        `INSERT INTO flash_slot
          (id,title,tag,start_hm,end_hm,hour_num,product_id,pay_energy,pay_cash_cent,window_sec,daily_stock,sort_order,status,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        id,
        title,
        tag,
        startHm,
        endHm,
        h,
        productId,
        payEnergy,
        payCash,
        windowSec,
        dailyStock,
        sortOrder,
        status,
        t
      )
    } else {
      // 整点档已存在：只补齐 hour/时间窗；空商品时允许从旧场次灌入一次
      if (!hit.product_id && productId) {
        d.prepare(
          `UPDATE flash_slot SET title=?, tag=?, start_hm=?, end_hm=?, hour_num=?, product_id=?,
             pay_energy=?, pay_cash_cent=?, window_sec=?, daily_stock=?, sort_order=?, status=?, updated_at=?
           WHERE id=?`
        ).run(
          title,
          tag,
          startHm,
          endHm,
          h,
          productId,
          payEnergy,
          payCash,
          windowSec,
          dailyStock,
          sortOrder,
          status,
          t,
          id
        )
      } else {
        d.prepare(
          `UPDATE flash_slot SET hour_num=?, start_hm=?, end_hm=?, sort_order=?,
             tag=CASE WHEN tag IS NULL OR tag='' THEN ? ELSE tag END, updated_at=?
           WHERE id=?`
        ).run(h, startHm, endHm, sortOrder, tag, t, id)
      }
    }
  }
}

function listSlotsAdmin() {
  ensureSchema()
  return db()
    .prepare(`SELECT * FROM flash_slot WHERE id LIKE 'fs_h%' ORDER BY hour_num, id`)
    .all()
    .map((r) => {
      const card = productCard(r.product_id, r.pay_energy, r.pay_cash_cent)
      return {
        id: r.id,
        hour: Number(r.hour_num) || 0,
        title: r.title || '准点兑换',
        tag: r.tag || `${Number(r.hour_num) || 0}点`,
        startHm: r.start_hm,
        endHm: r.end_hm,
        productId: r.product_id,
        productName: card.productName,
        imageUrl: card.imageUrl,
        payEnergy: Number(r.pay_energy) || 0,
        payCashCent: Number(r.pay_cash_cent) || 0,
        payCashYuan: (Number(r.pay_cash_cent) || 0) / 100,
        payLabel: card.payLabel,
        windowSec: Number(r.window_sec) || WINDOW_SEC_DEFAULT,
        dailyStock: r.daily_stock,
        sortOrder: r.sort_order,
        status: r.status === 'on' ? 'on' : 'off',
        enabled: r.status === 'on',
      }
    })
}

function upsertSlot(body = {}) {
  ensureSchema()
  let hour = body.hour != null ? Number(body.hour) : null
  let id = String(body.id || '').trim()
  if (hour == null || Number.isNaN(hour)) {
    const m = id.match(/^fs_h(\d{1,2})$/)
    hour = m ? Number(m[1]) : Math.floor(hmToMin(body.startHm || '0:00') / 60)
  }
  hour = ((Number(hour) % 24) + 24) % 24
  id = hourId(hour)
  const productId = String(body.productId || '').trim()
  const payEnergy = Math.max(0, Number(body.payEnergy != null ? body.payEnergy : body.payPoints) || 0)
  const payCashCent = Math.max(
    0,
    Math.round(
      body.payCashCent != null
        ? Number(body.payCashCent)
        : body.payCashYuan != null
          ? Number(body.payCashYuan) * 100
          : 0
    ) || 0
  )
  const enabled = body.enabled === true || body.status === 'on'
  if (enabled) {
    if (!productId) return { ok: false, msg: '启用场次必须绑定商品 SKU' }
    if (payEnergy <= 0 && payCashCent <= 0) {
      return { ok: false, msg: '能量值与现金至少填写一项' }
    }
  }
  const windowSec = Math.max(30, Number(body.windowSec) || WINDOW_SEC_DEFAULT)
  const dailyStock = body.dailyStock != null ? Number(body.dailyStock) : 9999
  const title = body.title || '准点兑换'
  const tag = body.tag || `${hour}点`
  const startHm = `${String(hour).padStart(2, '0')}:00`
  const endMin = Math.floor(windowSec / 60)
  const endSec = windowSec % 60
  const endHm = `${String(hour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`
  const status = enabled ? 'on' : 'off'
  const t = now()
  const d = db()
  if (dbMod.DIALECT === 'mysql') {
    d.prepare(
      `INSERT INTO flash_slot
        (id,title,tag,start_hm,end_hm,hour_num,product_id,pay_energy,pay_cash_cent,window_sec,daily_stock,sort_order,status,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         title=VALUES(title), tag=VALUES(tag), start_hm=VALUES(start_hm), end_hm=VALUES(end_hm),
         hour_num=VALUES(hour_num), product_id=VALUES(product_id), pay_energy=VALUES(pay_energy),
         pay_cash_cent=VALUES(pay_cash_cent), window_sec=VALUES(window_sec), daily_stock=VALUES(daily_stock),
         sort_order=VALUES(sort_order), status=VALUES(status), updated_at=VALUES(updated_at)`
    ).run(
      id,
      title,
      tag,
      startHm,
      endHm,
      hour,
      productId,
      payEnergy,
      payCashCent,
      windowSec,
      dailyStock,
      hour,
      status,
      t
    )
  } else {
    d.prepare(
      `INSERT INTO flash_slot
        (id,title,tag,start_hm,end_hm,hour_num,product_id,pay_energy,pay_cash_cent,window_sec,daily_stock,sort_order,status,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, tag=excluded.tag, start_hm=excluded.start_hm, end_hm=excluded.end_hm,
         hour_num=excluded.hour_num, product_id=excluded.product_id, pay_energy=excluded.pay_energy,
         pay_cash_cent=excluded.pay_cash_cent, window_sec=excluded.window_sec, daily_stock=excluded.daily_stock,
         sort_order=excluded.sort_order, status=excluded.status, updated_at=excluded.updated_at`
    ).run(
      id,
      title,
      tag,
      startHm,
      endHm,
      hour,
      productId,
      payEnergy,
      payCashCent,
      windowSec,
      dailyStock,
      hour,
      status,
      t
    )
  }
  return { ok: true, id, hour }
}

function upsertBatch(list = []) {
  const results = []
  for (const row of list) {
    results.push(upsertSlot(row))
  }
  return { ok: results.every((r) => r.ok), results }
}

function usedCount(slotId, day) {
  return (
    db()
      .prepare(`SELECT COUNT(*) AS n FROM flash_redeem_log WHERE slot_id=? AND day=?`)
      .get(slotId, day).n || 0
  )
}

function enabledSlots() {
  return db()
    .prepare(
      `SELECT * FROM flash_slot WHERE status='on' AND product_id!='' AND id LIKE 'fs_h%' ORDER BY hour_num`
    )
    .all()
}

function nextOpenAfter(slots, fromDate) {
  if (!slots.length) return null
  const day0 = new Date(fromDate)
  for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
    const d = new Date(day0)
    d.setDate(d.getDate() + dayOffset)
    const y = d.getFullYear()
    const mo = d.getMonth()
    const da = d.getDate()
    for (const s of slots) {
      const h = Number(s.hour_num) || 0
      const openAt = new Date(y, mo, da, h, 0, 0, 0)
      if (openAt.getTime() > fromDate.getTime()) {
        return { slot: s, openAt }
      }
    }
  }
  // wrap: tomorrow first
  const s = slots[0]
  const d = new Date(fromDate)
  d.setDate(d.getDate() + 1)
  const openAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(s.hour_num) || 0, 0, 0, 0)
  return { slot: s, openAt }
}

function slotPayload(slot, extra = {}) {
  const card = productCard(slot.product_id, slot.pay_energy, slot.pay_cash_cent)
  const h = Number(slot.hour_num) || 0
  return {
    moduleTitle: '准点兑换',
    slotId: slot.id,
    hour: h,
    title: slot.title || '准点兑换',
    tag: slot.tag || `${h}点`,
    rangeText: `${String(h).padStart(2, '0')}:00 开兑 · ${Number(slot.window_sec) || WINDOW_SEC_DEFAULT}秒`,
    windowSec: Number(slot.window_sec) || WINDOW_SEC_DEFAULT,
    ...card,
    ...extra,
  }
}

function current(nowDate = new Date()) {
  ensureSchema()
  const slots = enabledSlots()
  const empty = {
    moduleTitle: '准点兑换',
    status: 'idle',
    title: '准点兑换',
    canRedeem: false,
    countdown: '00:00:00',
    soldoutMsg: '',
    productId: '',
    productName: '',
    imageUrl: '',
    payLabel: '',
    payPoints: 0,
    payCashCent: 0,
    payCashYuan: 0,
    hour: null,
    slotId: '',
    tag: '',
    rangeText: '',
  }
  if (!slots.length) return empty

  const hour = nowDate.getHours()
  const elapsedInHour = nowDate.getMinutes() * 60 + nowDate.getSeconds()
  const thisSlot = slots.find((s) => Number(s.hour_num) === hour)
  const next = nextOpenAfter(slots, nowDate)

  if (thisSlot) {
    const win = Number(thisSlot.window_sec) || WINDOW_SEC_DEFAULT
    const day = todayStr(nowDate)
    const used = usedCount(thisSlot.id, day)
    const stock = Number(thisSlot.daily_stock)
    const stockLeft = stock < 0 ? 9999 : Math.max(0, stock - used)

    if (elapsedInHour < win) {
      const open = stockLeft > 0
      // 倒计时：下一场有效开兑（本场结束后的下一档）
      const afterWindow = new Date(nowDate)
      afterWindow.setMinutes(0, 0, 0)
      afterWindow.setSeconds(win)
      const nextAfter = nextOpenAfter(slots, new Date(afterWindow.getTime() + 1000))
      const cdTarget = nextAfter ? nextAfter.openAt : afterWindow
      return slotPayload(thisSlot, {
        status: open ? 'open' : 'soldout',
        canRedeem: open,
        soldoutMsg: open ? '' : '当前礼物已经被兑换完毕',
        countdown: fmtCountdown((cdTarget.getTime() - nowDate.getTime()) / 1000),
        windowLeftSec: win - elapsedInHour,
        nextHour: nextAfter ? Number(nextAfter.slot.hour_num) : null,
      })
    }

    // 本小时窗口已过：提示兑完，展示下一档礼物
    const display = next ? next.slot : thisSlot
    return slotPayload(display, {
      status: 'soldout',
      canRedeem: false,
      soldoutMsg: '当前礼物已经被兑换完毕',
      countdown: next ? fmtCountdown((next.openAt.getTime() - nowDate.getTime()) / 1000) : '00:00:00',
      windowLeftSec: 0,
      nextHour: next ? Number(next.slot.hour_num) : null,
      expiredHour: hour,
    })
  }

  // 本小时未配置：等待下一档
  return slotPayload(next.slot, {
    status: 'waiting',
    canRedeem: false,
    soldoutMsg: '',
    countdown: fmtCountdown((next.openAt.getTime() - nowDate.getTime()) / 1000),
    windowLeftSec: 0,
    nextHour: Number(next.slot.hour_num),
  })
}

function redeem(userId, { slotId, actionId } = {}) {
  ensureSchema()
  if (!userId) return { ok: false, msg: '未登录' }
  const cur = current()
  if (!cur.productId) return { ok: false, msg: '本场礼品未配置，请联系运营' }
  if (!cur.canRedeem) {
    if (cur.status === 'soldout') {
      return { ok: false, msg: cur.soldoutMsg || '当前礼物已经被兑换完毕', ...cur }
    }
    if (cur.status === 'waiting') return { ok: false, msg: '尚未开兑，请稍候', ...cur }
    return { ok: false, msg: '当前不在开兑时段', ...cur }
  }
  if (slotId && slotId !== cur.slotId) return { ok: false, msg: '场次已切换，请刷新', ...cur }
  if ((cur.payPoints || 0) <= 0 && (cur.payCashCent || 0) <= 0) {
    return { ok: false, msg: '兑价未配置', ...cur }
  }

  const d = db()
  const day = todayStr()
  const dup = d
    .prepare(`SELECT id FROM flash_redeem_log WHERE user_id=? AND slot_id=? AND day=?`)
    .get(userId, cur.slotId, day)
  if (dup) return { ok: false, msg: '本场您已兑换过' }

  d.prepare(
    `INSERT INTO flash_redeem_log (slot_id,user_id,product_id,day,created_at) VALUES (?,?,?,?,?)`
  ).run(cur.slotId, userId, cur.productId, day, now())

  return {
    ok: true,
    msg: '已锁定名额，请确认兑换',
    needAddress: true,
    productId: cur.productId,
    slotId: cur.slotId,
    payPoints: cur.payPoints || 0,
    payCashCent: cur.payCashCent || 0,
    orderType: 'gift',
    channel: 'flash',
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
      `SELECT l.*, u.nick_name, p.name AS product_name, s.title AS slot_title, s.tag AS slot_tag, s.hour_num
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
      slotTitle: r.slot_tag || r.slot_title || r.slot_id,
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
  upsertBatch,
  current,
  redeem,
  history,
  activityFeed,
  maskNick,
  productCard,
  WINDOW_SEC_DEFAULT,
}

/**
 * 汉服节报名票：SKU + 微信支付下单 + 电子票出票/核销
 * 财务分类：festival_adult / festival_child
 *
 * 【改价唯一入口】只改下面 FESTIVAL_PRICE_YUAN（单位：元）
 * 展示价、下单 pay_cash_cent、微信支付 JSAPI 金额全部由此派生，客户端传价无效。
 * 改完后需重部署 traffic-cms；已创建的未支付订单仍按下单时写入的金额支付。
 */
const crypto = require('crypto')
const dbMod = require('../db')

/** @type {Record<string, number>} 票种 id → 单价（元） */
const FESTIVAL_PRICE_YUAN = {
  fest_adult_28: 30,
  fest_adult_29: 42,
  fest_adult_both: 60,
  fest_child_28: 20,
  fest_child_29: 20,
  fest_child_both: 35,
}

function yuanToCent(yuan) {
  const n = Number(yuan)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

const TICKET_DEFS = [
  {
    id: 'fest_adult_28',
    name: '汉服节成人票·11月28日',
    desc: '报名费含入园福利 · 11月28日',
    dayLabel: '11月28日',
    category: 'festival_adult',
    audience: 'adult',
    tag: '成人',
    tone: 'orange',
    stock: 9999,
    sortOrder: 1,
  },
  {
    id: 'fest_adult_29',
    name: '汉服节成人票·11月29日',
    desc: '报名费含入园福利 · 11月29日',
    dayLabel: '11月29日',
    category: 'festival_adult',
    audience: 'adult',
    tag: '成人',
    tone: 'orange',
    stock: 9999,
    sortOrder: 2,
  },
  {
    id: 'fest_adult_both',
    name: '汉服节成人票·两日联报',
    desc: '报名费含入园福利 · 11月28—29日',
    dayLabel: '两日联报',
    category: 'festival_adult',
    audience: 'adult',
    tag: '联报',
    tone: 'gold',
    stock: 9999,
    sortOrder: 3,
  },
  {
    id: 'fest_child_28',
    name: '汉服节儿童/学生票·11月28日',
    desc: '身高1.2—1.5米 · 11月28日',
    dayLabel: '11月28日',
    category: 'festival_child',
    audience: 'child',
    tag: '儿童/学生',
    tone: 'mint',
    stock: 9999,
    sortOrder: 4,
  },
  {
    id: 'fest_child_29',
    name: '汉服节儿童/学生票·11月29日',
    desc: '身高1.2—1.5米 · 11月29日',
    dayLabel: '11月29日',
    category: 'festival_child',
    audience: 'child',
    tag: '儿童/学生',
    tone: 'mint',
    stock: 9999,
    sortOrder: 5,
  },
  {
    id: 'fest_child_both',
    name: '汉服节儿童/学生票·两日联报',
    desc: '身高1.2—1.5米 · 11月28—29日',
    dayLabel: '两日联报',
    category: 'festival_child',
    audience: 'child',
    tag: '联报',
    tone: 'blue',
    stock: 9999,
    sortOrder: 6,
  },
]

function buildTickets() {
  return TICKET_DEFS.map((def) => {
    const priceYuan = Number(FESTIVAL_PRICE_YUAN[def.id])
    if (!Number.isFinite(priceYuan) || priceYuan <= 0) {
      throw new Error(`[festival] 缺少有效单价配置: ${def.id}`)
    }
    const payCashCent = yuanToCent(priceYuan)
    return {
      ...def,
      priceYuan,
      payCashCent,
    }
  })
}

/** 启动时固化一份；改价后需重启/重部署进程才会刷新 */
const TICKETS = buildTickets()
const TICKET_MAP = Object.fromEntries(TICKETS.map((t) => [t.id, t]))
const HERO_IMG =
  'https://yx.linyio.com/api/traffic/v1/media/file?key=qmyx%2Ffestival%2F1794794597285_festival-hero-2026.jpg'
const SCENE_IMG =
  'https://yx.linyio.com/api/traffic/v1/media/file?key=qmyx%2Ffestival%2F1794794597996_festival-scene-2026.jpg'

let schemaReady = false

function db() {
  return dbMod.open()
}

function now() {
  return dbMod.nowIso()
}

function orderNo() {
  return `F${Date.now()}${Math.floor(Math.random() * 900 + 100)}`
}

function ticketNo() {
  return `HT${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`
}

function verifyCode() {
  return crypto.randomBytes(8).toString('hex')
}

function ensureSchema() {
  if (schemaReady) return
  const d = db()
  try {
    if (dbMod.DIALECT === 'mysql') {
      d.exec(`
        CREATE TABLE IF NOT EXISTS festival_ticket (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          ticket_no VARCHAR(40) NOT NULL,
          verify_code VARCHAR(64) NOT NULL,
          order_no VARCHAR(64) NOT NULL,
          user_id BIGINT NOT NULL,
          sku_id VARCHAR(64) NOT NULL,
          sku_name VARCHAR(128) NOT NULL DEFAULT '',
          day_label VARCHAR(32) NOT NULL DEFAULT '',
          audience VARCHAR(16) NOT NULL DEFAULT 'adult',
          visitor VARCHAR(64) NOT NULL DEFAULT '',
          phone VARCHAR(20) NOT NULL DEFAULT '',
          status VARCHAR(16) NOT NULL DEFAULT 'valid',
          verified_at VARCHAR(40) NOT NULL DEFAULT '',
          verified_by VARCHAR(64) NOT NULL DEFAULT '',
          created_at VARCHAR(40) NOT NULL,
          UNIQUE KEY uk_festival_ticket_no (ticket_no),
          UNIQUE KEY uk_festival_verify (verify_code),
          KEY idx_festival_ticket_user (user_id),
          KEY idx_festival_ticket_order (order_no)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
    } else {
      d.exec(`
        CREATE TABLE IF NOT EXISTS festival_ticket (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_no TEXT NOT NULL UNIQUE,
          verify_code TEXT NOT NULL UNIQUE,
          order_no TEXT NOT NULL,
          user_id INTEGER NOT NULL,
          sku_id TEXT NOT NULL,
          sku_name TEXT NOT NULL DEFAULT '',
          day_label TEXT NOT NULL DEFAULT '',
          audience TEXT NOT NULL DEFAULT 'adult',
          visitor TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'valid',
          verified_at TEXT NOT NULL DEFAULT '',
          verified_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        )
      `)
      d.exec(`CREATE INDEX IF NOT EXISTS idx_festival_ticket_user ON festival_ticket(user_id)`)
      d.exec(`CREATE INDEX IF NOT EXISTS idx_festival_ticket_order ON festival_ticket(order_no)`)
    }
  } catch (e) {
    console.warn('[festival] ensureSchema', e && e.message)
  }
  schemaReady = true
}

function priceBoard() {
  const adult28 = FESTIVAL_PRICE_YUAN.fest_adult_28
  const adult29 = FESTIVAL_PRICE_YUAN.fest_adult_29
  const adultBoth = FESTIVAL_PRICE_YUAN.fest_adult_both
  const child28 = FESTIVAL_PRICE_YUAN.fest_child_28
  const child29 = FESTIVAL_PRICE_YUAN.fest_child_29
  const childBoth = FESTIVAL_PRICE_YUAN.fest_child_both
  return {
    adultLine: `28日 ¥${adult28} · 29日 ¥${adult29} · 联报 ¥${adultBoth}`,
    childLine:
      child28 === child29
        ? `28/29日 ¥${child28} · 联报 ¥${childBoth}`
        : `28日 ¥${child28} · 29日 ¥${child29} · 联报 ¥${childBoth}`,
    prices: { ...FESTIVAL_PRICE_YUAN },
  }
}

function listTickets() {
  const board = priceBoard()
  return {
    list: TICKETS.map((t) => ({
      id: t.id,
      name: t.name,
      desc: t.desc,
      dayLabel: t.dayLabel,
      price: t.priceYuan,
      priceYuan: t.priceYuan,
      payCashCent: t.payCashCent,
      marketPrice: t.priceYuan,
      stock: t.stock,
      tag: t.tag,
      tone: t.tone,
      category: t.category,
      audience: t.audience,
      sortOrder: t.sortOrder,
    })),
    priceBoard: board,
    freeNote:
      '免报名费：符合岭南印象园免费入园政策者，按景区规定自行入园，无需报名缴费。',
    event: {
      title: '2026汉服节·中国广州',
      dates: '2026年11月28—29日',
      venue: '广州·岭南印象园',
      theme: '星火成炬，四海归衣',
      fullName: '汉服复兴23周年纪念活动暨2026汉服节中国广州',
      heroImage: HERO_IMG,
      sceneImage: SCENE_IMG,
      priceBoard: board,
    },
  }
}

function getTicket(id) {
  return TICKET_MAP[String(id || '').trim()] || null
}

function financeCategoryForTicket(ticketOrId) {
  const t = typeof ticketOrId === 'string' ? getTicket(ticketOrId) : ticketOrId
  if (!t) return 'festival_adult'
  return t.category === 'festival_child' ? 'festival_child' : 'festival_adult'
}

function createOrder(userId, body = {}) {
  ensureSchema()
  const ticketId = String(body.ticketId || body.productId || body.id || '').trim()
  const ticket = getTicket(ticketId)
  if (!ticket) return { ok: false, msg: '票种不存在' }
  const qty = Math.max(1, Math.min(5, Number(body.qty || 1) || 1))
  const visitor = String(body.visitor || body.name || '').trim()
  const phone = String(body.phone || '').trim()
  if (!visitor) return { ok: false, msg: '请填写出行人姓名' }
  if (!/^1\d{10}$/.test(phone)) return { ok: false, msg: '请填写有效手机号' }

  // 金额只认服务端价目表，忽略 body.payCashCent / price（防篡改；与微信 JSAPI total 一致）
  const unitCent = yuanToCent(FESTIVAL_PRICE_YUAN[ticket.id] ?? ticket.priceYuan)
  if (unitCent <= 0) return { ok: false, msg: '票种价格未配置' }
  const payCashCent = unitCent * qty
  const ono = orderNo()
  const addrJson = JSON.stringify({
    name: visitor,
    phone,
    detail: `${ticket.dayLabel} · 汉服节电子报名票 · 岭南印象园`,
    full: `汉服节报名 · ${ticket.name}`,
    entryFrom: 'festival',
    ticketId: ticket.id,
    financeCategory: ticket.category,
    dayLabel: ticket.dayLabel,
    unitPriceYuan: unitCent / 100,
    unitPayCashCent: unitCent,
  })
  const d = db()
  const t = now()
  try {
    d.prepare(
      `INSERT INTO redeem_order (order_no,user_id,order_type,product_id,product_name,qty,pay_points,pay_cash_cent,cost_cent,status,pay_status,address_json,entry_from,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,'unpaid','unpaid',?,?,?,?)`
    ).run(
      ono,
      userId,
      'festival',
      ticket.id,
      ticket.name,
      qty,
      0,
      payCashCent,
      0,
      addrJson,
      'festival',
      t,
      t
    )
  } catch (e) {
    try {
      d.prepare(
        `INSERT INTO redeem_order (order_no,user_id,order_type,product_id,product_name,qty,pay_points,pay_cash_cent,cost_cent,status,address_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,'unpaid',?,?,?)`
      ).run(ono, userId, 'festival', ticket.id, ticket.name, qty, 0, payCashCent, 0, addrJson, t, t)
    } catch (e2) {
      return { ok: false, msg: (e2 && e2.message) || '下单失败' }
    }
  }

  const row = d.prepare(`SELECT * FROM redeem_order WHERE order_no=?`).get(ono)
  return {
    ok: true,
    orderNo: ono,
    needWxPay: payCashCent > 0,
    order: {
      id: row && row.id,
      orderNo: ono,
      orderType: 'festival',
      productId: ticket.id,
      productName: ticket.name,
      qty,
      payCashCent,
      payStatus: 'unpaid',
      status: 'unpaid',
      needWxPay: true,
      financeCategory: ticket.category,
    },
    ticket: {
      id: ticket.id,
      name: ticket.name,
      priceYuan: ticket.priceYuan,
      category: ticket.category,
    },
  }
}

function mapPass(row) {
  if (!row) return null
  const sku = getTicket(row.sku_id)
  const qrPayload = `FEST|${row.ticket_no}|${row.verify_code}`
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    verifyCode: row.verify_code,
    qrPayload,
    qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(qrPayload)}`,
    orderNo: row.order_no,
    userId: row.user_id,
    skuId: row.sku_id,
    skuName: row.sku_name || (sku && sku.name) || '',
    dayLabel: row.day_label || (sku && sku.dayLabel) || '',
    audience: row.audience || (sku && sku.audience) || 'adult',
    visitor: row.visitor || '',
    phone: row.phone || '',
    status: row.status || 'valid',
    statusLabel:
      row.status === 'used'
        ? '已作废失效'
        : row.status === 'refunded'
          ? '已退款'
          : row.status === 'cancelled'
            ? '已取消'
            : row.verified_at
              ? '有效·当日可进出'
              : '待查验',
    verifiedAt: row.verified_at || '',
    verifiedBy: row.verified_by || '',
    createdAt: row.created_at || '',
    valid: row.status === 'valid',
  }
}

/** 支付成功后按 qty 出票（幂等） */
function issueTicketsForOrder(order) {
  ensureSchema()
  if (!order) return { ok: false, issued: 0 }
  const orderType = order.order_type || order.orderType || ''
  const productId = String(order.product_id || order.productId || '')
  if (orderType !== 'festival' && !productId.startsWith('fest_')) {
    return { ok: true, issued: 0, skipped: true }
  }
  const outTradeNo = order.order_no || order.orderNo
  if (!outTradeNo) return { ok: false, issued: 0, msg: '缺订单号' }
  const d = db()
  const exists = d.prepare(`SELECT COUNT(*) AS n FROM festival_ticket WHERE order_no=?`).get(outTradeNo)
  if (exists && Number(exists.n) > 0) {
    return { ok: true, issued: Number(exists.n), duplicate: true }
  }
  const sku = getTicket(productId)
  const qty = Math.max(1, Number(order.qty || 1) || 1)
  let visitor = ''
  let phone = ''
  try {
    const addr = JSON.parse(order.address_json || '{}')
    visitor = addr.name || ''
    phone = addr.phone || ''
  } catch (_) {}
  const t = now()
  const issued = []
  // 联报：每份拆成两张日票（28 / 29），便于当日无限次进出核验
  const daySplits =
    sku && String(sku.id || '').endsWith('_both')
      ? [
          {
            skuId: sku.audience === 'child' ? 'fest_child_28' : 'fest_adult_28',
            dayLabel: '11月28日',
            name: `${sku.audience === 'child' ? '儿童/学生' : '成人'}·11月28日`,
          },
          {
            skuId: sku.audience === 'child' ? 'fest_child_29' : 'fest_adult_29',
            dayLabel: '11月29日',
            name: `${sku.audience === 'child' ? '儿童/学生' : '成人'}·11月29日`,
          },
        ]
      : [
          {
            skuId: productId,
            dayLabel: (sku && sku.dayLabel) || '',
            name: (sku && sku.name) || order.product_name || productId,
          },
        ]

  const insertOne = (meta) => {
    const tn = ticketNo()
    const vc = verifyCode()
    d.prepare(
      `INSERT INTO festival_ticket
       (ticket_no,verify_code,order_no,user_id,sku_id,sku_name,day_label,audience,visitor,phone,status,verified_at,verified_by,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'valid','','',?)`
    ).run(
      tn,
      vc,
      outTradeNo,
      order.user_id || order.userId,
      meta.skuId,
      meta.name,
      meta.dayLabel,
      (sku && sku.audience) || 'adult',
      visitor,
      phone,
      t
    )
    issued.push(tn)
  }

  for (let i = 0; i < qty; i += 1) {
    daySplits.forEach(insertOne)
  }
  // 订单标为已完成履约（电子票）
  try {
    d.prepare(
      `UPDATE redeem_order SET status='done', updated_at=? WHERE order_no=? AND pay_status='paid'`
    ).run(t, outTradeNo)
  } catch (_) {}
  return { ok: true, issued: issued.length, ticketNos: issued }
}

function listMyTickets(userId) {
  ensureSchema()
  const rows = db()
    .prepare(`SELECT * FROM festival_ticket WHERE user_id=? ORDER BY id DESC`)
    .all(userId)
  const list = rows.map(mapPass)
  return {
    list,
    validCount: list.filter((x) => x.valid).length,
    usedCount: list.filter((x) => x.status === 'used').length,
  }
}

function getPassByTicketNo(ticketNo, userId = null) {
  ensureSchema()
  const row = db().prepare(`SELECT * FROM festival_ticket WHERE ticket_no=?`).get(String(ticketNo || '').trim())
  if (!row) return null
  if (userId != null && Number(row.user_id) !== Number(userId)) return null
  return mapPass(row)
}

function findPassRow(code) {
  ensureSchema()
  const raw = String(code || '').trim()
  if (!raw) return null
  let ticketNo = raw
  let verify = raw
  if (raw.startsWith('FEST|')) {
    const parts = raw.split('|')
    ticketNo = parts[1] || ''
    verify = parts[2] || ''
  }
  const d = db()
  let row = d.prepare(`SELECT * FROM festival_ticket WHERE ticket_no=?`).get(ticketNo)
  if (!row) row = d.prepare(`SELECT * FROM festival_ticket WHERE verify_code=?`).get(verify)
  if (!row) row = d.prepare(`SELECT * FROM festival_ticket WHERE verify_code=?`).get(raw)
  return row || null
}

/**
 * 查验 / 作废电子票
 * 默认：当日可无限次进出 → 只记查验，不改 status=used
 * invalidate=true：作废（不可再进）
 * @param {{ code: string, by?: string, invalidate?: boolean }} opts
 */
function verifyPass({ code, by = 'staff', invalidate = false } = {}) {
  ensureSchema()
  const row = findPassRow(code)
  if (!row) return { ok: false, msg: '票不存在或核销码无效' }
  if (row.status === 'used') {
    return { ok: false, msg: '该票已作废失效', alreadyUsed: true, ticket: mapPass(row) }
  }
  if (row.status === 'refunded') return { ok: false, msg: '该票已退款', ticket: mapPass(row) }
  if (row.status === 'cancelled') return { ok: false, msg: '该票已取消', ticket: mapPass(row) }
  if (row.status !== 'valid') return { ok: false, msg: `当前状态不可核验：${row.status}`, ticket: mapPass(row) }

  const t = now()
  const who = String(by || 'staff').slice(0, 64)
  if (invalidate) {
    db()
      .prepare(
        `UPDATE festival_ticket SET status='used', verified_at=?, verified_by=? WHERE id=? AND status='valid'`
      )
      .run(t, who, row.id)
    const updated = db().prepare(`SELECT * FROM festival_ticket WHERE id=?`).get(row.id)
    return { ok: true, msg: '已作废（不可再进）', ticket: mapPass(updated), invalidated: true }
  }

  db()
    .prepare(`UPDATE festival_ticket SET verified_at=?, verified_by=? WHERE id=? AND status='valid'`)
    .run(t, who, row.id)
  const updated = db().prepare(`SELECT * FROM festival_ticket WHERE id=?`).get(row.id)
  return {
    ok: true,
    msg: '查验通过（当日可反复进出）',
    ticket: mapPass(updated),
    reentryAllowed: true,
  }
}

function markRefundedByOrder(orderNo) {
  ensureSchema()
  if (!orderNo) return { ok: false }
  const info = db()
    .prepare(
      `UPDATE festival_ticket SET status='refunded' WHERE order_no=? AND status IN ('valid','used')`
    )
    .run(String(orderNo))
  return { ok: true, changes: Number(info.changes || 0) }
}

function isFestivalVerifier(userId) {
  const allow = String(process.env.FESTIVAL_VERIFY_USER_IDS || process.env.FESTIVAL_VERIFY_OPENIDS || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  // 未配置白名单：任意登录用户可核销（首版方便现场；上线后建议配置）
  if (!allow.length) return true
  try {
    const u = db().prepare(`SELECT id, openid FROM app_user WHERE id=?`).get(userId)
    if (!u) return false
    if (allow.includes(String(u.id))) return true
    if (u.openid && allow.includes(String(u.openid))) return true
  } catch (_) {}
  return false
}

function ticketListPayloadItems() {
  return listTickets().list.map((t) => ({
    id: t.id,
    name: t.name,
    desc: t.desc,
    price: t.priceYuan,
    marketPrice: t.priceYuan,
    stock: t.stock,
    tag: t.tag,
    tone: t.tone,
    imageUrl: '',
    link: {
      type: 'page',
      path: '/pages/festival/index',
      params: {},
    },
  }))
}

module.exports = {
  FESTIVAL_PRICE_YUAN,
  TICKETS,
  ensureSchema,
  listTickets,
  getTicket,
  createOrder,
  financeCategoryForTicket,
  ticketListPayloadItems,
  issueTicketsForOrder,
  listMyTickets,
  getPassByTicketNo,
  verifyPass,
  markRefundedByOrder,
  isFestivalVerifier,
  mapPass,
  yuanToCent,
  priceBoard,
}

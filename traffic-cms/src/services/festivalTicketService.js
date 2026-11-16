/**
 * 汉服节报名票：固定 SKU + 微信支付下单（无物流地址）
 * 财务分类：festival_adult / festival_child
 */
const dbMod = require('../db')

const TICKETS = [
  {
    id: 'fest_adult_28',
    name: '汉服节成人票·11月28日',
    desc: '报名费含入园福利 · 11月28日',
    dayLabel: '11月28日',
    priceYuan: 30,
    payCashCent: 3000,
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
    priceYuan: 42,
    payCashCent: 4200,
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
    priceYuan: 60,
    payCashCent: 6000,
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
    priceYuan: 20,
    payCashCent: 2000,
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
    priceYuan: 20,
    payCashCent: 2000,
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
    priceYuan: 35,
    payCashCent: 3500,
    category: 'festival_child',
    audience: 'child',
    tag: '联报',
    tone: 'blue',
    stock: 9999,
    sortOrder: 6,
  },
]

const TICKET_MAP = Object.fromEntries(TICKETS.map((t) => [t.id, t]))

function db() {
  return dbMod.open()
}

function now() {
  return dbMod.nowIso()
}

function orderNo() {
  return `F${Date.now()}${Math.floor(Math.random() * 900 + 100)}`
}

function listTickets() {
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
      freeNote:
        '免报名费：符合岭南印象园免费入园政策者，按景区规定自行入园，无需报名缴费。',
      link: {
        type: 'page',
        path: '/pages/festival/checkout',
        params: { id: t.id },
      },
    })),
    freeNote:
      '免报名费：符合岭南印象园免费入园政策者，按景区规定自行入园，无需报名缴费。',
    event: {
      title: '2026汉服节·中国广州',
      dates: '2026年11月28—29日',
      venue: '广州·岭南印象园',
      theme: '星火成炬，四海归衣',
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

/**
 * 创建汉服节报名订单（待微信支付）
 */
function createOrder(userId, body = {}) {
  const ticketId = String(body.ticketId || body.productId || body.id || '').trim()
  const ticket = getTicket(ticketId)
  if (!ticket) return { ok: false, msg: '票种不存在' }
  const qty = Math.max(1, Math.min(5, Number(body.qty || 1) || 1))
  const visitor = String(body.visitor || body.name || '').trim()
  const phone = String(body.phone || '').trim()
  if (!visitor) return { ok: false, msg: '请填写出行人姓名' }
  if (!/^1\d{10}$/.test(phone)) return { ok: false, msg: '请填写有效手机号' }

  const payCashCent = ticket.payCashCent * qty
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
    // 兼容缺列
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

/** 给运营台 ticket_list 模块用的默认 items */
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
    link: t.link,
  }))
}

module.exports = {
  TICKETS,
  listTickets,
  getTicket,
  createOrder,
  financeCategoryForTicket,
  ticketListPayloadItems,
}

/**
 * 汉服节报名票：SKU + 微信支付下单 + 电子票出票/核销
 * 财务分类：festival_adult / festival_child
 *
 * 默认价见 DEFAULT_PRICE_YUAN；运营台可改 ops.festival.prices（立即生效，无需改代码）。
 * 多选日期合计 = 所选日票单价相加（不再自动套联报折扣价）。
 * 展示价 / 下单 pay_cash_cent / 微信 JSAPI 同源；客户端传价无效。
 */
const crypto = require('crypto')
const dbMod = require('../db')

/** @type {Record<string, number>} 默认单价（元）；可被 ops.festival.prices 覆盖 */
const DEFAULT_PRICE_YUAN = {
  fest_adult_28: 30,
  fest_adult_29: 42,
  fest_adult_both: 72,
  fest_child_28: 20,
  fest_child_29: 20,
  fest_child_both: 40,
}

/** @deprecated 兼容旧引用名 */
const FESTIVAL_PRICE_YUAN = DEFAULT_PRICE_YUAN

function yuanToCent(yuan) {
  const n = Number(yuan)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

function readOpsPrices() {
  try {
    const ops = require('./opsService').getOps()
    const p = (ops.festival && ops.festival.prices) || {}
    return p && typeof p === 'object' ? p : {}
  } catch (_) {
    return {}
  }
}

/** 运行时价目表（默认 + 运营台覆盖） */
function priceMap() {
  const overlay = readOpsPrices()
  const out = { ...DEFAULT_PRICE_YUAN }
  Object.keys(DEFAULT_PRICE_YUAN).forEach((id) => {
    const v = Number(overlay[id])
    if (Number.isFinite(v) && v > 0) out[id] = v
  })
  // 联报默认 = 两日单价之和（若运营未单独配联报）
  if (!(Number(overlay.fest_adult_both) > 0)) {
    out.fest_adult_both = Number(
      (Number(out.fest_adult_28) + Number(out.fest_adult_29)).toFixed(2)
    )
  }
  if (!(Number(overlay.fest_child_both) > 0)) {
    out.fest_child_both = Number(
      (Number(out.fest_child_28) + Number(out.fest_child_29)).toFixed(2)
    )
  }
  return out
}

function unitYuan(skuId) {
  const map = priceMap()
  const n = Number(map[String(skuId || '').trim()])
  return Number.isFinite(n) && n > 0 ? n : 0
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
  const map = priceMap()
  return TICKET_DEFS.map((def) => {
    const priceYuan = Number(map[def.id])
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

function listTicketRows() {
  return buildTickets()
}

function getTicket(id) {
  return listTicketRows().find((t) => t.id === String(id || '').trim()) || null
}

/** 仅元数据（名称/日期/人群），不读 ops、不触库 —— async 出票/列表路径专用 */
function getTicketMeta(id) {
  const key = String(id || '').trim()
  return TICKET_DEFS.find((t) => t.id === key) || null
}

/** @deprecated 兼容；请用 listTicketRows / getTicket（读运行时价） */
const TICKETS = TICKET_DEFS
const TICKET_MAP = Object.fromEntries(TICKET_DEFS.map((t) => [t.id, t]))
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

/** 东八区自然日，与任务日切一致 */
function shanghaiDayKey(input = new Date()) {
  const x = typeof input === 'string' ? new Date(input) : input instanceof Date ? input : new Date()
  if (Number.isNaN(x.getTime())) return '1970-01-01'
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const map = {}
    fmt.formatToParts(x).forEach((p) => {
      if (p.type !== 'literal') map[p.type] = p.value
    })
    return `${map.year || '1970'}-${map.month || '01'}-${map.day || '01'}`
  } catch (_) {
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }
}

/** 活动年份：优先内存默认，避免 async 路径里 getOps() deasync */
function eventYear() {
  return 2026
}

/** 将 ops 里的票号名单规范化为 Set（大写） */
function normalizeForceTodayNos(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(/[\s,;]+/)
  return new Set(
    list
      .map((x) => String(x || '').trim().toUpperCase())
      .filter(Boolean)
  )
}

/**
 * 测试白名单：仅这些票号强制按「今天」可用。
 * ⚠️ 同步 getOps 仅可用于「未 await」的同步栈；async 列表须用 loadForceTodayNosAsync / 传入 forceTodayNos。
 */
function testForceTodayNos() {
  try {
    const raw = (require('./opsService').getOps().festival || {}).testForceTodayTicketNos
    return normalizeForceTodayNos(raw)
  } catch (_) {
    return new Set()
  }
}

/** async 路径：走 getOpsAsync（带内存缓存），禁止 await 后再 deasync getOps */
async function loadForceTodayNosAsync() {
  try {
    const ops = await require('./opsService').getOpsAsync()
    return normalizeForceTodayNos((ops.festival || {}).testForceTodayTicketNos)
  } catch (_) {
    return new Set()
  }
}

function isTestForceTodayTicket(rowOrNo, forceTodayNos) {
  const tn = String(
    (rowOrNo && typeof rowOrNo === 'object' ? rowOrNo.ticket_no : rowOrNo) || ''
  )
    .trim()
    .toUpperCase()
  if (!tn) return false
  const set = forceTodayNos instanceof Set ? forceTodayNos : testForceTodayNos()
  return set.has(tn)
}

function dayKeyToCnLabel(dayKey) {
  const m = String(dayKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return '今日'
  return `${Number(m[2])}月${Number(m[3])}日`
}

/**
 * 票面对应的可用日（YYYY-MM-DD）。联报已拆成日票，通常只有一天。
 * @returns {string[]}
 */
function ticketValidDayKeys(row, forceTodayNos) {
  // 测试白名单：不改其它票的 SKU/日期解析
  if (isTestForceTodayTicket(row, forceTodayNos)) return [shanghaiDayKey()]

  const sku = String((row && row.sku_id) || '')
  const year = eventYear()
  const keys = []
  if (/_28$/.test(sku)) keys.push(`${year}-11-28`)
  if (/_29$/.test(sku)) keys.push(`${year}-11-29`)
  if (keys.length) return keys
  const label = String((row && row.day_label) || '')
  const m = label.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/)
  if (m) {
    keys.push(
      `${year}-${String(Number(m[1])).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`
    )
  }
  // 两日联报未拆分的旧票：两日均可
  if (/两日|联报/.test(label) || /_both$/.test(sku)) {
    keys.push(`${year}-11-28`, `${year}-11-29`)
  }
  return [...new Set(keys)]
}

function readVerifyStaffIds() {
  try {
    const f = (require('./opsService').getOps().festival || {})
    const raw = Array.isArray(f.verifyStaffIds) ? f.verifyStaffIds : []
    return raw
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0)
  } catch (_) {
    return []
  }
}

function ensureSchema() {
  if (schemaReady) return
  if (dbMod.DIALECT === 'mysql') {
    schemaReady = true
    return
  }
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
      d.exec(`
        CREATE TABLE IF NOT EXISTS festival_issue_lock (
          order_no VARCHAR(64) NOT NULL PRIMARY KEY,
          created_at VARCHAR(40) NOT NULL
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
      d.exec(`
        CREATE TABLE IF NOT EXISTS festival_issue_lock (
          order_no TEXT NOT NULL PRIMARY KEY,
          created_at TEXT NOT NULL
        )
      `)
    }
  } catch (e) {
    console.warn('[festival] ensureSchema', e && e.message)
  }
  schemaReady = true
}

function priceBoard() {
  const m = priceMap()
  const adult28 = m.fest_adult_28
  const adult29 = m.fest_adult_29
  const adultBoth = m.fest_adult_both
  const child28 = m.fest_child_28
  const child29 = m.fest_child_29
  const childBoth = m.fest_child_both
  return {
    adultLine: `28日 ¥${adult28} · 29日 ¥${adult29} · 两日合计 ¥${adultBoth}`,
    childLine:
      child28 === child29
        ? `28/29日 ¥${child28} · 两日合计 ¥${childBoth}`
        : `28日 ¥${child28} · 29日 ¥${child29} · 两日合计 ¥${childBoth}`,
    prices: { ...m },
  }
}

function listTickets() {
  const board = priceBoard()
  return {
    list: listTicketRows().map((t) => ({
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
    freeNote: '',
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

/** async 路由：先预热 ops 缓存，再同步拼装（热路径不再 deasync） */
async function listTicketsAsync() {
  try {
    await require('./opsService').getOpsAsync()
  } catch (_) {}
  // await 后禁止直接进入 getOps() 的同步 deasync；切到干净 setImmediate 栈。
  return dbMod.runSync(() => listTickets())
}

function financeCategoryForTicket(ticketOrId) {
  // 只用静态元数据，禁止 getTicket→getOps（支付回调 await 后会 deasync 超时崩溃）
  const t =
    typeof ticketOrId === 'string'
      ? getTicketMeta(ticketOrId)
      : ticketOrId && ticketOrId.id
        ? getTicketMeta(ticketOrId.id) || ticketOrId
        : ticketOrId
  if (!t) {
    const id = String(ticketOrId || '')
    return /child/.test(id) ? 'festival_child' : 'festival_adult'
  }
  return t.category === 'festival_child' ? 'festival_child' : 'festival_adult'
}

/** 解析下单票种：支持 ticketIds 多选（日票单价相加） */
function resolveOrderSkus(body = {}) {
  let ids = []
  if (Array.isArray(body.ticketIds) && body.ticketIds.length) {
    ids = body.ticketIds.map((x) => String(x || '').trim()).filter(Boolean)
  } else {
    const one = String(body.ticketId || body.productId || body.id || '').trim()
    if (one) ids = [one]
  }
  // 联报 SKU → 拆成两日，金额按日票相加
  const expanded = []
  ids.forEach((id) => {
    if (id === 'fest_adult_both') {
      expanded.push('fest_adult_28', 'fest_adult_29')
    } else if (id === 'fest_child_both') {
      expanded.push('fest_child_28', 'fest_child_29')
    } else {
      expanded.push(id)
    }
  })
  const uniq = [...new Set(expanded)]
  const skus = uniq.map((id) => getTicket(id)).filter(Boolean)
  return skus
}

function createOrder(userId, body = {}) {
  ensureSchema()
  const skus = resolveOrderSkus(body)
  if (!skus.length) return { ok: false, msg: '票种不存在' }
  const audiences = new Set(skus.map((s) => s.audience))
  if (audiences.size > 1) return { ok: false, msg: '请勿混选成人与儿童票' }
  const ticket = skus.length === 1 ? skus[0] : skus.find((s) => String(s.id).includes('_28')) || skus[0]
  const productId =
    skus.length === 1
      ? skus[0].id
      : skus[0].audience === 'child'
        ? 'fest_child_both'
        : 'fest_adult_both'
  const productName =
    skus.length === 1
      ? skus[0].name
      : skus[0].audience === 'child'
        ? '汉服节儿童/学生票·两日'
        : '汉服节成人票·两日'
  const dayLabel =
    skus.length === 1 ? skus[0].dayLabel : skus.map((s) => s.dayLabel).join(' + ')
  const qty = Math.max(1, Math.min(5, Number(body.qty || 1) || 1))
  const visitor = String(body.visitor || body.name || '').trim()
  const phone = String(body.phone || '').trim()
  if (!visitor) return { ok: false, msg: '请填写出行人姓名' }
  if (!/^1\d{10}$/.test(phone)) return { ok: false, msg: '请填写有效手机号' }

  // 金额 = 所选日票单价之和 × 份数（服务端价目表，忽略客户端传价）
  const unitCent = skus.reduce((sum, s) => sum + yuanToCent(unitYuan(s.id)), 0)
  if (unitCent <= 0) return { ok: false, msg: '票种价格未配置' }
  const payCashCent = unitCent * qty
  const ono = orderNo()
  const addrJson = JSON.stringify({
    name: visitor,
    phone,
    detail: `${dayLabel} · 汉服节电子报名票 · 岭南印象园`,
    full: `汉服节报名 · ${productName}`,
    entryFrom: 'festival',
    ticketId: productId,
    ticketIds: skus.map((s) => s.id),
    financeCategory: ticket.category,
    dayLabel,
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
      productId,
      productName,
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
      ).run(ono, userId, 'festival', productId, productName, qty, 0, payCashCent, 0, addrJson, t, t)
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
      productId,
      productName,
      qty,
      payCashCent,
      payStatus: 'unpaid',
      status: 'unpaid',
      needWxPay: true,
      financeCategory: ticket.category,
      ticketIds: skus.map((s) => s.id),
    },
    ticket: {
      id: productId,
      name: productName,
      priceYuan: unitCent / 100,
      category: ticket.category,
      ticketIds: skus.map((s) => s.id),
    },
  }
}

function mapPass(row, { todayKey = '', forceTodayNos = null } = {}) {
  if (!row) return null
  // 禁止 getTicket→getOps：列表在 await 之后调用，deasync 会 DB timeout
  // forceTodayNos 须由调用方在 await 前/queryAsync 读好后传入；勿在此 getOps()
  const sku = getTicketMeta(row.sku_id)
  const qrPayload = `FEST|${row.ticket_no}|${row.verify_code}`
  const validDays = ticketValidDayKeys(row, forceTodayNos)
  const today = todayKey || shanghaiDayKey()
  const forceToday = isTestForceTodayTicket(row, forceTodayNos)
  const isTodayTicket = validDays.length === 0 ? true : validDays.includes(today)
  let status = row.status || 'valid'
  let statusLabel = '待使用'
  if (status === 'used') statusLabel = '已使用'
  else if (status === 'refunded') statusLabel = '已退款'
  else if (status === 'cancelled') statusLabel = '已取消'
  else if (status === 'expired') statusLabel = '已过期'
  else if (status === 'valid') {
    if (validDays.length && validDays.every((d) => d < today)) {
      status = 'expired'
      statusLabel = '已过期'
    } else if (isTodayTicket) statusLabel = row.verified_at ? '今日可入场' : '待使用'
    else if (validDays.length && validDays.every((d) => d > today)) statusLabel = '未到使用日'
    else statusLabel = '待使用'
  }
  const todayCn = dayKeyToCnLabel(today)
  let dayLabel = row.day_label || (sku && sku.dayLabel) || ''
  let skuName = row.sku_name || (sku && sku.name) || ''
  if (forceToday) {
    dayLabel = todayCn
    // 票名里的「·11月28日」等同步成今天，便于对照验票结果
    skuName = String(skuName || '').replace(/·\s*\d{1,2}\s*月\s*\d{1,2}\s*日?/, `·${todayCn}`) || skuName
    if (skuName && !skuName.includes(todayCn) && !/·/.test(skuName)) {
      skuName = `${skuName}·${todayCn}`
    }
  }
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    verifyCode: row.verify_code,
    qrPayload,
    qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(qrPayload)}`,
    orderNo: row.order_no,
    userId: row.user_id,
    skuId: row.sku_id,
    skuName,
    dayLabel,
    validDays,
    audience: row.audience || (sku && sku.audience) || 'adult',
    visitor: row.visitor || '',
    phone: row.phone || '',
    status,
    statusLabel,
    verifiedAt: row.verified_at || '',
    verifiedBy: row.verified_by || '',
    createdAt: row.created_at || '',
    valid: status === 'valid',
    usableToday: status === 'valid' && isTodayTicket,
    testForceToday: forceToday,
  }
}

function buildDaySplits(order, productId, sku) {
  let addrTicketIds = []
  try {
    const addr = JSON.parse(order.address_json || '{}')
    if (Array.isArray(addr.ticketIds)) addrTicketIds = addr.ticketIds.map(String)
  } catch (_) {}
  if (addrTicketIds.length > 0) {
    return addrTicketIds.map((id) => {
      const s = getTicketMeta(id)
      return {
        skuId: id,
        dayLabel: (s && s.dayLabel) || '',
        name: (s && s.name) || id,
      }
    })
  }
  const audience = (sku && sku.audience) || 'adult'
  if (sku && String(sku.id || productId || '').endsWith('_both')) {
    return [
      {
        skuId: audience === 'child' ? 'fest_child_28' : 'fest_adult_28',
        dayLabel: '11月28日',
        name: `${audience === 'child' ? '儿童/学生' : '成人'}·11月28日`,
      },
      {
        skuId: audience === 'child' ? 'fest_child_29' : 'fest_adult_29',
        dayLabel: '11月29日',
        name: `${audience === 'child' ? '儿童/学生' : '成人'}·11月29日`,
      },
    ]
  }
  return [
    {
      skuId: productId,
      dayLabel: (sku && sku.dayLabel) || '',
      name: (sku && sku.name) || order.product_name || productId,
    },
  ]
}

/** 出票中途崩溃留下的锁，超过该时长允许接管 */
const ISSUE_LOCK_STALE_MS = 2 * 60 * 1000

/** 仅「已入账且未退款」的订单可出票 */
function orderIssuable(order) {
  const payStatus = order.pay_status || order.payStatus || ''
  const paid = payStatus === 'paid' || !!(order.wx_transaction_id || order.wxTransactionId)
  return paid && (order.status || '') !== 'refunded'
}

function claimIssueLock(d, orderNo) {
  const t = now()
  const r = d
    .prepare(`INSERT OR IGNORE INTO festival_issue_lock (order_no, created_at) VALUES (?,?)`)
    .run(orderNo, t)
  if (r && r.changes) return true
  const stale = new Date(Date.now() - ISSUE_LOCK_STALE_MS).toISOString()
  const u = d
    .prepare(`UPDATE festival_issue_lock SET created_at=? WHERE order_no=? AND created_at < ?`)
    .run(t, orderNo, stale)
  return !!(u && u.changes)
}

async function claimIssueLockAsync(orderNo) {
  const t = now()
  const [r] = await dbMod.queryAsync(
    `INSERT OR IGNORE INTO festival_issue_lock (order_no, created_at) VALUES (?,?)`,
    [orderNo, t]
  )
  if (r && r.affectedRows) return true
  const stale = new Date(Date.now() - ISSUE_LOCK_STALE_MS).toISOString()
  const [u] = await dbMod.queryAsync(
    `UPDATE festival_issue_lock SET created_at=? WHERE order_no=? AND created_at < ?`,
    [t, orderNo, stale]
  )
  return !!(u && u.affectedRows)
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
  if (!orderIssuable(order)) return { ok: false, issued: 0, msg: '订单未支付或已退款' }
  const d = db()
  const countIssued = () =>
    Number((d.prepare(`SELECT COUNT(*) AS n FROM festival_ticket WHERE order_no=?`).get(outTradeNo) || {}).n || 0)
  const existing = countIssued()
  if (existing > 0) return { ok: true, issued: existing, duplicate: true }
  if (!claimIssueLock(d, outTradeNo)) return { ok: true, issued: 0, pending: true }
  const recheck = countIssued()
  if (recheck > 0) return { ok: true, issued: recheck, duplicate: true }
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
  const daySplits = buildDaySplits(order, productId, sku)

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

  try {
    for (let i = 0; i < qty; i += 1) {
      daySplits.forEach(insertOne)
    }
  } catch (e) {
    try {
      issued.forEach((tn) => {
        d.prepare(`DELETE FROM festival_ticket WHERE order_no=? AND ticket_no=?`).run(outTradeNo, tn)
      })
      d.prepare(`DELETE FROM festival_issue_lock WHERE order_no=?`).run(outTradeNo)
    } catch (_) {}
    throw e
  }
  // 订单标为已完成履约（电子票）
  try {
    d.prepare(
      `UPDATE redeem_order SET status='done', updated_at=? WHERE order_no=? AND pay_status='paid'`
    ).run(t, outTradeNo)
  } catch (_) {}
  return { ok: true, issued: issued.length, ticketNos: issued }
}

/**
 * async 出票：支付回调 / 查单路径在 await 之后禁止直接 deasync。
 */
async function issueTicketsForOrderAsync(order) {
  await dbMod.runSync(() => ensureSchema())
  if (!order) return { ok: false, issued: 0 }
  const orderType = order.order_type || order.orderType || ''
  const productId = String(order.product_id || order.productId || '')
  if (orderType !== 'festival' && !productId.startsWith('fest_')) {
    return { ok: true, issued: 0, skipped: true }
  }
  const outTradeNo = order.order_no || order.orderNo
  if (!outTradeNo) return { ok: false, issued: 0, msg: '缺订单号' }
  if (!orderIssuable(order)) return { ok: false, issued: 0, msg: '订单未支付或已退款' }

  const countIssued = async () => {
    const [rows] = await dbMod.queryAsync(
      `SELECT COUNT(*) AS n FROM festival_ticket WHERE order_no=?`,
      [outTradeNo]
    )
    return Number((rows && rows[0] && rows[0].n) || 0)
  }
  const existN = await countIssued()
  if (existN > 0) return { ok: true, issued: existN, duplicate: true }
  if (!(await claimIssueLockAsync(outTradeNo))) return { ok: true, issued: 0, pending: true }
  const recheckN = await countIssued()
  if (recheckN > 0) return { ok: true, issued: recheckN, duplicate: true }

  // 仅用静态元数据，避免 await 后 getOps/deasync
  const sku = getTicketMeta(productId)
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
  const daySplits = buildDaySplits(order, productId, sku)
  const userId = order.user_id || order.userId
  const audience = (sku && sku.audience) || 'adult'

  try {
    for (let i = 0; i < qty; i += 1) {
      for (const meta of daySplits) {
        const tn = ticketNo()
        const vc = verifyCode()
        await dbMod.queryAsync(
          `INSERT INTO festival_ticket
           (ticket_no,verify_code,order_no,user_id,sku_id,sku_name,day_label,audience,visitor,phone,status,verified_at,verified_by,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,'valid','','',?)`,
          [tn, vc, outTradeNo, userId, meta.skuId, meta.name, meta.dayLabel, audience, visitor, phone, t]
        )
        issued.push(tn)
      }
    }
  } catch (e) {
    // 半张单不可留：撤掉本次已插入的票并释放锁，交给下次自愈重出
    try {
      if (issued.length) {
        await dbMod.queryAsync(
          `DELETE FROM festival_ticket WHERE order_no=? AND ticket_no IN (${issued.map(() => '?').join(',')})`,
          [outTradeNo, ...issued]
        )
      }
      await dbMod.queryAsync(`DELETE FROM festival_issue_lock WHERE order_no=?`, [outTradeNo])
    } catch (_) {}
    throw e
  }
  try {
    await dbMod.queryAsync(
      `UPDATE redeem_order SET status='done', updated_at=? WHERE order_no=? AND pay_status='paid'`,
      [t, outTradeNo]
    )
  } catch (_) {}
  return { ok: true, issued: issued.length, ticketNos: issued }
}

/**
 * 把「已支付但未出票」的汉服节订单补开电子票（支付回调超时/崩溃后的自愈）
 */
async function backfillPaidFestivalTickets(userId) {
  await dbMod.runSync(() => ensureSchema())
  const [orders] = await dbMod.queryAsync(
    `SELECT * FROM redeem_order
     WHERE user_id=? AND pay_status='paid'
       AND (order_type='festival' OR product_id LIKE 'fest_%')
     ORDER BY id DESC
     LIMIT 30`,
    [userId]
  )
  let issuedTotal = 0
  for (const o of orders || []) {
    try {
      const r = await issueTicketsForOrderAsync(o)
      if (r && r.issued && !r.duplicate) issuedTotal += Number(r.issued) || 0
    } catch (e) {
      console.warn('[festival] backfill tickets', o && o.order_no, e && e.message)
    }
  }
  return { ok: true, issued: issuedTotal }
}

function listMyTickets(userId) {
  ensureSchema()
  // 同步路径可读 getOps；仅此一处
  const forceTodayNos = testForceTodayNos()
  const todayKey = shanghaiDayKey()
  const rows = db()
    .prepare(`SELECT * FROM festival_ticket WHERE user_id=? ORDER BY id DESC`)
    .all(userId)
  const list = rows.map((r) => mapPass(r, { todayKey, forceTodayNos }))
  return {
    list,
    validCount: list.filter((x) => x.valid).length,
    usedCount: list.filter((x) => x.status === 'used').length,
  }
}

function withSoftTimeout(promise, ms, label) {
  const limit = Math.max(500, Number(ms) || 4000)
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label || 'timeout'} ${limit}ms`)), limit)
    }),
  ])
}

async function listMyTicketsAsync(userId) {
  // 先 async 读白名单，避免 await 后 mapPass→getOps deasync 超时
  const forceTodayNos = await loadForceTodayNosAsync()
  const todayKey = shanghaiDayKey()

  // 先出票列表，再后台补记/出票——禁止串行等待微信查单拖死整页
  const [rows] = await dbMod.queryAsync(
    `SELECT * FROM festival_ticket WHERE user_id=? ORDER BY id DESC`,
    [userId]
  )
  const list = (rows || []).map((r) => mapPass(r, { todayKey, forceTodayNos }))
  const result = {
    list,
    validCount: list.filter((x) => x.valid).length,
    usedCount: list.filter((x) => x.status === 'used').length,
  }

  setImmediate(() => {
    ;(async () => {
      try {
        await withSoftTimeout(
          require('./commerceService').syncUnpaidFestivalOrders(userId, { limit: 3 }),
          4000,
          'festival sync unpaid'
        )
      } catch (e) {
        console.warn('[festival] sync unpaid bg', e && e.message)
      }
      try {
        await withSoftTimeout(backfillPaidFestivalTickets(userId), 4000, 'festival backfill')
      } catch (e) {
        console.warn('[festival] backfill bg', e && e.message)
      }
    })().catch((e) => console.warn('[festival] heal bg', e && e.message))
  })

  return result
}

function getPassByTicketNo(ticketNo, userId = null) {
  ensureSchema()
  const row = db().prepare(`SELECT * FROM festival_ticket WHERE ticket_no=?`).get(String(ticketNo || '').trim())
  if (!row) return null
  if (userId != null && Number(row.user_id) !== Number(userId)) return null
  return mapPass(row, { todayKey: shanghaiDayKey(), forceTodayNos: testForceTodayNos() })
}

async function getPassByTicketNoAsync(ticketNo, userId = null) {
  ensureSchema()
  const [rows] = await dbMod.queryAsync(
    `SELECT * FROM festival_ticket WHERE ticket_no=? LIMIT 1`,
    [String(ticketNo || '').trim()]
  )
  const row = rows && rows[0]
  if (!row) return null
  if (userId != null && Number(row.user_id) !== Number(userId)) return null
  const forceTodayNos = await loadForceTodayNosAsync()
  return mapPass(row, { todayKey: shanghaiDayKey(), forceTodayNos })
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
 * 必须：票状态 valid 且票面可用日包含「今天」（东八区）
 * @param {{ code: string, by?: string, invalidate?: boolean }} opts
 */
function verifyPass({ code, by = 'staff', invalidate = false } = {}) {
  ensureSchema()
  const today = shanghaiDayKey()
  // 同步验票栈可读 getOps；一次性传入，避免 mapPass 内重复 getOps
  const forceTodayNos = testForceTodayNos()
  const row = findPassRow(code)
  if (!row) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      msg: '未找到票：二维码无效或票号错误',
    }
  }
  const pass = mapPass(row, { todayKey: today, forceTodayNos })
  if (row.status === 'used') {
    return { ok: false, code: 'VOIDED', msg: '该票已使用，不可入场', alreadyUsed: true, ticket: pass }
  }
  if (row.status === 'refunded') {
    return { ok: false, code: 'REFUNDED', msg: '该票已退款，不可入场', ticket: pass }
  }
  if (row.status === 'cancelled') {
    return { ok: false, code: 'CANCELLED', msg: '该票已取消，不可入场', ticket: pass }
  }
  if (row.status !== 'valid') {
    return { ok: false, code: 'BAD_STATUS', msg: `当前状态不可核验：${row.status}`, ticket: pass }
  }

  const validDays = ticketValidDayKeys(row, forceTodayNos)
  if (validDays.length) {
    if (!validDays.includes(today)) {
      if (validDays.every((d) => d < today)) {
        return {
          ok: false,
          code: 'EXPIRED',
          msg: `票已过期：仅限 ${pass.dayLabel || validDays.join('/')} 使用（今天 ${today}）`,
          ticket: pass,
          today,
        }
      }
      if (validDays.every((d) => d > today)) {
        return {
          ok: false,
          code: 'TOO_EARLY',
          msg: `未到使用日：请于 ${pass.dayLabel || validDays.join('/')} 出示（今天 ${today}）`,
          ticket: pass,
          today,
        }
      }
      return {
        ok: false,
        code: 'WRONG_DAY',
        msg: `非当日票：本票适用 ${pass.dayLabel || validDays.join('/')}，今天 ${today}`,
        ticket: pass,
        today,
      }
    }
  }

  const t = now()
  const who = String(by || 'staff').slice(0, 64)
  if (invalidate) {
    db()
      .prepare(
        `UPDATE festival_ticket SET status='used', verified_at=?, verified_by=? WHERE id=? AND status='valid'`
      )
      .run(t, who, row.id)
    const updated = db().prepare(`SELECT * FROM festival_ticket WHERE id=?`).get(row.id)
    return {
      ok: true,
      code: 'VOID_OK',
      msg: '已标记为已使用，不可再进',
      ticket: mapPass(updated, { todayKey: today, forceTodayNos }),
      invalidated: true,
    }
  }

  db()
    .prepare(`UPDATE festival_ticket SET verified_at=?, verified_by=? WHERE id=? AND status='valid'`)
    .run(t, who, row.id)
  const updated = db().prepare(`SELECT * FROM festival_ticket WHERE id=?`).get(row.id)
  return {
    ok: true,
    code: 'PASS',
    msg: '验票通过，可放行入场（当日可反复进出）',
    ticket: mapPass(updated, { todayKey: today, forceTodayNos }),
    reentryAllowed: true,
    today,
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

/**
 * 是否验票管理员。
 * 优先 ops.festival.verifyStaffIds；其次环境变量 FESTIVAL_VERIFY_USER_IDS。
 * 两边都空 → false（禁止全员验票）。
 */
function isFestivalVerifier(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return false
  const staffIds = readVerifyStaffIds()
  if (staffIds.length) return staffIds.includes(uid)

  const allow = String(process.env.FESTIVAL_VERIFY_USER_IDS || process.env.FESTIVAL_VERIFY_OPENIDS || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!allow.length) return false
  if (allow.includes(String(uid))) return true
  try {
    const u = db().prepare(`SELECT id, openid FROM user_account WHERE id=?`).get(uid)
    if (!u) return false
    if (u.openid && allow.includes(String(u.openid))) return true
  } catch (_) {}
  return false
}

/** async：预热 ops 后判权，避免 mine 页 onShow 打崩 deasync */
async function isFestivalVerifierAsync(userId) {
  try {
    await require('./opsService').getOpsAsync()
  } catch (_) {}
  try {
    return await dbMod.runSync(() => isFestivalVerifier(userId))
  } catch (_) {
    // 库抖动时降级：仅用已缓存/默认名单，勿再 deasync 查用户表
    const uid = Number(userId)
    if (!Number.isFinite(uid) || uid <= 0) return false
    try {
      return readVerifyStaffIds().includes(uid)
    } catch (_) {
      return false
    }
  }
}

function listVerifyStaff() {
  const ids = readVerifyStaffIds()
  if (!ids.length) return []
  let d
  try {
    d = db()
  } catch (e) {
    console.warn('[festival] listVerifyStaff db', e && e.message)
    return ids.map((id) => ({ id, nickName: `用户${id}`, openid: '', missing: true }))
  }
  return ids.map((id) => {
    try {
      const u = d
        .prepare(`SELECT id, nick_name, openid, avatar_url, status FROM user_account WHERE id=?`)
        .get(id)
      if (!u) return { id, nickName: `(用户 ${id} 不存在)`, openid: '', missing: true }
      return {
        id: u.id,
        nickName: u.nick_name || `用户${u.id}`,
        openid: u.openid || '',
        avatarUrl: u.avatar_url || '',
        status: u.status || '',
        missing: false,
      }
    } catch (_) {
      return { id, nickName: `用户${id}`, openid: '', missing: true }
    }
  })
}

function setVerifyStaffIds(ids) {
  const next = [...new Set((ids || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))]
  try {
    require('./opsService').saveOps({ festival: { verifyStaffIds: next } })
  } catch (e) {
    console.warn('[festival] setVerifyStaffIds', e && e.message)
    throw e
  }
  return { ok: true, ids: next, list: listVerifyStaff() }
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
  DEFAULT_PRICE_YUAN,
  FESTIVAL_PRICE_YUAN,
  TICKETS,
  ensureSchema,
  listTickets,
  listTicketsAsync,
  listTicketRows,
  getTicket,
  getTicketMeta,
  createOrder,
  financeCategoryForTicket,
  ticketListPayloadItems,
  issueTicketsForOrder,
  issueTicketsForOrderAsync,
  backfillPaidFestivalTickets,
  listMyTickets,
  listMyTicketsAsync,
  getPassByTicketNo,
  getPassByTicketNoAsync,
  verifyPass,
  markRefundedByOrder,
  isFestivalVerifier,
  isFestivalVerifierAsync,
  listVerifyStaff,
  setVerifyStaffIds,
  readVerifyStaffIds,
  shanghaiDayKey,
  ticketValidDayKeys,
  mapPass,
  yuanToCent,
  priceBoard,
  priceMap,
  unitYuan,
}

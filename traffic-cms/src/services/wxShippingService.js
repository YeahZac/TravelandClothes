/**
 * 微信小程序「订单发货管理」：发货信息录入 + 消息跳转 path。
 * 支付能力恢复本身依赖公众平台人工授权；本模块负责发货后同步物流，解冻结算。
 */
const dbMod = require('../db')
const wxAuth = require('./wxAuth')

/** 发货/确认收货消息跳转（平台会自动追加 transaction_id 等 query） */
const JUMP_PATH = 'pages/order/detail'
/**
 * 「订单信息录入 / 购物订单前往小程序」详情 path。
 * 必须原样包含「${商品订单号}」六字占位符，勿改成真实单号。
 */
const ORDER_DETAIL_PATH = 'pages/order/detail?id=${商品订单号}'

/** 常见快递名 → 微信运力编码（get_delivery_list）；未知则原样上传，便于运营填编码 */
const CARRIER_CODE_MAP = {
  顺丰: 'SF',
  顺丰速运: 'SF',
  顺丰快递: 'SF',
  SF: 'SF',
  中通: 'ZTO',
  中通快递: 'ZTO',
  ZTO: 'ZTO',
  圆通: 'YTO',
  圆通速递: 'YTO',
  YTO: 'YTO',
  申通: 'STO',
  申通快递: 'STO',
  STO: 'STO',
  韵达: 'YD',
  韵达快递: 'YD',
  YD: 'YD',
  京东: 'JD',
  京东物流: 'JD',
  京东快递: 'JD',
  JD: 'JD',
  邮政: 'EMS',
  邮政快递: 'EMS',
  中国邮政: 'EMS',
  EMS: 'EMS',
  极兔: 'JTSD',
  极兔速递: 'JTSD',
  JTSD: 'JTSD',
  德邦: 'DBL',
  德邦快递: 'DBL',
  DBL: 'DBL',
  丰网: 'FWX',
  丰网速运: 'FWX',
}

let jumpPathEnsured = false

function db() {
  return dbMod.open()
}

function maskPhone(phone) {
  const s = String(phone || '').replace(/\D/g, '')
  if (s.length < 7) return ''
  return `${s.slice(0, 3)}****${s.slice(-4)}`
}

function resolveExpressCompany(carrier) {
  const raw = String(carrier || '').trim()
  if (!raw) return 'STO'
  if (CARRIER_CODE_MAP[raw]) return CARRIER_CODE_MAP[raw]
  const upper = raw.toUpperCase()
  if (CARRIER_CODE_MAP[upper]) return CARRIER_CODE_MAP[upper]
  // 已是类似 SF / ZTO 的编码
  if (/^[A-Z0-9]{2,16}$/i.test(raw)) return upper
  return raw.slice(0, 128)
}

function rfc3339Now() {
  // 微信侧展示按东八区墙钟；禁止用容器本地 getFullYear/getHours（云托管常为 UTC）
  const { formatChinaDateTimeSeconds } = require('./chinaDay')
  return `${formatChinaDateTimeSeconds(new Date()).replace(' ', 'T')}+08:00`
}

async function openApiJson(path, body) {
  const token = await wxAuth.getAccessToken()
  const base = wxAuth.openApiBase()
  const url = `${base}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`
  // requestRaw 未导出：复用 getWxaCodeUnlimited 同通道，经 token URL 直 POST
  const http = require('http')
  const https = require('https')
  const payload = JSON.stringify(body || {})
  function postOnce(targetUrl) {
    const tu = new URL(targetUrl)
    const tlib = tu.protocol === 'https:' ? https : http
    const opts = {
      protocol: tu.protocol,
      hostname: tu.hostname,
      port: tu.port || (tu.protocol === 'https:' ? 443 : 80),
      path: `${tu.pathname}${tu.search}`,
      method: 'POST',
      family: 4,
      timeout: 15000,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }
    if (tu.protocol === 'https:') opts.rejectUnauthorized = !wxAuth.inCloudContainer()
    return new Promise((resolve, reject) => {
      const req = tlib.request(opts, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            buffer: Buffer.concat(chunks),
          })
        })
      })
      req.on('error', (e) => reject(e))
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('微信发货接口超时'))
      })
      req.write(payload)
      req.end()
    })
  }

  let raw = await postOnce(url)
  let data = {}
  try {
    data = JSON.parse(raw.buffer.toString('utf8') || '{}')
  } catch (_) {
    throw new Error('微信发货接口响应无效')
  }
  if (data.errcode === 40001 || data.errcode === 42001) {
    const token2 = await wxAuth.getAccessToken(true)
    const url2 = `${base}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token2)}`
    raw = await postOnce(url2)
    try {
      data = JSON.parse(raw.buffer.toString('utf8') || '{}')
    } catch (_) {
      throw new Error('微信发货接口响应无效')
    }
  }
  return data
}

/** 配置发货消息跳转 + 订单中心详情 path（失败不阻断发货） */
async function ensureMsgJumpPath({ force = false } = {}) {
  if (jumpPathEnsured && !force) return { ok: true, skipped: true }
  const results = {}
  try {
    const data = await openApiJson('/wxa/sec/order/set_msg_jump_path', { path: JUMP_PATH })
    results.msgJump = data
    if (data.errcode && Number(data.errcode) !== 0) {
      console.warn('[wx-shipping] set_msg_jump_path', data.errcode, data.errmsg)
    }
  } catch (e) {
    console.warn('[wx-shipping] set_msg_jump_path', e && e.message)
    results.msgJump = { ok: false, msg: (e && e.message) || 'set_msg_jump_path failed' }
  }
  try {
    // 购物订单「前往小程序」：与后台「订单信息录入」同一 path 能力
    const data = await openApiJson('/wxa/sec/order/update_order_detail_path', {
      path: ORDER_DETAIL_PATH,
    })
    results.orderDetailPath = data
    if (data.errcode && Number(data.errcode) !== 0) {
      console.warn('[wx-shipping] update_order_detail_path', data.errcode, data.errmsg)
    }
  } catch (e) {
    console.warn('[wx-shipping] update_order_detail_path', e && e.message)
    results.orderDetailPath = {
      ok: false,
      msg: (e && e.message) || 'update_order_detail_path failed',
    }
  }
  jumpPathEnsured = true
  return { ok: true, ...results }
}

function getUserOpenid(userId) {
  const row = db()
    .prepare(`SELECT openid FROM user_account WHERE id=?`)
    .get(userId)
  return row && row.openid ? String(row.openid) : ''
}

function ensureShippingStatusColumns() {
  const d = db()
  const add = dbMod.addColumnIfMissing
  // 本地 sqlite 可能缺支付列；补齐后再查/更新，避免 resync SQL 炸
  add(d, 'redeem_order', 'pay_status', `VARCHAR(16) NOT NULL DEFAULT 'none'`, `TEXT NOT NULL DEFAULT 'none'`)
  add(d, 'redeem_order', 'carrier', `VARCHAR(64) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'redeem_order', 'tracking_no', `VARCHAR(128) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'redeem_order', 'shipped_at', `VARCHAR(40) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(
    d,
    'redeem_order',
    'wx_shipping_status',
    `VARCHAR(16) NOT NULL DEFAULT 'none'`,
    `TEXT NOT NULL DEFAULT 'none'`
  )
  add(
    d,
    'redeem_order',
    'wx_shipping_msg',
    `VARCHAR(512) NOT NULL DEFAULT ''`,
    `TEXT NOT NULL DEFAULT ''`
  )
  add(
    d,
    'redeem_order',
    'wx_shipping_at',
    `VARCHAR(40) NOT NULL DEFAULT ''`,
    `TEXT NOT NULL DEFAULT ''`
  )
}

/** 将 upload 结果规范化并写回 redeem_order */
function persistShippingResult(orderId, result) {
  ensureShippingStatusColumns()
  const id = Number(orderId)
  if (!id) return result
  let status = 'none'
  let msg = ''
  if (!result) {
    status = 'fail'
    msg = '无返回'
  } else if (result.skipped) {
    status = 'skip'
    msg = String(result.reason || result.msg || 'skipped').slice(0, 500)
  } else if (result.ok) {
    status = 'ok'
    msg = result.duplicate ? 'duplicate' : 'ok'
  } else {
    status = 'fail'
    msg = String(result.msg || 'fail').slice(0, 500)
  }
  const t = dbMod.nowIso()
  try {
    db()
      .prepare(
        `UPDATE redeem_order
         SET wx_shipping_status=?, wx_shipping_msg=?, wx_shipping_at=?, updated_at=?
         WHERE id=?`
      )
      .run(status, msg, t, t, id)
  } catch (e) {
    console.warn('[wx-shipping] persist', e && e.message)
  }
  return {
    ...(result || {}),
    status,
    persistedAt: t,
  }
}

async function uploadAndPersist(order) {
  if (!order || !order.id) return { ok: false, msg: '订单不存在', status: 'fail' }
  ensureShippingStatusColumns()
  let result
  try {
    result = await uploadShippingForOrder(order)
  } catch (e) {
    result = { ok: false, msg: (e && e.message) || '微信发货同步失败' }
  }
  return persistShippingResult(order.id, result)
}

/**
 * 单条重推：要求已有运单（或允许无运单虚拟发货时仍可推）
 */
async function resyncOrderById(orderId) {
  ensureShippingStatusColumns()
  const row = db().prepare(`SELECT * FROM redeem_order WHERE id=?`).get(Number(orderId))
  if (!row) return { ok: false, msg: '订单不存在' }
  if (!['shipped', 'done'].includes(String(row.status || ''))) {
    return { ok: false, msg: '仅已发货/已完成订单可重推微信' }
  }
  if (Number(row.pay_cash_cent || 0) <= 0) {
    const r = persistShippingResult(row.id, { ok: true, skipped: true, reason: 'no_cash' })
    return { ok: true, skipped: true, wxShipping: r }
  }
  if (!String(row.tracking_no || '').trim()) {
    return { ok: false, msg: '请先填写运单号再重推' }
  }
  const wxShipping = await uploadAndPersist(row)
  return {
    ok: !!(wxShipping && (wxShipping.ok || wxShipping.skipped)),
    msg: wxShipping && !wxShipping.ok && !wxShipping.skipped ? wxShipping.msg : '',
    wxShipping,
  }
}

/**
 * 批量补同步：已发货现金单、有运单、未成功同步
 */
async function resyncPending({ limit = 50 } = {}) {
  ensureShippingStatusColumns()
  const lim = Math.min(100, Math.max(1, Number(limit) || 50))
  const rows = db()
    .prepare(
      `SELECT * FROM redeem_order
       WHERE IFNULL(pay_cash_cent,0) > 0
         AND IFNULL(pay_status,'') = 'paid'
         AND status IN ('shipped','done')
         AND TRIM(IFNULL(tracking_no,'')) <> ''
         AND IFNULL(wx_shipping_status,'none') NOT IN ('ok','skip')
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(lim)
  const summary = { total: rows.length, ok: 0, skip: 0, fail: 0, items: [] }
  for (const row of rows) {
    const wx = await uploadAndPersist(row)
    const st = (wx && wx.status) || (wx && wx.ok ? 'ok' : 'fail')
    if (st === 'ok') summary.ok += 1
    else if (st === 'skip') summary.skip += 1
    else summary.fail += 1
    summary.items.push({
      id: row.id,
      orderNo: row.order_no,
      status: st,
      msg: (wx && wx.msg) || '',
    })
  }
  return { ok: true, ...summary }
}

/**
 * 运营台发货后同步微信发货信息（仅现金已支付单需要）。
 * @param {object} order redeem_order 行
 */
async function uploadShippingForOrder(order) {
  if (!order) return { ok: false, msg: '订单不存在' }
  const cash = Number(order.pay_cash_cent || 0)
  if (cash <= 0) return { ok: true, skipped: true, reason: 'no_cash' }
  if (String(order.pay_status || '') !== 'paid' && !order.wx_transaction_id) {
    return { ok: true, skipped: true, reason: 'unpaid' }
  }
  const openid = getUserOpenid(order.user_id)
  if (!openid || openid.startsWith('demo_')) {
    return { ok: false, msg: '用户无有效 openid，无法同步微信发货' }
  }

  await ensureMsgJumpPath()

  let addr = {}
  try {
    addr = typeof order.address_json === 'string' ? JSON.parse(order.address_json || '{}') : order.address_json || {}
  } catch (_) {}
  const phoneMask = maskPhone(addr.phone)
  const track = String(order.tracking_no || '').trim()
  const itemDesc = `${order.product_name || '商品'}*${Math.max(1, Number(order.qty) || 1)}`.slice(0, 120)
  const shippingItem = {
    item_desc: itemDesc,
  }
  if (track) {
    shippingItem.tracking_no = track
    shippingItem.express_company = resolveExpressCompany(order.carrier)
    if (phoneMask) shippingItem.contact = { receiver_contact: phoneMask }
  }

  const orderKey = order.wx_transaction_id
    ? { order_number_type: 2, transaction_id: order.wx_transaction_id }
    : {
        order_number_type: 1,
        mchid: process.env.WX_MCH_ID || '',
        out_trade_no: order.order_no,
      }

  const body = {
    order_key: orderKey,
    logistics_type: track ? 1 : 4,
    delivery_mode: 1,
    shipping_list: [shippingItem],
    upload_time: rfc3339Now(),
    payer: { openid },
  }

  const data = await openApiJson('/wxa/sec/order/upload_shipping_info', body)
  if (data.errcode && Number(data.errcode) !== 0) {
    // 已录入过视为成功
    if (/已发货|已经录入|已上传/i.test(String(data.errmsg || ''))) {
      return { ok: true, duplicate: true, wx: data }
    }
    return { ok: false, msg: data.errmsg || `errcode ${data.errcode}`, wx: data }
  }
  return { ok: true, wx: data }
}

/**
 * 查询：是否已开通发货信息管理、是否完成交易结算管理确认。
 * 对应官方 is_trade_managed / is_trade_management_confirmation_completed。
 */
async function tradeManagedStatus() {
  const appid = process.env.WX_APPID || require('./wxAuth').DEFAULT_APPID
  const managed = await openApiJson('/wxa/sec/order/is_trade_managed', { appid })
  let confirmed = null
  try {
    confirmed = await openApiJson('/wxa/sec/order/is_trade_management_confirmation_completed', {
      appid,
    })
  } catch (e) {
    confirmed = { errcode: -1, errmsg: (e && e.message) || 'query failed' }
  }
  let detailPath = null
  try {
    detailPath = await openApiJson('/wxa/sec/order/get_order_detail_path', {})
  } catch (e) {
    detailPath = { errcode: -1, errmsg: (e && e.message) || 'query failed' }
  }
  return {
    ok: true,
    appid,
    tradeManaged: Number(managed && managed.errcode) === 0 ? !!managed.is_trade_managed : null,
    tradeManagedRaw: managed,
    confirmationCompleted:
      Number(confirmed && confirmed.errcode) === 0
        ? !!confirmed.completed
        : null,
    confirmationRaw: confirmed,
    orderDetailPath: (detailPath && detailPath.path) || '',
    orderDetailPathExpected: ORDER_DETAIL_PATH,
    orderDetailPathConfigured: !!(detailPath && detailPath.path),
    orderDetailPathRaw: detailPath,
    msgJumpPath: JUMP_PATH,
  }
}

module.exports = {
  uploadShippingForOrder,
  uploadAndPersist,
  persistShippingResult,
  ensureShippingStatusColumns,
  resyncOrderById,
  resyncPending,
  ensureMsgJumpPath,
  resolveExpressCompany,
  tradeManagedStatus,
  JUMP_PATH,
  ORDER_DETAIL_PATH,
}

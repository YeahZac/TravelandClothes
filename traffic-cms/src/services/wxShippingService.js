/**
 * 微信小程序「订单发货管理」：发货信息录入 + 消息跳转 path。
 * 支付能力恢复本身依赖公众平台人工授权；本模块负责发货后同步物流，解冻结算。
 */
const dbMod = require('../db')
const wxAuth = require('./wxAuth')

const JUMP_PATH = 'pages/order/detail'

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
  const d = new Date()
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  const tz = -d.getTimezoneOffset()
  const sign = tz >= 0 ? '+' : '-'
  const abs = Math.abs(tz)
  const hh = pad(Math.floor(abs / 60))
  const mm = pad(abs % 60)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}` +
    `${sign}${hh}:${mm}`
  )
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

/** 配置发货消息跳转小程序 path（一次性；失败不阻断发货） */
async function ensureMsgJumpPath() {
  if (jumpPathEnsured) return { ok: true, skipped: true }
  try {
    const data = await openApiJson('/wxa/sec/order/set_msg_jump_path', { path: JUMP_PATH })
    if (data.errcode && Number(data.errcode) !== 0) {
      console.warn('[wx-shipping] set_msg_jump_path', data.errcode, data.errmsg)
      return { ok: false, msg: data.errmsg || String(data.errcode) }
    }
    jumpPathEnsured = true
    return { ok: true }
  } catch (e) {
    console.warn('[wx-shipping] set_msg_jump_path', e && e.message)
    return { ok: false, msg: (e && e.message) || 'set_msg_jump_path failed' }
  }
}

function getUserOpenid(userId) {
  const row = db()
    .prepare(`SELECT openid FROM user_account WHERE id=?`)
    .get(userId)
  return row && row.openid ? String(row.openid) : ''
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
  }
}

module.exports = {
  uploadShippingForOrder,
  ensureMsgJumpPath,
  resolveExpressCompany,
  tradeManagedStatus,
  JUMP_PATH,
}

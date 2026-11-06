/**
 * 微信小程序支付（APIv3 · JSAPI）
 * 证书与密钥只从环境变量 / certs 目录读取，勿提交仓库。
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const https = require('https')
const dbMod = require('../db')

const ROOT = path.join(__dirname, '..', '..')

function materializePem(envName, fallbackPath) {
  const inline = process.env[envName] || ''
  if (inline && inline.includes('BEGIN')) {
    const dir = path.join(ROOT, 'certs/wxpay')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const out = path.join(dir, envName.toLowerCase() + '.pem')
    fs.writeFileSync(out, inline.replace(/\\n/g, '\n'), { mode: 0o600 })
    return out
  }
  return fallbackPath
}

function cfg() {
  const mchid = process.env.WX_MCH_ID || ''
  const appid = process.env.WX_APPID || ''
  const apiV3Key = process.env.WX_API_V3_KEY || ''
  const serialNo = (process.env.WX_MCH_SERIAL_NO || '').toUpperCase()
  const keyPath = materializePem(
    'WX_MCH_KEY_PEM',
    process.env.WX_MCH_KEY_PATH || path.join(ROOT, 'certs/wxpay/apiclient_key.pem')
  )
  const certPath = materializePem(
    'WX_MCH_CERT_PEM',
    process.env.WX_MCH_CERT_PATH || path.join(ROOT, 'certs/wxpay/apiclient_cert.pem')
  )
  const publicBase = (process.env.PUBLIC_BASE_URL || 'https://linyitech.cloud').replace(/\/$/, '')
  const notifyUrl =
    process.env.WX_PAY_NOTIFY_URL || `${publicBase}/api/traffic/v1/pay/wx/notify`
  return { mchid, appid, apiV3Key, serialNo, keyPath, certPath, publicBase, notifyUrl }
}

function isConfigured() {
  const c = cfg()
  const hasKey = !!(process.env.WX_MCH_KEY_PEM && process.env.WX_MCH_KEY_PEM.includes('BEGIN')) || fs.existsSync(c.keyPath)
  return !!(c.mchid && c.appid && c.apiV3Key && c.serialNo && hasKey)
}

function status() {
  const c = cfg()
  return {
    configured: isConfigured(),
    mchid: c.mchid || null,
    appid: c.appid || null,
    notifyUrl: c.notifyUrl,
    certPresent:
      (!!process.env.WX_MCH_KEY_PEM && process.env.WX_MCH_KEY_PEM.includes('BEGIN')) ||
      (fs.existsSync(c.keyPath) && fs.existsSync(c.certPath)),
    serialNo: c.serialNo ? `${c.serialNo.slice(0, 8)}…` : null,
    dialect: require('../db').DIALECT,
  }
}

function loadPrivateKey() {
  const c = cfg()
  if (process.env.WX_MCH_KEY_PEM && process.env.WX_MCH_KEY_PEM.includes('BEGIN')) {
    return Buffer.from(process.env.WX_MCH_KEY_PEM.replace(/\\n/g, '\n'))
  }
  return fs.readFileSync(c.keyPath)
}

function db() {
  return dbMod.open()
}

function ensurePayColumns() {
  const d = db()
  const cols = d.prepare('PRAGMA table_info(redeem_order)').all().map((c) => c.name)
  const adds = [
    ['pay_status', `ALTER TABLE redeem_order ADD COLUMN pay_status TEXT NOT NULL DEFAULT 'none'`],
    ['wx_prepay_id', `ALTER TABLE redeem_order ADD COLUMN wx_prepay_id TEXT NOT NULL DEFAULT ''`],
    ['wx_transaction_id', `ALTER TABLE redeem_order ADD COLUMN wx_transaction_id TEXT NOT NULL DEFAULT ''`],
    ['paid_at', `ALTER TABLE redeem_order ADD COLUMN paid_at TEXT NOT NULL DEFAULT ''`],
  ]
  for (const [name, sql] of adds) {
    if (!cols.includes(name)) d.exec(sql)
  }
  d.exec(`
    CREATE TABLE IF NOT EXISTS wx_pay_notify (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      out_trade_no TEXT NOT NULL,
      transaction_id TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(out_trade_no, transaction_id)
    )
  `)
}

function authHeader(method, urlPath, body = '') {
  const { mchid, serialNo } = cfg()
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`
  const signature = crypto.createSign('RSA-SHA256').update(message).sign(loadPrivateKey(), 'base64')
  return (
    `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",` +
    `nonce_str="${nonce}",` +
    `signature="${signature}",` +
    `timestamp="${timestamp}",` +
    `serial_no="${serialNo}"`
  )
}

function requestWx(method, urlPath, dataObj = null) {
  const body = dataObj == null ? '' : JSON.stringify(dataObj)
  const authorization = authHeader(method, urlPath, body)
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.mch.weixin.qq.com',
        path: urlPath,
        method,
        headers: {
          Authorization: authorization,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'traffic-cms-wxpay',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json = null
          try {
            json = text ? JSON.parse(text) : null
          } catch (e) {
            return reject(new Error(`微信支付响应非 JSON: ${text.slice(0, 200)}`))
          }
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json)
          else {
            const msg = (json && (json.message || json.code)) || text.slice(0, 200)
            const err = new Error(`微信支付错误 ${res.statusCode}: ${msg}`)
            err.status = res.statusCode
            err.body = json
            reject(err)
          }
        })
      }
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function buildJsapiPayParams(prepayId) {
  const { appid } = cfg()
  const timeStamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr = crypto.randomBytes(16).toString('hex')
  const pkg = `prepay_id=${prepayId}`
  const message = `${appid}\n${timeStamp}\n${nonceStr}\n${pkg}\n`
  const paySign = crypto.createSign('RSA-SHA256').update(message).sign(loadPrivateKey(), 'base64')
  return {
    timeStamp,
    nonceStr,
    package: pkg,
    signType: 'RSA',
    paySign,
  }
}

function decryptResource(resource) {
  const { apiV3Key } = cfg()
  const { ciphertext, associated_data: aad, nonce } = resource
  const buf = Buffer.from(ciphertext, 'base64')
  const authTag = buf.subarray(buf.length - 16)
  const data = buf.subarray(0, buf.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonce))
  if (aad) decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(authTag)
  const decoded = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(decoded.toString('utf8'))
}

/** 平台证书缓存（验签用） */
let platformCertCache = { at: 0, map: new Map() }

async function refreshPlatformCerts() {
  const list = await requestWx('GET', '/v3/certificates')
  const map = new Map()
  for (const item of list.data || []) {
    const pem = decryptResource(item.encrypt_certificate)
    map.set(String(item.serial_no).toUpperCase(), pem)
  }
  platformCertCache = { at: Date.now(), map }
  return map
}

async function getPlatformCertPem(serial) {
  const key = String(serial || '').toUpperCase()
  if (!platformCertCache.map.has(key) || Date.now() - platformCertCache.at > 12 * 3600 * 1000) {
    await refreshPlatformCerts()
  }
  const pem = platformCertCache.map.get(key)
  if (!pem) throw new Error(`未找到平台证书 serial=${key}`)
  return pem
}

async function verifyNotifySignature(headers, rawBody) {
  const timestamp = headers['wechatpay-timestamp'] || headers['Wechatpay-Timestamp']
  const nonce = headers['wechatpay-nonce'] || headers['Wechatpay-Nonce']
  const signature = headers['wechatpay-signature'] || headers['Wechatpay-Signature']
  const serial = headers['wechatpay-serial'] || headers['Wechatpay-Serial']
  if (!timestamp || !nonce || !signature || !serial) {
    throw new Error('回调缺少验签头')
  }
  const pem = await getPlatformCertPem(serial)
  const message = `${timestamp}\n${nonce}\n${rawBody}\n`
  const ok = crypto.createVerify('RSA-SHA256').update(message).verify(pem, signature, 'base64')
  if (!ok) throw new Error('回调验签失败')
}

function getUserOpenid(userId) {
  const row = db()
    .prepare(`SELECT openid, platform FROM user_account WHERE id=?`)
    .get(userId)
  if (!row || !row.openid) throw new Error('用户未绑定微信 openid')
  if (String(row.openid).startsWith('demo_')) {
    throw new Error('演示账号无法发起真实支付，请用微信登录')
  }
  return row.openid
}

/**
 * 为现金订单创建 JSAPI 预支付，返回小程序 wx.requestPayment 参数
 */
async function createJsapiPrepay(userId, orderNo) {
  if (!isConfigured()) throw new Error('微信支付未配置完整（商户号/证书/APIv3密钥）')
  ensurePayColumns()
  const d = db()
  const order = d.prepare(`SELECT * FROM redeem_order WHERE order_no=? AND user_id=?`).get(orderNo, userId)
  if (!order) throw new Error('订单不存在')
  if (Number(order.pay_cash_cent || 0) <= 0) throw new Error('该订单无需微信支付')
  if (order.pay_status === 'paid' || order.wx_transaction_id) throw new Error('订单已支付')
  if (order.status === 'cancelled') throw new Error('订单已取消')

  const openid = getUserOpenid(userId)
  const { appid, mchid, notifyUrl } = cfg()
  const description = String(order.product_name || '全民优享订单').slice(0, 120)
  const body = {
    appid,
    mchid,
    description,
    out_trade_no: order.order_no,
    notify_url: notifyUrl,
    amount: { total: Number(order.pay_cash_cent), currency: 'CNY' },
    payer: { openid },
  }

  const res = await requestWx('POST', '/v3/pay/transactions/jsapi', body)
  const prepayId = res.prepay_id
  if (!prepayId) throw new Error('未返回 prepay_id')

  d.prepare(
    `UPDATE redeem_order SET wx_prepay_id=?, pay_status='prepay', updated_at=? WHERE id=?`
  ).run(prepayId, new Date().toISOString(), order.id)

  const payParams = buildJsapiPayParams(prepayId)
  return {
    orderNo: order.order_no,
    amountCent: Number(order.pay_cash_cent),
    notifyUrl,
    ...payParams,
  }
}

function markOrderPaid(outTradeNo, transactionId) {
  ensurePayColumns()
  const d = db()
  const order = d.prepare(`SELECT * FROM redeem_order WHERE order_no=?`).get(outTradeNo)
  if (!order) return { ok: false, msg: '订单不存在' }
  if (order.pay_status === 'paid') return { ok: true, duplicate: true, order }

  const now = new Date().toISOString()
  const tx = d.transaction(() => {
    d.prepare(
      `UPDATE redeem_order
       SET pay_status='paid', wx_transaction_id=?, paid_at=?, status=CASE WHEN status='unpaid' THEN 'pending' ELSE status END, updated_at=?
       WHERE id=?`
    ).run(transactionId || '', now, now, order.id)

    try {
      d.prepare(
        `INSERT OR IGNORE INTO wx_pay_notify (out_trade_no, transaction_id, payload_json, created_at)
         VALUES (?,?,?,?)`
      ).run(outTradeNo, transactionId || '', JSON.stringify({ transactionId }), now)
    } catch (e) {}

    const adminService = require('./adminService')
    if (Number(order.pay_cash_cent || 0) > 0) {
      const exists = d
        .prepare(
          `SELECT id FROM finance_ledger WHERE ref_type='order' AND ref_id=? AND entry_type='revenue' LIMIT 1`
        )
        .get(outTradeNo)
      if (!exists) {
        adminService.addFinance({
          entryType: 'revenue',
          category: order.order_type === 'mall' ? 'mall_sale' : 'cash_redeem',
          amountCent: Number(order.pay_cash_cent),
          refType: 'order',
          refId: outTradeNo,
          note: `${order.product_name} · 微信支付`,
        })
      }
    }
    if (Number(order.cost_cent || 0) > 0) {
      const costExists = d
        .prepare(
          `SELECT id FROM finance_ledger WHERE ref_type='order' AND ref_id=? AND entry_type='cost' AND category='gift_cost' LIMIT 1`
        )
        .get(outTradeNo)
      if (!costExists) {
        adminService.addFinance({
          entryType: 'cost',
          category: 'gift_cost',
          amountCent: Number(order.cost_cent),
          refType: 'order',
          refId: outTradeNo,
          note: `履约成本 ${order.product_name}`,
        })
      }
    }
  })
  tx()
  return { ok: true, order: d.prepare(`SELECT * FROM redeem_order WHERE id=?`).get(order.id) }
}

async function handleNotify(headers, rawBody) {
  if (!isConfigured()) throw new Error('微信支付未配置')
  const raw = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody || '').toString('utf8')
  await verifyNotifySignature(headers, raw)
  const envelope = JSON.parse(raw)
  const resource = decryptResource(envelope.resource)
  // resource: { out_trade_no, transaction_id, trade_state, amount, ... }
  if (resource.trade_state && resource.trade_state !== 'SUCCESS') {
    return { code: 'SUCCESS', message: '忽略非成功状态' }
  }
  const r = markOrderPaid(resource.out_trade_no, resource.transaction_id)
  if (!r.ok) throw new Error(r.msg || '记账失败')
  return { code: 'SUCCESS', message: '成功' }
}

async function queryByOutTradeNo(outTradeNo) {
  const { mchid } = cfg()
  return requestWx('GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${mchid}`)
}

module.exports = {
  cfg,
  isConfigured,
  status,
  ensurePayColumns,
  createJsapiPrepay,
  handleNotify,
  markOrderPaid,
  queryByOutTradeNo,
  buildJsapiPayParams,
}

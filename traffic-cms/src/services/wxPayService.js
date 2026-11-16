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

/** 规范化 PEM：去引号、\\n → 换行、补齐头尾 */
function normalizePem(raw) {
  let s = String(raw || '').trim()
  if (!s) return ''
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1)
  }
  // 云托管控制台常见：真实换行被压成空格，或存成字面量 \n / \\n
  s = s
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\u2028|\u2029/g, '\n')
    .trim()
  if (!s.includes('BEGIN') && /^[A-Za-z0-9+/=\s]+$/.test(s)) {
    const b64 = s.replace(/\s+/g, '')
    const lines = b64.match(/.{1,64}/g) || [b64]
    s = `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`
  }
  return s
}

/**
 * 云托管把多行 PEM 粘成一行（BEGIN… base64空格分隔 …END）时，
 * OpenSSL3 会报 DECODER unsupported。抽出 base64 按 64 列重排即可。
 */
function repairPem(raw) {
  let s = normalizePem(raw)
  if (!s) return ''
  // 云托管偶发：把换行压成空格 → "-----BEGIN PUBLIC KEY----- MIIB... -----END PUBLIC KEY-----"
  if (!s.includes('\n') && /BEGIN [^-]+-----/.test(s)) {
    s = s
      .replace(/(-----BEGIN [^-]+-----)\s+/, '$1\n')
      .replace(/\s+(-----END [^-]+-----)/, '\n$1')
  }
  const m = s.match(/-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/)
  if (!m) return s
  const kind = m[1].trim()
  const body = String(m[2] || '').replace(/[^A-Za-z0-9+/=]/g, '')
  if (body.length < 80) return s
  const lines = body.match(/.{1,64}/g) || [body]
  return `-----BEGIN ${kind}-----\n${lines.join('\n')}\n-----END ${kind}-----`
}

function materializePem(envName, fallbackPath) {
  const inline = repairPem(process.env[envName] || '')
  if (inline && inline.includes('BEGIN')) {
    const dir = path.join(ROOT, 'certs/wxpay')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const out = path.join(dir, envName.toLowerCase() + '.pem')
    fs.writeFileSync(out, inline, { mode: 0o600 })
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
  // 新商户 / 已切公钥模式：平台证书接口会 404，须用微信支付公钥验签回调
  const payPublicKeyPath = materializePem(
    'WX_PAY_PUBLIC_KEY_PEM',
    process.env.WX_PAY_PUBLIC_KEY_PATH || path.join(ROOT, 'certs/wxpay/wxp_pub.pem')
  )
  const payPublicKeyId = String(
    process.env.WX_PAY_PUBLIC_KEY_ID || process.env.WX_PUB_KEY_ID || ''
  ).trim()
  const publicBase = (
    process.env.PUBLIC_BASE_URL ||
    'https://test-sever-316843-10-1492159324.sh.run.tcloudbase.com'
  ).replace(/\/$/, '')
  const notifyUrl =
    process.env.WX_PAY_NOTIFY_URL || `${publicBase}/api/traffic/v1/pay/wx/notify`
  return {
    mchid,
    appid,
    apiV3Key,
    serialNo,
    keyPath,
    certPath,
    payPublicKeyPath,
    payPublicKeyId,
    publicBase,
    notifyUrl,
  }
}

function isConfigured() {
  const c = cfg()
  const envPem = repairPem(process.env.WX_MCH_KEY_PEM || '')
  const hasKey =
    (envPem && /PRIVATE KEY/i.test(envPem)) ||
    (fs.existsSync(c.keyPath) && fs.statSync(c.keyPath).size > 0)
  return !!(c.mchid && c.appid && c.apiV3Key && c.serialNo && hasKey)
}

function tryCreatePrivateKey(pem) {
  const candidates = [pem, repairPem(pem)].filter(Boolean)
  let lastErr = null
  for (const p of candidates) {
    try {
      return crypto.createPrivateKey(p)
    } catch (e1) {
      lastErr = e1
      try {
        return crypto.createPrivateKey({ key: p, format: 'pem', type: 'pkcs8' })
      } catch (_) {
        try {
          return crypto.createPrivateKey({ key: p, format: 'pem', type: 'pkcs1' })
        } catch (e3) {
          lastErr = e3
        }
      }
    }
  }
  throw lastErr || new Error('DECODER unsupported')
}

function status() {
  const c = cfg()
  let keyOk = false
  let keyError = ''
  let keyHeader = ''
  let keyBodyLen = 0
  try {
    const rawSrc =
      process.env.WX_MCH_KEY_PEM ||
      (fs.existsSync(c.keyPath) ? fs.readFileSync(c.keyPath, 'utf8') : '')
    const raw = repairPem(rawSrc)
    keyHeader = (raw.match(/BEGIN ([^-]+)-----/) || [])[1] || ''
    const body = (raw.match(/-----BEGIN [^-]+-----([\s\S]*?)-----END /) || [])[1] || ''
    keyBodyLen = String(body).replace(/[^A-Za-z0-9+/=]/g, '').length
    const k = loadPrivateKey()
    keyOk = !!k
  } catch (e) {
    keyError = (e && e.message) || String(e)
  }
  let pubPem = ''
  let pubKeyError = ''
  try {
    pubPem = loadPayPublicKeyPem()
  } catch (e) {
    pubKeyError = (e && e.message) || String(e)
  }
  return {
    configured: isConfigured() && keyOk,
    mchid: c.mchid || null,
    appid: c.appid || null,
    notifyUrl: c.notifyUrl,
    certPresent:
      (!!process.env.WX_MCH_KEY_PEM && /BEGIN/i.test(process.env.WX_MCH_KEY_PEM)) ||
      (fs.existsSync(c.keyPath) && fs.existsSync(c.certPath)),
    keyOk,
    keyHeader,
    keyBodyLen,
    keyError: keyError ? String(keyError).slice(0, 200) : '',
    serialNo: c.serialNo ? `${c.serialNo.slice(0, 8)}…` : null,
    payPublicKeyConfigured: !!pubPem,
    payPublicKeyId: c.payPublicKeyId || null,
    payPublicKeyError: pubKeyError ? String(pubKeyError).slice(0, 200) : '',
    payPublicKeyEnvPresent: !!(
      process.env.WX_PAY_PUBLIC_KEY_PEM ||
      process.env.WX_PAY_PUBLIC_KEY_ID ||
      process.env.WX_PUB_KEY_ID
    ),
    payPublicKeyPemLen: pubPem ? pubPem.length : 0,
    payPublicKeyFp: pubPem
      ? crypto.createHash('sha256').update(pubPem).digest('hex').slice(0, 12)
      : null,
    verifyMode: pubPem
      ? 'wx_pay_public_key'
      : c.payPublicKeyId
        ? 'public_key_id_without_pem'
        : 'platform_cert_only',
    buildTag: 'wxpay-confirm-query-20261116a',
    dialect: require('../db').DIALECT,
  }
}

/**
 * 加载商户 API 私钥为 KeyObject。
 * 云托管常见坑：环境变量把 PEM 换行弄成空格 / 误贴证书 / PKCS#1↔PKCS#8，
 * 会触发 OpenSSL `DECODER routines::unsupported`。
 */
function loadPrivateKey() {
  const c = cfg()
  let pem = ''
  if (process.env.WX_MCH_KEY_PEM && /BEGIN/i.test(process.env.WX_MCH_KEY_PEM)) {
    pem = repairPem(process.env.WX_MCH_KEY_PEM)
  } else if (fs.existsSync(c.keyPath)) {
    pem = repairPem(fs.readFileSync(c.keyPath, 'utf8'))
  }
  if (!pem) throw new Error('未配置商户私钥 WX_MCH_KEY_PEM / apiclient_key.pem')
  if (/BEGIN CERTIFICATE/i.test(pem) && !/PRIVATE KEY/i.test(pem)) {
    throw new Error('WX_MCH_KEY_PEM 填成了证书，请改用 apiclient_key.pem（PRIVATE KEY）')
  }
  try {
    return tryCreatePrivateKey(pem)
  } catch (e1) {
    const hint = (pem.match(/BEGIN ([^-]+)-----/) || [])[1] || 'unknown'
    throw new Error(
      `商户私钥无法解析(${hint}): ${(e1 && e1.message) || 'DECODER unsupported'}；请确认 WX_MCH_KEY_PEM 为 apiclient_key.pem 全文（可用 \\n 表示换行）`
    )
  }
}

function signRsaSha256(message) {
  const key = loadPrivateKey()
  return crypto.createSign('RSA-SHA256').update(message).sign(key, 'base64')
}

function db() {
  return dbMod.open()
}

let payColumnsReady = false

function ensurePayColumns() {
  if (payColumnsReady) return
  // MySQL 结构必须发布前迁移；禁止支付/订单请求运行 DDL。
  if (dbMod.DIALECT === 'mysql') {
    payColumnsReady = true
    return
  }
  const d = db()
  const add = dbMod.addColumnIfMissing
  add(d, 'redeem_order', 'pay_status', `VARCHAR(16) NOT NULL DEFAULT 'none'`, `TEXT NOT NULL DEFAULT 'none'`)
  add(d, 'redeem_order', 'wx_prepay_id', `VARCHAR(128) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'redeem_order', 'wx_transaction_id', `VARCHAR(128) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'redeem_order', 'paid_at', `VARCHAR(40) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'redeem_order', 'refund_status', `VARCHAR(16) NOT NULL DEFAULT 'none'`, `TEXT NOT NULL DEFAULT 'none'`)
  add(d, 'redeem_order', 'refund_cent', `INT NOT NULL DEFAULT 0`, `INTEGER NOT NULL DEFAULT 0`)
  add(d, 'redeem_order', 'wx_refund_id', `VARCHAR(128) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'redeem_order', 'refunded_at', `VARCHAR(40) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  d.exec(`
    CREATE TABLE IF NOT EXISTS wx_pay_notify (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      out_trade_no VARCHAR(64) NOT NULL,
      transaction_id VARCHAR(128) NOT NULL DEFAULT '',
      payload_json MEDIUMTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      UNIQUE(out_trade_no, transaction_id)
    )
  `)
  d.exec(`
    CREATE TABLE IF NOT EXISTS wx_refund_notify (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      out_trade_no VARCHAR(64) NOT NULL,
      out_refund_no VARCHAR(64) NOT NULL DEFAULT '',
      refund_id VARCHAR(128) NOT NULL DEFAULT '',
      amount_cent INT NOT NULL DEFAULT 0,
      payload_json MEDIUMTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      UNIQUE(out_refund_no)
    )
  `)
  payColumnsReady = true
}

/** async 路径：禁止在 await 之后直接 deasync，改走 setImmediate 干净栈 */
async function ensurePayColumnsAsync() {
  if (payColumnsReady) return
  await dbMod.runSync(() => ensurePayColumns())
}

function authHeader(method, urlPath, body = '') {
  const { mchid, serialNo } = cfg()
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`
  const signature = signRsaSha256(message)
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
  // 已配置微信支付公钥时，请求头带上公钥 ID（切换公钥模式 / 敏感字段加密场景）
  const pubId = cfg().payPublicKeyId
  const extraHeaders = {}
  if (pubId && isPubKeyIdSerial(pubId)) {
    extraHeaders['Wechatpay-Serial'] = pubId
  }
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
          ...extraHeaders,
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
  const paySign = signRsaSha256(message)
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

/** 平台证书缓存（验签用；新商户可能无平台证书） */
let platformCertCache = { at: 0, map: new Map(), unavailable: false, unavailableMsg: '' }

function isPubKeyIdSerial(serial) {
  return /^PUB_KEY_ID_/i.test(String(serial || '').trim())
}

/** 加载商户平台下载的「微信支付公钥」PEM（验签用，非商户 API 证书） */
function loadPayPublicKeyPem() {
  const c = cfg()
  let pem = ''
  if (process.env.WX_PAY_PUBLIC_KEY_PEM && /BEGIN/i.test(process.env.WX_PAY_PUBLIC_KEY_PEM)) {
    pem = repairPem(process.env.WX_PAY_PUBLIC_KEY_PEM)
  } else if (fs.existsSync(c.payPublicKeyPath)) {
    pem = repairPem(fs.readFileSync(c.payPublicKeyPath, 'utf8'))
  }
  if (!pem) return ''
  if (!/PUBLIC KEY|CERTIFICATE/i.test(pem)) {
    throw new Error('WX_PAY_PUBLIC_KEY_PEM 须为微信支付公钥（BEGIN PUBLIC KEY）')
  }
  return pem
}

async function refreshPlatformCerts() {
  try {
    const list = await requestWx('GET', '/v3/certificates')
    const map = new Map()
    for (const item of list.data || []) {
      const pem = decryptResource(item.encrypt_certificate)
      map.set(String(item.serial_no).toUpperCase(), pem)
    }
    platformCertCache = { at: Date.now(), map, unavailable: false, unavailableMsg: '' }
    return map
  } catch (e) {
    const msg = (e && e.message) || String(e)
    if (/无可用的平台证书|404/i.test(msg)) {
      platformCertCache = {
        at: Date.now(),
        map: new Map(),
        unavailable: true,
        unavailableMsg: msg,
      }
    }
    throw e
  }
}

async function getPlatformCertPem(serial) {
  const key = String(serial || '').toUpperCase()
  if (platformCertCache.unavailable && Date.now() - platformCertCache.at < 10 * 60 * 1000) {
    throw new Error(
      platformCertCache.unavailableMsg ||
        '无可用的平台证书，请配置 WX_PAY_PUBLIC_KEY_PEM / WX_PAY_PUBLIC_KEY_ID'
    )
  }
  if (!platformCertCache.map.has(key) || Date.now() - platformCertCache.at > 12 * 3600 * 1000) {
    await refreshPlatformCerts()
  }
  const pem = platformCertCache.map.get(key)
  if (!pem) throw new Error(`未找到平台证书 serial=${key}`)
  return pem
}

/**
 * 回调验签：
 * - 已配置 WX_PAY_PUBLIC_KEY_PEM（或 Serial 为 PUB_KEY_ID_*）→ 只用微信支付公钥，绝不请求 /v3/certificates
 * - 否则拉平台证书；无证书商户会 404，需补公钥 PEM
 */
async function verifyNotifySignature(headers, rawBody) {
  const timestamp = headers['wechatpay-timestamp'] || headers['Wechatpay-Timestamp']
  const nonce = headers['wechatpay-nonce'] || headers['Wechatpay-Nonce']
  const signature = headers['wechatpay-signature'] || headers['Wechatpay-Signature']
  const serial = String(headers['wechatpay-serial'] || headers['Wechatpay-Serial'] || '').trim()
  if (!timestamp || !nonce || !signature || !serial) {
    throw new Error('回调缺少验签头')
  }
  // 探测流量：签名以 WECHATPAY/SIGNTEST/ 开头，按文档应验签失败并返回 4xx/5xx
  if (String(signature).startsWith('WECHATPAY/SIGNTEST/')) {
    throw new Error('签名探测流量，验签失败（预期）')
  }

  const message = `${timestamp}\n${nonce}\n${rawBody}\n`
  let pubPem = ''
  try {
    pubPem = loadPayPublicKeyPem()
  } catch (e) {
    throw new Error(`微信支付公钥 PEM 无效: ${(e && e.message) || e}`)
  }
  const cfgId = cfg().payPublicKeyId
  const headerIsPub = isPubKeyIdSerial(serial)
  // 只要配了公钥 PEM，或回调头已是 PUB_KEY_ID → 走公钥，跳过平台证书接口
  const usePubKey = !!pubPem || headerIsPub || isPubKeyIdSerial(cfgId)

  let pem = ''
  if (usePubKey) {
    if (!pubPem) {
      throw new Error(
        `已配置公钥模式（WX_PAY_PUBLIC_KEY_ID=${cfgId || serial}），但缺少 WX_PAY_PUBLIC_KEY_PEM。请把商户平台下载的 pub_key.pem 全文写入云托管环境变量后重启`
      )
    }
    if (cfgId && headerIsPub && String(cfgId).toUpperCase() !== serial.toUpperCase()) {
      console.warn('[wxpay] 回调公钥 ID 与配置不一致', 'header=', serial, 'env=', cfgId)
    }
    const fp = crypto.createHash('sha256').update(pubPem).digest('hex').slice(0, 12)
    console.log(
      '[wxpay] notify verify via public key',
      'serial=',
      serial,
      'envId=',
      cfgId || '(empty)',
      'pemLen=',
      pubPem.length,
      'pemFp=',
      fp
    )
    pem = pubPem
  } else {
    try {
      pem = await getPlatformCertPem(serial)
    } catch (e) {
      const msg = (e && e.message) || ''
      if (/无可用的平台证书|404|未找到平台证书/i.test(msg)) {
        throw new Error(
          '无可用的平台证书且未配置 WX_PAY_PUBLIC_KEY_PEM：请在云托管同时配置 WX_PAY_PUBLIC_KEY_ID 与公钥 PEM 全文后重启。指引 https://pay.weixin.qq.com/doc/v3/merchant/4012153196'
        )
      }
      throw e
    }
  }

  const ok = crypto.createVerify('RSA-SHA256').update(Buffer.from(message)).verify(pem, signature, 'base64')
  if (!ok) {
    const fp = crypto.createHash('sha256').update(pem).digest('hex').slice(0, 12)
    throw new Error(
      `回调验签失败（公钥与签名不匹配）。请到商户平台重新下载「微信支付公钥」pub_key.pem，确保 WX_PAY_PUBLIC_KEY_ID=${serial} 与 WX_PAY_PUBLIC_KEY_PEM 成对；当前 pemFp=${fp} pemLen=${pem.length}`
    )
  }
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
 * 为现金订单创建 JSAPI 预支付，返回小程序 wx.requestPayment 参数。
 * 注意：await 微信支付 HTTP 之后禁止直接 deasync DB（Node20 会栈溢出），须 runSync。
 */
async function createJsapiPrepay(userId, orderNo) {
  if (!isConfigured()) throw new Error('微信支付未配置完整（商户号/证书/APIv3密钥）')

  // 1) 全部同步读库必须在任何 await 之前
  ensurePayColumns()
  const d0 = db()
  const order = d0.prepare(`SELECT * FROM redeem_order WHERE order_no=? AND user_id=?`).get(orderNo, userId)
  if (!order) throw new Error('订单不存在')
  if (Number(order.pay_cash_cent || 0) <= 0) throw new Error('该订单无需微信支付')
  if (order.pay_status === 'paid' || order.wx_transaction_id) throw new Error('订单已支付')
  if (order.status === 'cancelled') throw new Error('订单已取消')
  const openid = getUserOpenid(userId)
  const orderId = order.id
  const orderNoSaved = order.order_no
  const amountCent = Number(order.pay_cash_cent)
  const description = String(order.product_name || '全民优享订单').slice(0, 120)

  const { appid, mchid, notifyUrl } = cfg()
  const body = {
    appid,
    mchid,
    description,
    out_trade_no: orderNoSaved,
    notify_url: notifyUrl,
    amount: { total: amountCent, currency: 'CNY' },
    payer: { openid },
  }

  // 2) 仅网络
  const res = await requestWx('POST', '/v3/pay/transactions/jsapi', body)
  const prepayId = res.prepay_id
  if (!prepayId) throw new Error('未返回 prepay_id')

  // 3) await 之后禁止 deasync：用真正的 async 写库
  await dbMod.queryAsync(
    `UPDATE redeem_order SET wx_prepay_id=?, pay_status='prepay', updated_at=? WHERE id=?`,
    [prepayId, new Date().toISOString(), orderId]
  )

  const payParams = buildJsapiPayParams(prepayId)
  return {
    orderNo: orderNoSaved,
    amountCent,
    notifyUrl,
    ...payParams,
  }
}

/**
 * 已关单后才到账：钱已收必须履约，订单恢复为待发货。
 * 关单时已回补库存/能量，需运营人工核对是否补扣。
 */
function warnPaidAfterCancel(order) {
  console.error(
    '[wxpay] PAID_AFTER_CANCEL 订单关闭后到账，已恢复为待履约，请人工核对库存/能量',
    order.order_no,
    `pay_points=${order.pay_points || 0}`
  )
}

function markOrderPaid(outTradeNo, transactionId) {
  ensurePayColumns()
  const d = db()
  const order = d.prepare(`SELECT * FROM redeem_order WHERE order_no=?`).get(outTradeNo)
  if (!order) return { ok: false, msg: '订单不存在' }
  const adminService = require('./adminService')
  if (order.pay_status === 'paid') {
    adminService.ensureWxPayFinance(order)
    try {
      require('./festivalTicketService').issueTicketsForOrder(order)
    } catch (_) {}
    return { ok: true, duplicate: true, order }
  }

  const now = new Date().toISOString()
  if (order.status === 'cancelled') warnPaidAfterCancel(order)
  const tx = d.transaction(() => {
    d.prepare(
      `UPDATE redeem_order
       SET pay_status='paid', wx_transaction_id=?, paid_at=?,
           status=CASE WHEN status IN ('unpaid','cancelled') THEN 'pending' ELSE status END, updated_at=?
       WHERE id=?`
    ).run(transactionId || '', now, now, order.id)

    try {
      d.prepare(
        `INSERT OR IGNORE INTO wx_pay_notify (out_trade_no, transaction_id, payload_json, created_at)
         VALUES (?,?,?,?)`
      ).run(outTradeNo, transactionId || '', JSON.stringify({ transactionId }), now)
    } catch (e) {}

    adminService.ensureWxPayFinance({
      ...order,
      pay_status: 'paid',
      paid_at: now,
      wx_transaction_id: transactionId || '',
    })
  })
  tx()
  const paid = d.prepare(`SELECT * FROM redeem_order WHERE id=?`).get(order.id)
  try {
    require('./festivalTicketService').issueTicketsForOrder(paid || order)
  } catch (e) {
    console.warn('[wxpay] festival issue', outTradeNo, e && e.message)
  }
  return { ok: true, order: paid }
}

/** await 之后记账：纯 async，不走 deasync */
async function markOrderPaidAsync(outTradeNo, transactionId) {
  await ensurePayColumnsAsync()
  const [rows] = await dbMod.queryAsync(`SELECT * FROM redeem_order WHERE order_no=?`, [outTradeNo])
  const order = rows && rows[0]
  if (!order) return { ok: false, msg: '订单不存在' }

  const adminService = require('./adminService')
  const fest = require('./festivalTicketService')
  if (order.pay_status === 'paid') {
    // 已支付也补齐漏记流水 / 出票；全程 queryAsync，禁止 runSync/deasync
    try {
      await adminService.ensureWxPayFinanceAsync(order)
    } catch (e) {
      console.warn('[wxpay] finance backfill', outTradeNo, e && e.message)
    }
    try {
      await fest.issueTicketsForOrderAsync(order)
    } catch (e) {
      console.warn('[wxpay] festival issue', outTradeNo, e && e.message)
    }
    return { ok: true, duplicate: true, order }
  }

  const now = new Date().toISOString()
  if (order.status === 'cancelled') warnPaidAfterCancel(order)
  await dbMod.queryAsync(
    `UPDATE redeem_order
     SET pay_status='paid', wx_transaction_id=?, paid_at=?,
         status=CASE WHEN status IN ('unpaid','cancelled') THEN 'pending' ELSE status END, updated_at=?
     WHERE id=?`,
    [transactionId || '', now, now, order.id]
  )
  try {
    await dbMod.queryAsync(
      `INSERT OR IGNORE INTO wx_pay_notify (out_trade_no, transaction_id, payload_json, created_at)
       VALUES (?,?,?,?)`,
      [outTradeNo, transactionId || '', JSON.stringify({ transactionId }), now]
    )
  } catch (_) {}

  try {
    await adminService.ensureWxPayFinanceAsync({
      ...order,
      pay_status: 'paid',
      paid_at: now,
      wx_transaction_id: transactionId || '',
    })
  } catch (e) {
    console.warn('[wxpay] finance ledger', outTradeNo, e && e.message)
  }

  const [updated] = await dbMod.queryAsync(`SELECT * FROM redeem_order WHERE id=?`, [order.id])
  const paid =
    (updated && updated[0]) || {
      ...order,
      pay_status: 'paid',
      status: order.status === 'unpaid' ? 'pending' : order.status,
    }
  try {
    await fest.issueTicketsForOrderAsync(paid)
  } catch (e) {
    console.warn('[wxpay] festival issue', outTradeNo, e && e.message)
  }
  return { ok: true, order: paid }
}

function refundNotifyUrl() {
  const c = cfg()
  return process.env.WX_REFUND_NOTIFY_URL || `${c.publicBase}/api/traffic/v1/pay/wx/refund-notify`
}

/**
 * 发起微信退款并记支出流水。
 * @param {{ orderNo: string, amountCent?: number, reason?: string }} opts
 */
async function createRefund({ orderNo, amountCent, reason = '用户退款' } = {}) {
  if (!isConfigured()) throw new Error('微信支付未配置')
  await ensurePayColumnsAsync()
  const [rows] = await dbMod.queryAsync(`SELECT * FROM redeem_order WHERE order_no=?`, [orderNo])
  const order = rows && rows[0]
  if (!order) return { ok: false, msg: '订单不存在' }
  if (order.pay_status !== 'paid') return { ok: false, msg: '订单未支付，无法退款' }
  if (order.refund_status === 'success' || order.refund_status === 'refunded') {
    return { ok: true, duplicate: true, order }
  }
  const totalCent = Number(order.pay_cash_cent) || 0
  if (totalCent <= 0) return { ok: false, msg: '无现金支付金额' }
  const refundCent = amountCent != null ? Number(amountCent) : totalCent
  if (!refundCent || refundCent <= 0 || refundCent > totalCent) {
    return { ok: false, msg: '退款金额不合法' }
  }

  const outRefundNo = `R${orderNo}`.slice(0, 64)
  const { mchid } = cfg()
  const body = {
    out_trade_no: orderNo,
    out_refund_no: outRefundNo,
    reason: String(reason || '退款').slice(0, 80),
    notify_url: refundNotifyUrl(),
    amount: {
      refund: refundCent,
      total: totalCent,
      currency: 'CNY',
    },
  }
  if (order.wx_transaction_id) {
    body.transaction_id = order.wx_transaction_id
  }

  let wxRes
  try {
    wxRes = await requestWx('POST', '/v3/refund/domestic/refunds', body)
  } catch (e) {
    // 重复退款号时微信可能报错，尝试按成功回写
    const msg = (e && e.message) || ''
    if (!/已退款|FREQUENCY_LIMITED|RESOURCE_ALREADY_EXISTS|订单已全额退款/i.test(msg)) {
      throw e
    }
    wxRes = e.body || { out_refund_no: outRefundNo, refund_id: order.wx_refund_id || '' }
  }

  const refundId = (wxRes && (wxRes.refund_id || wxRes.refundId)) || ''
  const status = String((wxRes && wxRes.status) || 'PROCESSING').toUpperCase()
  const now = new Date().toISOString()
  const localStatus = status === 'SUCCESS' ? 'success' : 'processing'

  await dbMod.queryAsync(
    `UPDATE redeem_order
     SET refund_status=?, refund_cent=?, wx_refund_id=?, refunded_at=CASE WHEN ?='success' THEN ? ELSE refunded_at END,
         status=CASE WHEN ?='success' THEN 'refunded' ELSE status END, updated_at=?
     WHERE id=?`,
    [localStatus, refundCent, refundId, localStatus, now, localStatus, now, order.id]
  )

  // SUCCESS 即时入账；PROCESSING 等退款回调
  if (localStatus === 'success') {
    const adminService = require('./adminService')
    await dbMod.runSync(() =>
      adminService.ensureWxRefundFinance(order, refundCent, refundId || outRefundNo)
    )
    try {
      await dbMod.runSync(() => require('./festivalTicketService').markRefundedByOrder(orderNo))
    } catch (_) {}
  }

  return {
    ok: true,
    orderNo,
    outRefundNo,
    refundId,
    refundCent,
    status: localStatus,
    wx: wxRes,
  }
}

/** 退款结果入账（回调 / 主动确认） */
async function markOrderRefunded({ outTradeNo, outRefundNo, refundId, amountCent } = {}) {
  await ensurePayColumnsAsync()
  const [rows] = await dbMod.queryAsync(`SELECT * FROM redeem_order WHERE order_no=?`, [outTradeNo])
  const order = rows && rows[0]
  if (!order) return { ok: false, msg: '订单不存在' }

  const cent = Number(amountCent) || Number(order.refund_cent) || Number(order.pay_cash_cent) || 0
  const now = new Date().toISOString()
  const rid = refundId || outRefundNo || `${outTradeNo}:refund`

  await dbMod.queryAsync(
    `UPDATE redeem_order
     SET refund_status='success', refund_cent=?, wx_refund_id=?, refunded_at=?, status='refunded', updated_at=?
     WHERE id=?`,
    [cent, rid, now, now, order.id]
  )
  try {
    await dbMod.queryAsync(
      `INSERT OR IGNORE INTO wx_refund_notify (out_trade_no, out_refund_no, refund_id, amount_cent, payload_json, created_at)
       VALUES (?,?,?,?,?,?)`,
      [outTradeNo, outRefundNo || '', rid, cent, JSON.stringify({ refundId: rid, amountCent: cent }), now]
    )
  } catch (_) {}

  const adminService = require('./adminService')
  try {
    await dbMod.runSync(() => adminService.ensureWxRefundFinance(order, cent, rid))
  } catch (e) {
    console.warn('[wxpay] refund finance', outTradeNo, e && e.message)
  }
  try {
    await adminService.ensureWxPayFinanceAsync(order)
  } catch (e) {
    console.warn('[wxpay] refund backfill revenue', outTradeNo, e && e.message)
  }
  try {
    await dbMod.runSync(() => require('./festivalTicketService').markRefundedByOrder(outTradeNo))
  } catch (_) {}

  const [updated] = await dbMod.queryAsync(`SELECT * FROM redeem_order WHERE id=?`, [order.id])
  return { ok: true, order: (updated && updated[0]) || order }
}

async function handleNotify(headers, rawBody) {
  if (!isConfigured()) throw new Error('微信支付未配置')
  const raw = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody || '').toString('utf8')
  await verifyNotifySignature(headers, raw)
  const envelope = JSON.parse(raw)
  const resource = decryptResource(envelope.resource)
  // 支付成功
  if (resource.trade_state && resource.trade_state !== 'SUCCESS') {
    return { code: 'SUCCESS', message: '忽略非成功状态' }
  }
  if (resource.out_trade_no && resource.transaction_id && !resource.refund_status) {
    try {
      const r = await markOrderPaidAsync(resource.out_trade_no, resource.transaction_id)
      console.log(
        '[wxpay] notify paid',
        resource.out_trade_no,
        resource.transaction_id,
        r && r.duplicate ? 'duplicate' : r && r.ok ? 'ok' : (r && r.msg) || 'fail'
      )
      if (!r.ok) {
        console.error('[wxpay] notify mark paid', resource.out_trade_no, r.msg)
        // 仍回 SUCCESS，避免微信疯狂重试把进程打崩；前端 confirm / my-tickets 可自愈
        return { code: 'SUCCESS', message: r.msg || '记账延迟' }
      }
    } catch (e) {
      console.error('[wxpay] notify mark paid err', resource.out_trade_no, e && e.message)
      return { code: 'SUCCESS', message: '记账异常已记录' }
    }
    return { code: 'SUCCESS', message: '成功' }
  }
  return { code: 'SUCCESS', message: '忽略' }
}

async function handleRefundNotify(headers, rawBody) {
  if (!isConfigured()) throw new Error('微信支付未配置')
  const raw = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody || '').toString('utf8')
  await verifyNotifySignature(headers, raw)
  const envelope = JSON.parse(raw)
  const resource = decryptResource(envelope.resource)
  // resource: { out_trade_no, out_refund_no, refund_id, refund_status, amount: { refund, total, ... } }
  const status = String(resource.refund_status || resource.status || '').toUpperCase()
  if (status && status !== 'SUCCESS') {
    return { code: 'SUCCESS', message: '忽略非成功退款' }
  }
  const amountCent =
    (resource.amount && (resource.amount.refund || resource.amount.payer_refund)) || 0
  const r = await markOrderRefunded({
    outTradeNo: resource.out_trade_no,
    outRefundNo: resource.out_refund_no,
    refundId: resource.refund_id,
    amountCent,
  })
  if (!r.ok) throw new Error(r.msg || '退款记账失败')
  return { code: 'SUCCESS', message: '成功' }
}

async function queryByOutTradeNo(outTradeNo) {
  const { mchid } = cfg()
  return requestWx('GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${mchid}`)
}

/**
 * 收银台返回后主动查单入账（不依赖回调验签）。
 * 回调公钥配错时，用户已付款但订单仍 unpaid → 前端可调此接口补齐。
 */
async function confirmPaidByQuery(userId, orderNo) {
  if (!isConfigured()) throw new Error('微信支付未配置')
  const no = String(orderNo || '').trim()
  if (!no) throw new Error('缺少 orderNo')
  await ensurePayColumnsAsync()
  const [rows] = await dbMod.queryAsync(
    `SELECT * FROM redeem_order WHERE order_no=? AND user_id=?`,
    [no, userId]
  )
  const order = rows && rows[0]
  if (!order) throw new Error('订单不存在')
  if (order.pay_status === 'paid' || order.wx_transaction_id) {
    // 已入账也要补出票（支付成功但出票超时/崩溃时）
    try {
      await require('./festivalTicketService').issueTicketsForOrderAsync(order)
    } catch (e) {
      console.warn('[wxpay] confirm backfill tickets', no, e && e.message)
    }
    return { ok: true, paid: true, duplicate: true, orderNo: no, tradeState: 'SUCCESS' }
  }
  const q = await queryByOutTradeNo(no)
  const state = String((q && q.trade_state) || '').toUpperCase()
  if (state === 'SUCCESS') {
    const txId = (q && q.transaction_id) || ''
    const r = await markOrderPaidAsync(no, txId)
    if (!r.ok) throw new Error(r.msg || '记账失败')
    return {
      ok: true,
      paid: true,
      orderNo: no,
      tradeState: state,
      transactionId: txId,
    }
  }
  return {
    ok: true,
    paid: false,
    orderNo: no,
    tradeState: state || 'UNKNOWN',
    msg: state === 'NOTPAY' ? '尚未支付' : state === 'USERPAYING' ? '支付处理中' : `微信订单状态 ${state || '未知'}`,
  }
}

module.exports = {
  cfg,
  isConfigured,
  status,
  ensurePayColumns,
  ensurePayColumnsAsync,
  createJsapiPrepay,
  createRefund,
  handleNotify,
  handleRefundNotify,
  markOrderPaid,
  markOrderPaidAsync,
  markOrderRefunded,
  queryByOutTradeNo,
  confirmPaidByQuery,
  buildJsapiPayParams,
}

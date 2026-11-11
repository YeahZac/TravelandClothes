/**
 * 统一兑换展示卡片：商品主数据只在 product，各渠道按 productId 解析。
 */
const dbMod = require('../db')
const mediaUrl = require('../mediaUrl')
const pricingService = require('./pricingService')

function db() {
  return dbMod.open()
}

/**
 * @returns {{
 *   id, productId, name, imageUrl, imageUrlAdmin, kind, status, stock, stockAlarm,
 *   payPoints, payCashCent, payCashYuan, payMode, payLabel, priceText,
 *   costCent, tag, category, listPriceCent, listPriceYuan
 * }}
 */
function resolveOffer(productId) {
  const id = String(productId || '').trim()
  if (!id) {
    return emptyOffer('')
  }
  try {
    require('./skuService').migrateKinds()
  } catch (_) {}
  const row = db().prepare('SELECT * FROM product WHERE id=?').get(id)
  if (!row) return emptyOffer(id)
  return mapOfferRow(row)
}

function emptyOffer(id) {
  return {
    id: id || '',
    productId: id || '',
    name: id || '',
    imageUrl: '',
    imageUrlAdmin: '',
    kind: '',
    status: 'off',
    stock: 0,
    stockAlarm: 0,
    payPoints: 0,
    payCashCent: 0,
    payCashYuan: 0,
    payMode: 'free',
    payLabel: '',
    priceText: '',
    costCent: 0,
    tag: '',
    category: '',
    listPriceCent: 0,
    listPriceYuan: 0,
    found: false,
  }
}

function mapOfferRow(row) {
  const pay = pricingService.resolvePayMix(row)
  const id = row.id
  return {
    id,
    productId: id,
    found: true,
    name: row.name || id,
    imageUrl: mediaUrl.clientMediaPath(row.image_url) || '',
    imageUrlAdmin: mediaUrl.adminProxyUrl(row.image_url) || '',
    kind: row.kind || require('./skuService').inferKind(row),
    status: row.status || 'off',
    stock: Number(row.stock || 0),
    stockAlarm: Number(row.stock_alarm || 0),
    payPoints: pay.payPoints || 0,
    payCashCent: pay.payCashCent || 0,
    payCashYuan: pay.payCashYuan || 0,
    payMode: pay.payMode || 'free',
    payLabel: pay.label || '',
    priceText: pay.label || '',
    costCent: Number(row.cost_cent || 0),
    tag: row.tag || '',
    category: row.category || '',
    listPriceCent: pay.listPriceCent || 0,
    listPriceYuan: pay.listPriceYuan || 0,
  }
}

function resolveOffers(ids = []) {
  const uniq = [...new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean))]
  const out = {}
  uniq.forEach((id) => {
    out[id] = resolveOffer(id)
  })
  return out
}

/** 运营台下拉：名称 · ID · 库存 · 价格 */
function pickerList({ kind = '', q = '', status = 'on', limit = 200 } = {}) {
  try {
    require('./skuService').migrateKinds()
  } catch (_) {}
  const d = db()
  let sql = `SELECT * FROM product WHERE 1=1`
  const args = []
  if (status) {
    sql += ` AND status=?`
    args.push(status)
  }
  if (kind) {
    sql += ` AND kind=?`
    args.push(kind)
  }
  if (q) {
    sql += ` AND (id LIKE ? OR name LIKE ?)`
    args.push(`%${q}%`, `%${q}%`)
  }
  sql += ` ORDER BY sort_order, id LIMIT ?`
  args.push(Math.min(500, Math.max(1, Number(limit) || 200)))
  return d.prepare(sql).all(...args).map((row) => {
    const o = mapOfferRow(row)
    return {
      id: o.id,
      name: o.name,
      kind: o.kind,
      stock: o.stock,
      payLabel: o.payLabel,
      payPoints: o.payPoints,
      payCashCent: o.payCashCent,
      priceText: o.priceText,
      imageUrl: o.imageUrlAdmin || o.imageUrl,
      status: o.status,
      label: `${o.name} · ${o.id} · 库存${o.stock} · ${o.payLabel || '未定价'}`,
    }
  })
}

/** 渠道绑定摘要：SKU 被哪些玩法引用 */
function channelBindings(productId) {
  const id = String(productId || '').trim()
  if (!id) return { flash: [], lottery: [], jar: false, rewards: [] }
  const d = db()
  let flash = []
  try {
    require('./flashRedeemService').ensureSchema()
    flash = d
      .prepare(`SELECT id, title, tag, start_hm, end_hm FROM flash_slot WHERE product_id=? AND status='on'`)
      .all(id)
      .map((r) => ({ id: r.id, title: r.title, tag: r.tag, range: `${r.start_hm}-${r.end_hm}` }))
  } catch (_) {}
  let lottery = []
  try {
    lottery = d
      .prepare(`SELECT id, name, prize_type, status FROM lottery_prize WHERE product_id=?`)
      .all(id)
      .map((r) => ({ id: r.id, name: r.name, prizeType: r.prize_type, status: r.status }))
  } catch (_) {}
  let jar = false
  let rewards = []
  try {
    const published = require('./configService').getPublished() || {}
    const jarId = (((published.game || {}).jar || {}).redeemGiftId) || ''
    jar = jarId === id
    const rw = (published.game || {}).rewards || {}
    if (rw.pointsGiftId === id) rewards.push('pointsGift')
    if (rw.lotteryGiftId === id) rewards.push('lotteryGift')
    const invite = Array.isArray(rw.invite) ? rw.invite : []
    invite.forEach((x, i) => {
      if (x && x.giftId === id) rewards.push(`invite#${i}`)
    })
  } catch (_) {}
  return { flash, lottery, jar, rewards }
}

module.exports = {
  resolveOffer,
  resolveOffers,
  pickerList,
  channelBindings,
  mapOfferRow,
}

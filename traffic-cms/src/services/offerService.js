/**
 * 统一兑换展示卡片：物料在 product，渠道价/门槛在 channel_listing。
 */
const dbMod = require('../db')
const mediaUrl = require('../mediaUrl')
const pricingService = require('./pricingService')

function db() {
  return dbMod.open()
}

/**
 * @returns offer card
 */
function resolveOffer(productId, channel) {
  const id = String(productId || '').trim()
  if (!id) return emptyOffer('')
  try {
    require('./listingService').ensureReady()
  } catch (_) {}
  const listing = require('./listingService')
  if (channel === 'mall' || channel === 'gift') {
    const o = listing.resolveChannelOffer(id, channel)
    if (!o) return emptyOffer(id)
    return toOfferShape(o)
  }
  const any = listing.resolveOfferAny(id)
  if (!any) return emptyOffer(id)
  return toOfferShape(any)
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

function toOfferShape(o) {
  return {
    id: o.productId || o.id,
    productId: o.productId || o.id,
    found: true,
    name: o.name,
    imageUrl: o.imageUrl || '',
    imageUrlAdmin: o.imageUrlAdmin || '',
    kind: o.materialKind || o.kind || '',
    status: o.productStatus || o.status || 'off',
    stock: Number(o.stock || 0),
    stockAlarm: Number(o.stockAlarm || 0),
    payPoints: o.payPoints || 0,
    payCashCent: o.payCashCent || 0,
    payCashYuan: o.payCashYuan || 0,
    payMode: o.payMode || 'free',
    payLabel: o.payLabel || '',
    priceText: o.payLabel || '',
    costCent: Number(o.costCent || 0),
    tag: o.tag || '',
    category: o.category || '',
    listPriceCent: o.listPriceCent || 0,
    listPriceYuan: o.listPriceYuan || 0,
    mode: o.mode || '',
    needStreak: o.needStreak || 0,
    needInvite: o.needInvite || 0,
    firstWave: !!o.firstWave,
    desc: o.desc || '',
    channel: o.channel || '',
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

/** 运营台下拉：默认出物料；kind=gift 时筛已兑好礼上架 */
function pickerList({ kind = '', q = '', status = 'on', limit = 200, listed = '' } = {}) {
  try {
    require('./listingService').ensureReady()
  } catch (_) {}
  const listing = require('./listingService')
  const d = db()

  // 兼容：旧 UI 传 kind=gift 表示「兑好礼上架物料」
  if (kind === 'gift' || listed === 'gift') {
    return listing
      .listListingsAdmin('gift')
      .filter((o) => !status || o.status === status || (status === 'on' && o.productStatus === 'on'))
      .filter((o) => {
        if (!q) return true
        const s = String(q).toLowerCase()
        return String(o.id).toLowerCase().includes(s) || String(o.name).toLowerCase().includes(s)
      })
      .slice(0, Math.min(500, Math.max(1, Number(limit) || 200)))
      .map((o) => ({
        id: o.productId,
        name: o.name,
        kind: o.materialKind,
        stock: o.stock,
        payLabel: o.payLabel,
        payPoints: o.payPoints,
        payCashCent: o.payCashCent,
        priceText: o.payLabel,
        imageUrl: o.imageUrlAdmin || o.imageUrl,
        status: o.status,
        label: `${o.name} · ${o.productId} · 库存${o.stock} · ${o.payLabel || '未定价'}`,
      }))
  }
  if (kind === 'mall' || listed === 'mall') {
    return listing
      .listListingsAdmin('mall')
      .filter((o) => !status || o.status === status)
      .slice(0, Math.min(500, Math.max(1, Number(limit) || 200)))
      .map((o) => ({
        id: o.productId,
        name: o.name,
        kind: o.materialKind,
        stock: o.stock,
        payLabel: o.payLabel,
        payPoints: o.payPoints,
        payCashCent: o.payCashCent,
        priceText: o.payLabel,
        imageUrl: o.imageUrlAdmin || o.imageUrl,
        status: o.status,
        label: `${o.name} · ${o.productId} · 库存${o.stock} · ${o.payLabel || '未定价'}`,
      }))
  }

  let sql = `SELECT * FROM product WHERE 1=1`
  const args = []
  if (status) {
    sql += ` AND status=?`
    args.push(status)
  }
  if (kind && kind !== 'physical') {
    sql += ` AND kind=?`
    args.push(kind)
  } else if (kind === 'physical') {
    sql += ` AND kind=?`
    args.push('physical')
  }
  if (q) {
    sql += ` AND (id LIKE ? OR name LIKE ?)`
    args.push(`%${q}%`, `%${q}%`)
  }
  sql += ` ORDER BY sort_order, id LIMIT ?`
  args.push(Math.min(500, Math.max(1, Number(limit) || 200)))
  return d.prepare(sql).all(...args).map((row) => {
    const any = listing.resolveOfferAny(row.id) || mapOfferRow(row)
    const o = toOfferShape(any)
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
      label: `${o.name} · ${o.id} · 库存${o.stock} · ${o.payLabel || '物料'}`,
    }
  })
}

/** 渠道绑定摘要：SKU 被哪些玩法引用 */
function channelBindings(productId) {
  const id = String(productId || '').trim()
  if (!id) return { flash: [], lottery: [], jar: false, rewards: [], mall: false, gift: false }
  try {
    require('./listingService').ensureReady()
  } catch (_) {}
  const d = db()
  const listing = require('./listingService')
  const mall = !!listing.getListing('mall', id)
  const gift = !!listing.getListing('gift', id)
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
  return { flash, lottery, jar, rewards, mall, gift }
}

module.exports = {
  resolveOffer,
  resolveOffers,
  pickerList,
  channelBindings,
  mapOfferRow,
}

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

/**
 * 运营台实物下拉：默认读物料中心（product）。
 * - kind=physical|seed|virtual：按物料类型
 * - kind=redeemable：实物+种子（准点/兑好礼上架）
 * - kind=gift|mall / listed=gift|mall：兼容旧「渠道上架」筛法
 * - minStock：库存须严格大于该值（常用 1 → 库存>1）
 * - includeId：已绑 ID 即使不满足筛选也带回，避免编辑时丢选项
 */
function pickerList({
  kind = '',
  q = '',
  status = 'on',
  limit = 200,
  listed = '',
  minStock = null,
  includeId = '',
} = {}) {
  try {
    require('./listingService').ensureReady()
  } catch (_) {}
  const listing = require('./listingService')
  const d = db()
  const minS = minStock == null || minStock === '' ? null : Number(minStock)
  const keepIds = String(includeId || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

  const mapMaterialRow = (row) => {
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
  }

  const passStock = (stock) => {
    if (minS == null || !Number.isFinite(minS)) return true
    return Number(stock || 0) > minS
  }

  const ensureKeep = (rows) => {
    for (const kid of keepIds) {
      if (!rows.some((x) => x.id === kid)) {
        const row = d.prepare(`SELECT * FROM product WHERE id=?`).get(kid)
        if (row) rows.unshift(mapMaterialRow(row))
      }
    }
    return rows
  }

  // 兼容：旧 UI 传 kind=gift 表示「兑好礼上架物料」
  if (kind === 'gift' || listed === 'gift') {
    const rows = listing
      .listListingsAdmin('gift')
      .filter((o) => !status || o.status === status || (status === 'on' && o.productStatus === 'on'))
      .filter((o) => passStock(o.stock))
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
    return ensureKeep(rows)
  }
  if (kind === 'mall' || listed === 'mall') {
    const rows = listing
      .listListingsAdmin('mall')
      .filter((o) => !status || o.status === status)
      .filter((o) => passStock(o.stock))
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
    return ensureKeep(rows)
  }

  let sql = `SELECT * FROM product WHERE 1=1`
  const args = []
  if (status) {
    sql += ` AND status=?`
    args.push(status)
  }
  if (kind === 'physical' || kind === 'seed' || kind === 'virtual') {
    sql += ` AND kind=?`
    args.push(kind)
  } else if (kind === 'redeemable') {
    // 准点/兑好礼上架：实物+种子
    sql += ` AND kind IN ('physical','seed')`
  }
  if (minS != null && Number.isFinite(minS)) {
    sql += ` AND stock>?`
    args.push(minS)
  }
  if (q) {
    sql += ` AND (id LIKE ? OR name LIKE ?)`
    args.push(`%${q}%`, `%${q}%`)
  }
  sql += ` ORDER BY sort_order, id LIMIT ?`
  args.push(Math.min(500, Math.max(1, Number(limit) || 200)))
  return ensureKeep(d.prepare(sql).all(...args).map(mapMaterialRow))
}

/**
 * 运营台下拉：纯 queryAsync + 本地拼 label，禁止 ensureReady / resolveOfferAny 连环同步。
 */
async function pickerListAsync({
  kind = '',
  q = '',
  status = 'on',
  limit = 200,
  listed = '',
  minStock = null,
  includeId = '',
} = {}) {
  const minS = minStock == null || minStock === '' ? null : Number(minStock)
  const keepIds = String(includeId || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  const lim = Math.min(500, Math.max(1, Number(limit) || 200))

  const mapRow = (row) => {
    const pay = pricingService.resolvePayMix(row)
    const imageUrl =
      mediaUrl.adminProxyUrl(row.image_url) || mediaUrl.clientMediaPath(row.image_url) || ''
    const stock = Number(row.stock) || 0
    return {
      id: row.id,
      name: row.name,
      kind: row.kind || '',
      stock,
      payLabel: pay.label || '',
      payPoints: pay.payPoints,
      payCashCent: pay.payCashCent,
      priceText: pay.label || '',
      imageUrl,
      status: row.status,
      label: `${row.name} · ${row.id} · 库存${stock} · ${pay.label || '物料'}`,
    }
  }

  // gift/mall 渠道：用 listing 表 JOIN，避免 listListingsAdmin 同步风暴
  if (kind === 'gift' || listed === 'gift' || kind === 'mall' || listed === 'mall') {
    const channel = kind === 'mall' || listed === 'mall' ? 'mall' : 'gift'
    let sql = `SELECT p.* FROM channel_listing cl
               JOIN product p ON p.id=cl.product_id
               WHERE cl.channel=?`
    const args = [channel]
    if (status) {
      sql += ` AND p.status=?`
      args.push(status)
    }
    if (minS != null && Number.isFinite(minS)) {
      sql += ` AND p.stock>?`
      args.push(minS)
    }
    if (q) {
      sql += ` AND (p.id LIKE ? OR p.name LIKE ?)`
      args.push(`%${q}%`, `%${q}%`)
    }
    sql += ` ORDER BY cl.sort_order, p.id LIMIT ?`
    args.push(lim)
    const [rows] = await dbMod.queryAsync(sql, args)
    let list = (rows || []).map(mapRow)
    if (keepIds.length) {
      const missing = keepIds.filter((id) => !list.some((x) => x.id === id))
      if (missing.length) {
        const [extra] = await dbMod.queryAsync(
          `SELECT * FROM product WHERE id IN (${missing.map(() => '?').join(',')})`,
          missing
        )
        list = [...(extra || []).map(mapRow), ...list]
      }
    }
    return list
  }

  let sql = `SELECT * FROM product WHERE 1=1`
  const args = []
  if (status) {
    sql += ` AND status=?`
    args.push(status)
  }
  if (kind === 'physical' || kind === 'seed' || kind === 'virtual') {
    sql += ` AND kind=?`
    args.push(kind)
  } else if (kind === 'redeemable') {
    sql += ` AND kind IN ('physical','seed')`
  }
  if (minS != null && Number.isFinite(minS)) {
    sql += ` AND stock>?`
    args.push(minS)
  }
  if (q) {
    sql += ` AND (id LIKE ? OR name LIKE ?)`
    args.push(`%${q}%`, `%${q}%`)
  }
  sql += ` ORDER BY sort_order, id LIMIT ?`
  args.push(lim)
  const [rows] = await dbMod.queryAsync(sql, args)
  let list = (rows || []).map(mapRow)
  if (keepIds.length) {
    const missing = keepIds.filter((id) => !list.some((x) => x.id === id))
    if (missing.length) {
      const [extra] = await dbMod.queryAsync(
        `SELECT * FROM product WHERE id IN (${missing.map(() => '?').join(',')})`,
        missing
      )
      list = [...(extra || []).map(mapRow), ...list]
    }
  }
  return list
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
  pickerListAsync,
  channelBindings,
  mapOfferRow,
}

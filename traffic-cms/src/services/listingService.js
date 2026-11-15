/**
 * 渠道上架：商城 / 兑好礼引用物料(product)，经营字段落在 channel_listing。
 * 物料 kind ∈ {physical, virtual, seed}；不再用 mall/gift 当物料类型。
 */
const dbMod = require('../db')
const mediaUrl = require('../mediaUrl')
const pricingService = require('./pricingService')

const MATERIAL_KINDS = new Set(['physical', 'virtual', 'seed'])
const CHANNELS = new Set(['mall', 'gift'])

let schemaReady = false
let migrated = false

function db() {
  return dbMod.open()
}
function now() {
  return dbMod.nowIso()
}

function parseMeta(raw) {
  return pricingService.parseMeta(raw)
}

function ensureSchema() {
  if (schemaReady) return
  const d = db()
  if (dbMod.DIALECT === 'mysql') {
    d.prepare(
      `CREATE TABLE IF NOT EXISTS channel_listing (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        channel VARCHAR(16) NOT NULL,
        product_id VARCHAR(64) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        status VARCHAR(16) NOT NULL DEFAULT 'on',
        price_cent INT NOT NULL DEFAULT 0,
        meta_json MEDIUMTEXT NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        UNIQUE KEY uk_channel_product (channel, product_id),
        KEY idx_listing_channel (channel, status, sort_order)
      )`
    ).run()
  } else {
    d.exec(`
      CREATE TABLE IF NOT EXISTS channel_listing (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        product_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'on',
        price_cent INTEGER NOT NULL DEFAULT 0,
        meta_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uk_channel_product ON channel_listing(channel, product_id);
      CREATE INDEX IF NOT EXISTS idx_listing_channel ON channel_listing(channel, status, sort_order);
    `)
  }
  schemaReady = true
}

function normalizeMaterialKind(rawKind, category, tag, meta) {
  const k = String(rawKind || '').trim()
  if (k === 'virtual' || category === '虚拟') return 'virtual'
  if (k === 'seed' || category === '种子' || tag === '树种' || (meta && meta.seedId)) return 'seed'
  if (MATERIAL_KINDS.has(k)) return k
  // 历史 mall/gift/physical/bundle → 实物物料
  return 'physical'
}

function categoryForKind(kind) {
  if (kind === 'virtual') return '虚拟'
  if (kind === 'seed') return '种子'
  return '推荐'
}

function listingId(channel, productId) {
  return `${channel}_${productId}`
}

function extractChannelMeta(meta = {}, channel) {
  const pay = pricingService.applyMetaPayFields({}, {
    payPoints: meta.payPoints != null ? meta.payPoints : meta.costPoints,
    payEnergy: meta.payEnergy,
    payCashCent: meta.payCashCent != null ? meta.payCashCent : meta.needCash,
    listPriceCent: meta.listPriceCent,
  })
  const out = { ...pay }
  if (channel === 'gift') {
    if (meta.mode != null) out.mode = String(meta.mode || '')
    if (meta.needStreak != null) out.needStreak = Math.max(0, Number(meta.needStreak) || 0)
    if (meta.needInvite != null) out.needInvite = Math.max(0, Number(meta.needInvite) || 0)
    if (meta.firstWave != null) out.firstWave = !!meta.firstWave
    if (meta.costEnergy != null) out.costEnergy = Math.max(0, Number(meta.costEnergy) || 0)
    if (meta.desc != null) out.desc = String(meta.desc || '')
    if (meta.coverTone != null) out.coverTone = String(meta.coverTone || 'mint')
  }
  return out
}

function stripChannelFieldsFromProductMeta(meta = {}) {
  const next = { ...meta }
  ;[
    'payPoints',
    'costPoints',
    'payEnergy',
    'payCashCent',
    'needCash',
    'listPriceCent',
    'mode',
    'needStreak',
    'needInvite',
    'firstWave',
    'costEnergy',
    'desc',
    'coverTone',
  ].forEach((k) => {
    delete next[k]
  })
  return next
}

function upsertListingRow({ channel, productId, sortOrder, status, priceCent, meta }) {
  ensureSchema()
  const ch = String(channel || '').trim()
  const pid = String(productId || '').trim()
  if (!CHANNELS.has(ch) || !pid) return null
  const d = db()
  const id = listingId(ch, pid)
  const t = now()
  const metaJson = JSON.stringify(meta || {})
  const sort = Number(sortOrder != null ? sortOrder : 0)
  const st = status === 'off' ? 'off' : 'on'
  const price = Math.max(0, Math.round(Number(priceCent) || 0))
  const exists = d.prepare('SELECT id FROM channel_listing WHERE id=?').get(id)
  if (exists) {
    d.prepare(
      `UPDATE channel_listing SET sort_order=?, status=?, price_cent=?, meta_json=?, updated_at=?, product_id=?, channel=? WHERE id=?`
    ).run(sort, st, price, metaJson, t, pid, ch, id)
  } else {
    d.prepare(
      `INSERT INTO channel_listing (id, channel, product_id, sort_order, status, price_cent, meta_json, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(id, ch, pid, sort, st, price, metaJson, t)
  }
  return d.prepare('SELECT * FROM channel_listing WHERE id=?').get(id)
}

/**
 * 一次性：从历史 kind=mall/gift 回填 channel_listing，并把物料 kind 收敛。
 */
function migrateFromLegacy() {
  ensureSchema()
  if (migrated) return
  try {
    require('./skuService').ensureKindColumn()
  } catch (_) {}
  const d = db()
  const rows = d.prepare('SELECT * FROM product').all()
  const t = now()
  rows.forEach((row) => {
    const meta = parseMeta(row.meta_json)
    const legacyKind = String(row.kind || '').trim()
    const wasGift =
      legacyKind === 'gift' ||
      row.category === '兑礼' ||
      meta.mode != null ||
      meta.costPoints != null ||
      meta.needStreak != null ||
      meta.needInvite != null
    const wasMall =
      legacyKind === 'mall' ||
      (!wasGift && legacyKind !== 'seed' && legacyKind !== 'virtual' && row.category !== '种子' && row.category !== '虚拟')

    const materialKind = normalizeMaterialKind(legacyKind, row.category, row.tag, meta)
    const category = categoryForKind(materialKind)

    if (wasGift) {
      const existing = d
        .prepare(`SELECT id FROM channel_listing WHERE channel='gift' AND product_id=?`)
        .get(row.id)
      if (!existing) {
        upsertListingRow({
          channel: 'gift',
          productId: row.id,
          sortOrder: row.sort_order,
          status: row.status === 'off' ? 'off' : 'on',
          priceCent: row.price_cent,
          meta: extractChannelMeta(meta, 'gift'),
        })
      }
    }
    if (wasMall && materialKind === 'physical') {
      const existing = d
        .prepare(`SELECT id FROM channel_listing WHERE channel='mall' AND product_id=?`)
        .get(row.id)
      if (!existing && (legacyKind === 'mall' || (!wasGift && row.category !== '兑礼'))) {
        upsertListingRow({
          channel: 'mall',
          productId: row.id,
          sortOrder: row.sort_order,
          status: row.status === 'off' ? 'off' : 'on',
          priceCent: row.price_cent,
          meta: extractChannelMeta(meta, 'mall'),
        })
      }
    }

    // 若已有 listing，从 product.meta 剥离渠道字段（保留展示/采购）
    const hasListing = d
      .prepare(`SELECT id FROM channel_listing WHERE product_id=? LIMIT 1`)
      .get(row.id)
    let nextMeta = meta
    if (hasListing) {
      nextMeta = stripChannelFieldsFromProductMeta(meta)
    }
    d.prepare(`UPDATE product SET kind=?, category=?, meta_json=?, updated_at=? WHERE id=?`).run(
      materialKind,
      category === '推荐' && row.category === '兑礼' ? '推荐' : category || row.category || '推荐',
      JSON.stringify(nextMeta),
      t,
      row.id
    )
    // 强制 kind 收敛（即使 category 保留旧值）
    if (row.category === '兑礼') {
      d.prepare(`UPDATE product SET category=?, kind=? WHERE id=?`).run(
        categoryForKind(materialKind),
        materialKind,
        row.id
      )
    }
  })
  migrated = true
}

function ensureReady() {
  ensureSchema()
  migrateFromLegacy()
}

function mapJoinedOffer(productRow, listingRow, channel) {
  const pMeta = parseMeta(productRow.meta_json)
  const lMeta = listingRow ? parseMeta(listingRow.meta_json) : {}
  const priceCent = listingRow
    ? Number(listingRow.price_cent || 0)
    : Number(productRow.price_cent || 0)
  const synthetic = {
    ...productRow,
    price_cent: priceCent,
    meta_json: JSON.stringify({ ...pMeta, ...lMeta }),
    category: channel === 'gift' ? '兑礼' : productRow.category,
    kind: channel === 'gift' ? 'gift' : channel === 'mall' ? 'mall' : productRow.kind,
  }
  const pay = pricingService.resolvePayMix(synthetic)
  const gallery = Array.isArray(pMeta.gallery) ? pMeta.gallery : []
  return {
    id: productRow.id,
    productId: productRow.id,
    listingId: listingRow ? listingRow.id : '',
    channel: channel || '',
    found: true,
    name: productRow.name || productRow.id,
    imageUrl: mediaUrl.clientMediaPath(productRow.image_url) || '',
    imageUrlAdmin: mediaUrl.adminProxyUrl(productRow.image_url) || '',
    kind: productRow.kind || 'physical',
    materialKind: productRow.kind || 'physical',
    status: listingRow ? listingRow.status : productRow.status,
    productStatus: productRow.status,
    stock: Number(productRow.stock || 0),
    stockAlarm: Number(productRow.stock_alarm || 0),
    costCent: Number(productRow.cost_cent || 0),
    tag: productRow.tag || '',
    category: channel === 'gift' ? '兑礼' : productRow.category || '',
    subtitle: pMeta.subtitle || '',
    detailHtml: pMeta.detailHtml || '',
    gallery: gallery.map((u) => mediaUrl.clientMediaPath(u)).filter(Boolean),
    purchaseUrl: pMeta.purchaseUrl || '',
    sortOrder: listingRow ? Number(listingRow.sort_order || 0) : Number(productRow.sort_order || 0),
    priceCent,
    price: Math.round(priceCent) / 100,
    payPoints: pay.payPoints || 0,
    payCashCent: pay.payCashCent || 0,
    payCashYuan: pay.payCashYuan || 0,
    payMode: pay.payMode || 'free',
    payLabel: pay.label || '',
    priceText: pay.label || '',
    listPriceCent: pay.listPriceCent || 0,
    listPriceYuan: pay.listPriceYuan || 0,
    mode: lMeta.mode || '',
    needStreak: Number(lMeta.needStreak || 0),
    needInvite: Number(lMeta.needInvite || 0),
    firstWave: !!lMeta.firstWave,
    costEnergy: Number(lMeta.costEnergy || 0),
    desc: lMeta.desc || '',
    coverTone: lMeta.coverTone || 'mint',
    meta: { ...pMeta, ...lMeta },
    listingMeta: lMeta,
  }
}

function getListing(channel, productId) {
  ensureReady()
  return db()
    .prepare(`SELECT * FROM channel_listing WHERE channel=? AND product_id=?`)
    .get(channel, productId)
}

function resolveChannelOffer(productId, channel) {
  ensureReady()
  const id = String(productId || '').trim()
  if (!id) return null
  const product = db().prepare('SELECT * FROM product WHERE id=?').get(id)
  if (!product) return null
  const ch = String(channel || '').trim()
  const listing = CHANNELS.has(ch) ? getListing(ch, id) : null
  if (CHANNELS.has(ch) && !listing) return null
  return mapJoinedOffer(product, listing, ch || '')
}

/** 无渠道时：优先 gift listing → mall listing → 纯物料 */
function resolveOfferAny(productId) {
  ensureReady()
  const id = String(productId || '').trim()
  if (!id) return null
  const gift = resolveChannelOffer(id, 'gift')
  if (gift) return gift
  const mall = resolveChannelOffer(id, 'mall')
  if (mall) return mall
  const product = db().prepare('SELECT * FROM product WHERE id=?').get(id)
  if (!product) return null
  return mapJoinedOffer(product, null, '')
}

function listListings(channel, { status = '', includeOff = false } = {}) {
  ensureReady()
  const ch = String(channel || '').trim()
  if (!CHANNELS.has(ch)) return []
  const d = db()
  let sql = `
    SELECT l.*, p.name AS p_name, p.image_url, p.stock, p.stock_alarm, p.cost_cent, p.tag,
           p.status AS p_status, p.kind AS p_kind, p.category AS p_category, p.meta_json AS p_meta,
           p.price_cent AS p_price_cent, p.points_off, p.sort_order AS p_sort
    FROM channel_listing l
    JOIN product p ON p.id = l.product_id
    WHERE l.channel=?`
  const args = [ch]
  if (status) {
    sql += ` AND l.status=?`
    args.push(status)
  } else if (!includeOff) {
    sql += ` AND l.status='on'`
  }
  sql += ` ORDER BY l.sort_order, l.product_id`
  return d.prepare(sql).all(...args).map((row) => {
    const productRow = {
      id: row.product_id,
      name: row.p_name,
      image_url: row.image_url,
      stock: row.stock,
      stock_alarm: row.stock_alarm,
      cost_cent: row.cost_cent,
      tag: row.tag,
      status: row.p_status,
      kind: row.p_kind,
      category: row.p_category,
      meta_json: row.p_meta,
      price_cent: row.p_price_cent,
      points_off: row.points_off,
      sort_order: row.p_sort,
    }
    const listingRow = {
      id: row.id,
      channel: row.channel,
      product_id: row.product_id,
      sort_order: row.sort_order,
      status: row.status,
      price_cent: row.price_cent,
      meta_json: row.meta_json,
      updated_at: row.updated_at,
    }
    return mapJoinedOffer(productRow, listingRow, ch)
  })
}

function listMallCatalog() {
  return listListings('mall', { status: 'on' }).filter((x) => x.productStatus === 'on')
}

function listGiftCatalog() {
  return listListings('gift', { status: 'on' }).filter((x) => x.productStatus === 'on')
}

function listListingsAdmin(channel) {
  return listListings(channel, { includeOff: true })
}

function upsertListing(body = {}) {
  ensureReady()
  const channel = String(body.channel || '').trim()
  const productId = String(body.productId || body.product_id || '').trim()
  if (!CHANNELS.has(channel)) return { ok: false, msg: 'channel 须为 mall 或 gift' }
  if (!productId) return { ok: false, msg: '缺少 productId' }
  const product = db().prepare('SELECT * FROM product WHERE id=?').get(productId)
  if (!product) return { ok: false, msg: '物料不存在，请先在物料中心创建' }

  const existing = getListing(channel, productId)
  const prevMeta = existing ? parseMeta(existing.meta_json) : {}
  let meta = { ...prevMeta }
  if (body.meta && typeof body.meta === 'object') meta = { ...meta, ...body.meta }
  meta = pricingService.applyMetaPayFields(meta, body)

  if (channel === 'gift') {
    if (body.mode != null) meta.mode = String(body.mode || '')
    if (body.desc != null) meta.desc = String(body.desc || '')
    if (body.needStreak != null) meta.needStreak = Math.max(0, Number(body.needStreak) || 0)
    if (body.needInvite != null) meta.needInvite = Math.max(0, Number(body.needInvite) || 0)
    if (body.firstWave != null) meta.firstWave = !!body.firstWave
    if (body.costEnergy != null) meta.costEnergy = Math.max(0, Number(body.costEnergy) || 0)
    if (body.coverTone != null) meta.coverTone = String(body.coverTone || 'mint')
  }

  let priceCent =
    body.priceCent != null
      ? Math.round(Number(body.priceCent))
      : body.priceYuan != null
        ? Math.round(Number(body.priceYuan) * 100)
        : body.price != null
          ? Math.round(Number(body.price) * 100)
          : existing
            ? Number(existing.price_cent || 0)
            : Number(product.price_cent || 0)
  if (!Number.isFinite(priceCent) || priceCent < 0) return { ok: false, msg: '售价无效' }

  let sortOrder
  if (body.sortOrder != null && body.sortOrder !== '') {
    sortOrder = Number(body.sortOrder)
  } else if (existing) {
    sortOrder = Number(existing.sort_order || 0)
  } else {
    const maxRow = db()
      .prepare(`SELECT MAX(sort_order) AS m FROM channel_listing WHERE channel=?`)
      .get(channel)
    sortOrder = Number(maxRow && maxRow.m != null ? maxRow.m : -1) + 1
  }

  const status = body.status === 'off' ? 'off' : body.status === 'on' ? 'on' : existing ? existing.status : 'on'

  upsertListingRow({
    channel,
    productId,
    sortOrder,
    status,
    priceCent,
    meta,
  })

  // 商城上架变更后同步壳层 snapshot
  if (channel === 'mall') {
    try {
      require('./adminService').publishMallLive()
    } catch (e) {
      console.warn('[listing] publishMallLive', e && e.message)
    }
  }

  return { ok: true, item: resolveChannelOffer(productId, channel) }
}

function deleteListing(channel, productId) {
  ensureReady()
  const ch = String(channel || '').trim()
  const pid = String(productId || '').trim()
  if (!CHANNELS.has(ch) || !pid) return { ok: false, msg: '参数无效' }
  db().prepare(`DELETE FROM channel_listing WHERE channel=? AND product_id=?`).run(ch, pid)
  if (ch === 'mall') {
    try {
      require('./adminService').publishMallLive()
    } catch (_) {}
  }
  return { ok: true }
}

function moveListingSort(channel, productId, direction = 'up') {
  ensureReady()
  const ch = String(channel || '').trim()
  const pid = String(productId || '').trim()
  if (!CHANNELS.has(ch) || !pid) return { ok: false, msg: '参数无效' }
  const d = db()
  const list = d
    .prepare(`SELECT id, product_id, sort_order FROM channel_listing WHERE channel=? ORDER BY sort_order, product_id`)
    .all(ch)
  const idx = list.findIndex((r) => r.product_id === pid)
  if (idx < 0) return { ok: false, msg: '上架记录不存在' }
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= list.length) {
    return { ok: true, moved: false, list: listListingsAdmin(ch) }
  }
  const next = list.slice()
  const tmp = next[idx]
  next[idx] = next[swapIdx]
  next[swapIdx] = tmp
  const t = now()
  const upd = d.prepare(`UPDATE channel_listing SET sort_order=?, updated_at=? WHERE id=?`)
  const tx = d.transaction(() => {
    next.forEach((row, i) => upd.run(i, t, row.id))
  })
  tx()
  if (ch === 'mall') {
    try {
      require('./adminService').publishMallLive()
    } catch (_) {}
  }
  return { ok: true, moved: true, list: listListingsAdmin(ch) }
}

function hasGiftListing(productId) {
  ensureReady()
  const row = getListing('gift', String(productId || '').trim())
  return !!(row && row.status === 'on')
}

function mapGiftClient(offer) {
  if (!offer) return null
  return {
    id: offer.productId || offer.id,
    name: offer.name,
    coverTone: offer.coverTone || 'mint',
    costPoints: offer.payPoints || 0,
    costEnergy: offer.costEnergy || 0,
    mode: offer.mode || 'points',
    tag: offer.tag || (offer.firstWave ? '首兑专属' : ''),
    stock: offer.stock,
    status: offer.status || 'on',
    needInvite: offer.needInvite || 0,
    needCash: offer.payCashCent || 0,
    needStreak: offer.needStreak || 0,
    firstWave: !!offer.firstWave,
    desc: offer.desc || '',
    imageUrl: offer.imageUrl,
    costCent: offer.costCent,
    payPoints: offer.payPoints || 0,
    payCashCent: offer.payCashCent || 0,
    payCashYuan: offer.payCashYuan || 0,
    payMode: offer.payMode,
    payLabel: offer.payLabel,
  }
}

function mapMallClient(offer) {
  if (!offer) return null
  return {
    id: offer.productId || offer.id,
    name: offer.name,
    category: offer.category || '推荐',
    price: offer.price,
    pointsOff: 0,
    payPoints: offer.payPoints,
    payCashCent: offer.payCashCent,
    payCashYuan: offer.payCashYuan,
    listPriceCent: offer.listPriceCent,
    listPriceYuan: offer.listPriceYuan,
    payMode: offer.payMode,
    payLabel: offer.payLabel,
    stock: offer.stock,
    imageUrl: offer.imageUrl,
    tag: offer.tag,
    subtitle: offer.subtitle || '',
    detailHtml: offer.detailHtml || '',
    gallery: offer.gallery || [],
  }
}

module.exports = {
  MATERIAL_KINDS,
  CHANNELS,
  ensureSchema,
  ensureReady,
  migrateFromLegacy,
  normalizeMaterialKind,
  categoryForKind,
  getListing,
  resolveChannelOffer,
  resolveOfferAny,
  listListings,
  listListingsAdmin,
  listMallCatalog,
  listGiftCatalog,
  upsertListing,
  deleteListing,
  moveListingSort,
  hasGiftListing,
  mapGiftClient,
  mapMallClient,
  mapJoinedOffer,
  stripChannelFieldsFromProductMeta,
}

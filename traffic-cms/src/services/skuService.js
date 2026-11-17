/**
 * 物料主数据（product）：kind ∈ {physical, virtual, seed}
 * 商城 / 兑好礼经营字段在 channel_listing，见 listingService
 */
const dbMod = require('../db')
const mediaUrl = require('../mediaUrl')

const MATERIAL_KINDS = ['physical', 'virtual', 'seed']

let migrated = false

function db() {
  return dbMod.open()
}
function now() {
  return dbMod.nowIso()
}

function ensureKindColumn() {
  // MySQL 列由 openAsync 迁移；热路径禁止 deasync information_schema
  if (dbMod.DIALECT === 'mysql') return
  require('./lotteryService').ensureSchema()
  dbMod.addColumnIfMissing(db(), 'product', 'kind', "VARCHAR(32) NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''")
}

function inferKind(row) {
  const listing = require('./listingService')
  return listing.normalizeMaterialKind(
    row.kind,
    row.category,
    row.tag,
    (() => {
      try {
        return JSON.parse(row.meta_json || '{}')
      } catch (_) {
        return {}
      }
    })()
  )
}

/**
 * 补全空 kind + 触发渠道上架回填；禁止自动 INSERT 演示 SKU。
 */
let migratingKinds = false
function migrateKinds() {
  if (migrated) return
  // 并发 stampede：多个运营台请求同时进迁移会把 SyncGate 打满
  if (migratingKinds) return
  migratingKinds = true
  try {
    ensureKindColumn()
    try {
      require('./listingService').ensureReady()
    } catch (e) {
      console.warn('[sku] listing migrate', e && e.message)
    }
    const d = db()
    d.prepare(`SELECT id, category, tag, meta_json, kind FROM product`).all().forEach((row) => {
      const kind = inferKind(row)
      if (row.kind !== kind) {
        const category = require('./listingService').categoryForKind(kind)
        d.prepare(`UPDATE product SET kind=?, category=? WHERE id=?`).run(kind, category, row.id)
      }
    })
    try {
      d.prepare(
        `DELETE FROM product WHERE id IN ('virt_empty','virt_energy30') AND category='虚拟'
           AND (image_url IS NULL OR image_url='' OR image_url LIKE '/static/%')`
      ).run()
    } catch (_) {}
    try {
      require('./commerceService').purgeDemoGiftsWithoutImage()
    } catch (_) {}
    migrated = true
  } finally {
    migratingKinds = false
  }
}

function mapSku(p) {
  let meta = {}
  try {
    meta = JSON.parse(p.meta_json || '{}')
  } catch (_) {}
  const kind = p.kind || inferKind(p)
  return {
    id: p.id,
    name: p.name,
    kind,
    category: p.category,
    priceCent: p.price_cent,
    price: Math.round(Number(p.price_cent || 0)) / 100,
    costCent: p.cost_cent,
    pointsOff: p.points_off,
    purchaseUrl: meta.purchaseUrl || '',
    stock: p.stock,
    stockAlarm: p.stock_alarm,
    imageUrl: mediaUrl.clientMediaPath(p.image_url),
    imageUrlAdmin: mediaUrl.adminProxyUrl(p.image_url),
    tag: p.tag,
    status: p.status,
    sortOrder: p.sort_order,
    meta,
    subtitle: meta.subtitle || '',
    detailHtml: meta.detailHtml || '',
    gallery: Array.isArray(meta.gallery) ? meta.gallery : [],
    seedId: meta.seedId || (kind === 'seed' ? p.id : ''),
  }
}

function listSkus({ kind = '', status = '', q = '' } = {}) {
  migrateKinds()
  const d = db()
  let sql = `SELECT * FROM product WHERE 1=1`
  const args = []
  if (kind) {
    if (kind === 'mall' || kind === 'gift') {
      // 兼容旧 filter：按上架渠道筛物料
      try {
        require('./listingService').ensureReady()
        const ids = d
          .prepare(`SELECT product_id FROM channel_listing WHERE channel=?`)
          .all(kind)
          .map((r) => r.product_id)
        if (!ids.length) return []
        sql += ` AND id IN (${ids.map(() => '?').join(',')})`
        args.push(...ids)
      } catch (_) {
        sql += ` AND 1=0`
      }
    } else {
      sql += ` AND kind=?`
      args.push(kind)
    }
  }
  if (status) {
    sql += ` AND status=?`
    args.push(status)
  }
  if (q) {
    sql += ` AND (id LIKE ? OR name LIKE ?)`
    args.push(`%${q}%`, `%${q}%`)
  }
  sql += ` ORDER BY sort_order, id`
  return d.prepare(sql).all(...args).map(mapSku)
}

/** 运营台热读：queryAsync，避开 SyncGate */
async function listSkusAsync({ kind = '', status = '', q = '' } = {}) {
  if (!migrated) {
    try {
      await dbMod.runSync(() => migrateKinds())
    } catch (e) {
      if (!(e && e.code === 'DB_BUSY')) console.warn('[sku] migrateKinds', e && e.message)
    }
  }
  let sql = `SELECT * FROM product WHERE 1=1`
  const args = []
  if (kind) {
    if (kind === 'mall' || kind === 'gift') {
      try {
        const [idRows] = await dbMod.queryAsync(
          `SELECT product_id FROM channel_listing WHERE channel=?`,
          [kind]
        )
        const ids = (idRows || []).map((r) => r.product_id)
        if (!ids.length) return []
        sql += ` AND id IN (${ids.map(() => '?').join(',')})`
        args.push(...ids)
      } catch (_) {
        return []
      }
    } else {
      sql += ` AND kind=?`
      args.push(kind)
    }
  }
  if (status) {
    sql += ` AND status=?`
    args.push(status)
  }
  if (q) {
    sql += ` AND (id LIKE ? OR name LIKE ?)`
    args.push(`%${q}%`, `%${q}%`)
  }
  sql += ` ORDER BY sort_order, id`
  const [rows] = await dbMod.queryAsync(sql, args)
  return (rows || []).map(mapSku)
}

function upsertSku(body = {}) {
  migrateKinds()
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const d = db()
  let kind = String(body.kind || 'physical').trim()
  // 拒绝再用 mall/gift 当物料类型
  if (kind === 'mall' || kind === 'gift' || kind === 'bundle' || kind === 'physical') {
    if (kind === 'mall' || kind === 'gift' || kind === 'bundle') kind = 'physical'
  }
  if (!MATERIAL_KINDS.includes(kind)) {
    return { ok: false, msg: '物料类型须为 physical / virtual / seed' }
  }
  const listing = require('./listingService')
  const category = body.category || listing.categoryForKind(kind)
  let meta = body.meta && typeof body.meta === 'object' ? { ...body.meta } : {}
  if (kind === 'seed' && !meta.seedId) meta.seedId = id
  if (body.purchaseUrl != null) {
    const url = String(body.purchaseUrl || '').trim()
    if (url) meta.purchaseUrl = url
    else delete meta.purchaseUrl
  }
  if (body.subtitle != null) meta.subtitle = String(body.subtitle || '')
  if (body.detailHtml != null) meta.detailHtml = String(body.detailHtml || '')
  if (body.gallery != null) {
    meta.gallery = Array.isArray(body.gallery)
      ? body.gallery.map(String).filter(Boolean)
      : String(body.gallery || '')
          .split(/\n|,/)
          .map((s) => s.trim())
          .filter(Boolean)
  }
  // 物料主数据不存渠道价/门槛
  meta = listing.stripChannelFieldsFromProductMeta(meta)

  const t = now()
  const exists = d.prepare('SELECT id FROM product WHERE id=?').get(id)
  const priceCent =
    body.priceCent != null
      ? Math.round(Number(body.priceCent))
      : Math.round(Number(body.price || 0) * 100)
  const costCent = Math.round(Number(body.costCent != null ? body.costCent : body.cost || 0))
  const pointsOff = Number(body.pointsOff != null ? body.pointsOff : 0)
  const args = [
    body.name || id,
    category,
    priceCent,
    costCent,
    pointsOff,
    Number(body.stock != null ? body.stock : 0),
    Number(body.stockAlarm != null ? body.stockAlarm : 10),
    body.imageUrl || body.image_url || '',
    body.tag || '',
    body.status || 'on',
    Number(body.sortOrder || 0),
    JSON.stringify(meta),
    t,
    kind,
  ]
  if (exists) {
    d.prepare(
      `UPDATE product SET name=?, category=?, price_cent=?, cost_cent=?, points_off=?, stock=?, stock_alarm=?,
       image_url=?, tag=?, status=?, sort_order=?, meta_json=?, updated_at=?, kind=? WHERE id=?`
    ).run(...args, id)
  } else {
    d.prepare(
      `INSERT INTO product (id,name,category,price_cent,cost_cent,points_off,stock,stock_alarm,image_url,tag,status,sort_order,meta_json,updated_at,kind)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, ...args)
  }
  return { ok: true, item: mapSku(d.prepare('SELECT * FROM product WHERE id=?').get(id)) }
}

function listUserSeeds(userId) {
  require('./treeService').ensureSchema()
  const rows = db()
    .prepare(`SELECT seed_id, qty FROM user_seed WHERE user_id=? AND qty>0`)
    .all(userId)
  const catalog = require('./treeService').treeRules().seeds
  return {
    items: rows.map((r) => {
      const s = catalog.find((c) => c.id === r.seed_id)
      const sku = db().prepare(`SELECT * FROM product WHERE id=?`).get(r.seed_id)
      return {
        seedId: r.seed_id,
        qty: r.qty,
        name: (s && s.name) || (sku && sku.name) || r.seed_id,
        theme: s && s.theme,
        obtain: s && s.obtain,
        rarity: s && s.rarity,
        yieldMult: s && s.yieldMult,
        imageUrl: sku ? mediaUrl.clientMediaPath(sku.image_url) : '',
      }
    }),
  }
}

module.exports = {
  MATERIAL_KINDS,
  ensureKindColumn,
  migrateKinds,
  listSkus,
  listSkusAsync,
  upsertSku,
  listUserSeeds,
  mapSku,
  inferKind,
}

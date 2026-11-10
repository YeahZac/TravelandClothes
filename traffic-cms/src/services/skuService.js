/**
 * SKU 物料主数据：演进 product.kind，渠道只引用
 * kind: mall | gift | seed | virtual | physical | bundle
 */
const dbMod = require('../db')
const mediaUrl = require('../mediaUrl')

let migrated = false

function db() {
  return dbMod.open()
}
function now() {
  return dbMod.nowIso()
}

function ensureKindColumn() {
  require('./lotteryService').ensureSchema()
  dbMod.addColumnIfMissing(db(), 'product', 'kind', "VARCHAR(32) NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''")
}

function inferKind(row) {
  if (row.kind) return row.kind
  if (row.category === '兑礼') return 'gift'
  if (row.category === '种子' || row.tag === '树种') return 'seed'
  let meta = {}
  try {
    meta = JSON.parse(row.meta_json || '{}')
  } catch (_) {}
  if (meta.seedId) return 'seed'
  if (meta.costPoints != null || meta.mode) return 'gift'
  return 'mall'
}

/**
 * 只给已有行补 kind，禁止自动 INSERT 虚拟/种子等演示 SKU。
 * 历史上 migrateKinds 会在列表/编辑时写入 virt_*、seed_*，造成「一点编辑就冒出虚拟商品」。
 */
function migrateKinds() {
  ensureKindColumn()
  if (migrated) return
  const d = db()
  d.prepare(`SELECT id, category, tag, meta_json, kind FROM product`).all().forEach((row) => {
    if (row.kind) return
    const kind = inferKind(row)
    d.prepare(`UPDATE product SET kind=? WHERE id=?`).run(kind, row.id)
  })
  // 清掉早期自动灌入、且无真实图/无采购链接的占位虚拟 SKU（不影响运营手建的 virtual）
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
}

function mapSku(p) {
  let meta = {}
  try {
    meta = JSON.parse(p.meta_json || '{}')
  } catch (_) {}
  const pay = require('./pricingService').resolvePayMix(p)
  return {
    id: p.id,
    name: p.name,
    kind: p.kind || inferKind(p),
    category: p.category,
    priceCent: p.price_cent,
    price: Math.round(Number(p.price_cent || 0)) / 100,
    costCent: p.cost_cent,
    pointsOff: p.points_off,
    payPoints: pay.payPoints,
    payCashCent: pay.payCashCent,
    payCashYuan: pay.payCashYuan,
    listPriceCent: pay.listPriceCent,
    listPriceYuan: pay.listPriceYuan,
    payMode: pay.payMode,
    payLabel: pay.label,
    purchaseUrl: meta.purchaseUrl || '',
    stock: p.stock,
    stockAlarm: p.stock_alarm,
    // 入库相对路径（编辑保存用）；管理台预览请用 imageUrlAdmin / media 代理
    imageUrl: mediaUrl.clientMediaPath(p.image_url),
    imageUrlAdmin: mediaUrl.adminProxyUrl(p.image_url),
    tag: p.tag,
    status: p.status,
    sortOrder: p.sort_order,
    meta,
    seedId: meta.seedId || (p.kind === 'seed' ? p.id : ''),
  }
}

function listSkus({ kind = '', status = '', q = '' } = {}) {
  migrateKinds()
  const d = db()
  let sql = `SELECT * FROM product WHERE 1=1`
  const args = []
  if (kind) {
    sql += ` AND kind=?`
    args.push(kind)
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

function upsertSku(body = {}) {
  migrateKinds()
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const d = db()
  const kind = String(body.kind || 'mall')
  const category =
    body.category ||
    (kind === 'gift' ? '兑礼' : kind === 'seed' ? '种子' : kind === 'virtual' ? '虚拟' : '推荐')
  let meta = body.meta && typeof body.meta === 'object' ? { ...body.meta } : {}
  if (kind === 'seed' && !meta.seedId) meta.seedId = id
  if (body.purchaseUrl != null) {
    const url = String(body.purchaseUrl || '').trim()
    if (url) meta.purchaseUrl = url
    else delete meta.purchaseUrl
  }
  meta = require('./pricingService').applyMetaPayFields(meta, body)
  const t = now()
  const exists = d.prepare('SELECT id FROM product WHERE id=?').get(id)
  const priceCent =
    body.priceCent != null
      ? Math.round(Number(body.priceCent))
      : Math.round(Number(body.price || 0) * 100)
  const costCent = Math.round(Number(body.costCent != null ? body.costCent : body.cost || 0))
  const payPts = Number(meta.payPoints != null ? meta.payPoints : body.pointsOff || 0)
  const pointsOff =
    body.pointsOff != null ? Number(body.pointsOff) : Math.round((payPts / 10) * 10) / 10
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
  ensureKindColumn,
  migrateKinds,
  listSkus,
  upsertSku,
  listUserSeeds,
  mapSku,
  inferKind,
}

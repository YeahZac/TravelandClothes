/**
 * 用户购物车（商城）：服务端持久化，登录后可跨端同步。
 */
const dbMod = require('../db')

let ready = false

function db() {
  return dbMod.open()
}
function now() {
  return dbMod.nowIso()
}

function ensureSchema() {
  if (ready) return
  const d = db()
  if (dbMod.DIALECT === 'mysql') {
    d.prepare(
      `CREATE TABLE IF NOT EXISTS user_cart (
        user_id INT NOT NULL,
        product_id VARCHAR(64) NOT NULL,
        qty INT NOT NULL DEFAULT 1,
        updated_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (user_id, product_id),
        KEY idx_cart_user (user_id)
      )`
    ).run()
  } else {
    d.exec(`
      CREATE TABLE IF NOT EXISTS user_cart (
        user_id INTEGER NOT NULL,
        product_id TEXT NOT NULL,
        qty INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, product_id)
      );
    `)
  }
  ready = true
}

function mapLine(row, offer) {
  const qty = Math.max(1, Number(row.qty || 1))
  const payCashCent = offer ? Number(offer.payCashCent || 0) : 0
  const priceYuan = offer ? Number(offer.price || payCashCent / 100 || 0) : 0
  return {
    id: row.product_id,
    productId: row.product_id,
    qty,
    name: (offer && offer.name) || row.product_id,
    imageUrl: (offer && offer.imageUrl) || '',
    price: priceYuan,
    payPoints: offer ? Number(offer.payPoints || 0) : 0,
    payCashCent,
    payLabel: (offer && offer.payLabel) || '',
    stock: offer ? Number(offer.stock || 0) : 0,
    status: offer ? offer.status : 'off',
    available: !!(offer && offer.productStatus === 'on' && offer.status === 'on'),
  }
}

function listCart(userId) {
  ensureSchema()
  const listing = require('./listingService')
  listing.ensureReady()
  const rows = db()
    .prepare(`SELECT * FROM user_cart WHERE user_id=? ORDER BY updated_at DESC`)
    .all(userId)
  const items = rows.map((r) => {
    const offer = listing.resolveChannelOffer(r.product_id, 'mall')
    return mapLine(r, offer)
  })
  const totalCashCent = items.reduce((s, i) => s + Number(i.payCashCent || 0) * i.qty, 0)
  const totalPoints = items.reduce((s, i) => s + Number(i.payPoints || 0) * i.qty, 0)
  return {
    items,
    count: items.reduce((s, i) => s + i.qty, 0),
    totalCashCent,
    totalCashYuan: Math.round(totalCashCent) / 100,
    totalPoints,
  }
}

function upsertItem(userId, productId, qty) {
  ensureSchema()
  const pid = String(productId || '').trim()
  if (!pid) return { ok: false, msg: '缺少商品' }
  const q = Math.max(0, Math.round(Number(qty) || 0))
  if (q <= 0) {
    db().prepare(`DELETE FROM user_cart WHERE user_id=? AND product_id=?`).run(userId, pid)
    return { ok: true, cart: listCart(userId) }
  }
  const listing = require('./listingService')
  listing.ensureReady()
  const offer = listing.resolveChannelOffer(pid, 'mall')
  if (!offer || offer.status !== 'on' || offer.productStatus !== 'on') {
    return { ok: false, msg: '商品未在商城上架' }
  }
  if (offer.stock < q) return { ok: false, msg: `库存不足（仅剩 ${offer.stock}）` }
  const t = now()
  const d = db()
  const exists = d.prepare(`SELECT product_id FROM user_cart WHERE user_id=? AND product_id=?`).get(userId, pid)
  if (exists) {
    d.prepare(`UPDATE user_cart SET qty=?, updated_at=? WHERE user_id=? AND product_id=?`).run(q, t, userId, pid)
  } else {
    d.prepare(`INSERT INTO user_cart (user_id, product_id, qty, updated_at) VALUES (?,?,?,?)`).run(
      userId,
      pid,
      q,
      t
    )
  }
  return { ok: true, cart: listCart(userId) }
}

function removeItem(userId, productId) {
  ensureSchema()
  db()
    .prepare(`DELETE FROM user_cart WHERE user_id=? AND product_id=?`)
    .run(userId, String(productId || '').trim())
  return { ok: true, cart: listCart(userId) }
}

function clearCart(userId, productIds) {
  ensureSchema()
  const d = db()
  if (Array.isArray(productIds) && productIds.length) {
    productIds.forEach((id) => {
      d.prepare(`DELETE FROM user_cart WHERE user_id=? AND product_id=?`).run(userId, String(id))
    })
  } else {
    d.prepare(`DELETE FROM user_cart WHERE user_id=?`).run(userId)
  }
  return { ok: true, cart: listCart(userId) }
}

/** 登录后合并本地车：本地 qty 与服务端取较大值 */
function mergeLocal(userId, localItems = []) {
  ensureSchema()
  const listing = require('./listingService')
  listing.ensureReady()
  ;(localItems || []).forEach((it) => {
    const pid = String((it && (it.productId || it.id)) || '').trim()
    const addQty = Math.max(0, Math.round(Number(it && it.qty) || 0))
    if (!pid || addQty <= 0) return
    const offer = listing.resolveChannelOffer(pid, 'mall')
    if (!offer || offer.status !== 'on') return
    const cur = db()
      .prepare(`SELECT qty FROM user_cart WHERE user_id=? AND product_id=?`)
      .get(userId, pid)
    const next = Math.min(offer.stock || addQty, Math.max(Number(cur && cur.qty) || 0, addQty))
    if (next > 0) upsertItem(userId, pid, next)
  })
  return { ok: true, cart: listCart(userId) }
}

module.exports = {
  ensureSchema,
  listCart,
  upsertItem,
  removeItem,
  clearCart,
  mergeLocal,
}

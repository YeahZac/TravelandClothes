/**
 * 用户侧：收货地址 + 订单查询；创建订单复用 adminService.createRedeemOrder
 */
const dbMod = require('../db')
const adminService = require('./adminService')

function db() {
  return dbMod.open()
}

function now() {
  return dbMod.nowIso()
}

/** 历史演示兑礼：仅用于清理，禁止再 INSERT */
const DEMO_GIFT_SPECS = [
  { id: 'g1', name: '便携化妆镜' },
  { id: 'g2', name: '卡通数据线收纳' },
  { id: 'g3', name: '随身香氛片 ×3' },
  { id: 'g4', name: '潮玩贴纸包' },
  { id: 'g5', name: '趣味冰箱贴' },
]

/**
 * 禁止自动灌演示兑礼；触发 listing 迁移后清理无图演示货。
 */
function seedGiftProducts() {
  try {
    require('./listingService').ensureReady()
  } catch (_) {}
  purgeDemoGiftsWithoutImage()
}

/** 删除仍是演示名且无真实主图的 g1–g5 */
function purgeDemoGiftsWithoutImage() {
  const d = db()
  DEMO_GIFT_SPECS.forEach(({ id, name }) => {
    try {
      const row = d.prepare('SELECT id, name, image_url FROM product WHERE id=?').get(id)
      if (!row) return
      const img = String(row.image_url || '').trim()
      const nm = String(row.name || '')
      const isDemoName = nm === name || nm.startsWith(name)
      const noRealImage = !img || img.startsWith('/static/')
      if (isDemoName && noRealImage) {
        d.prepare('DELETE FROM product WHERE id=?').run(id)
      }
    } catch (_) {}
  })
}

function deriveGiftMode(meta = {}) {
  const explicit = String(meta.mode || '').trim()
  if (explicit) return explicit
  const payPts = Number(meta.payPoints != null ? meta.payPoints : meta.costPoints || 0)
  const payCash = Number(meta.payCashCent != null ? meta.payCashCent : meta.needCash || 0)
  if (meta.firstWave || Number(meta.costEnergy || 0) > 0) return 'growth'
  if (Number(meta.needInvite || 0) > 0) return 'points_invite'
  if (Number(meta.needStreak || 0) > 0) return 'points_streak'
  if (payPts > 0 && payCash > 0) return 'points_cash'
  return 'points'
}

function mapGiftRow(p) {
  // 兼容：直接 product 行或 listing 投影
  if (p && p.payLabel != null && p.productId) {
    return require('./listingService').mapGiftClient(p)
  }
  let meta = {}
  try {
    meta = JSON.parse(p.meta_json || '{}')
  } catch (e) {}
  const mode = deriveGiftMode(meta)
  const payPts = Number(meta.payPoints != null ? meta.payPoints : meta.costPoints || 0)
  const payCash = Number(meta.payCashCent != null ? meta.payCashCent : meta.needCash || 0)
  return {
    id: p.id,
    name: p.name,
    coverTone: meta.coverTone || 'mint',
    costPoints: payPts,
    costEnergy: meta.costEnergy || 0,
    mode,
    tag: p.tag || (meta.firstWave ? '首兑专属' : ''),
    stock: p.stock,
    status: p.status || 'on',
    needInvite: meta.needInvite || 0,
    needCash: payCash,
    needStreak: meta.needStreak || 0,
    firstWave: !!meta.firstWave,
    desc: meta.desc || '',
    imageUrl: p.image_url,
    costCent: p.cost_cent,
    payPoints: payPts,
    payCashCent: payCash,
    payCashYuan: payCash / 100,
  }
}

function listGifts() {
  seedGiftProducts()
  const listing = require('./listingService')
  return listing.listGiftCatalog().map((o) => listing.mapGiftClient(o))
}

function listGiftsAdmin() {
  seedGiftProducts()
  const listing = require('./listingService')
  return listing.listListingsAdmin('gift').map((o) => listing.mapGiftClient(o))
}

/* ——— 地址 ——— */
function listAddresses(userId) {
  return db()
    .prepare(`SELECT * FROM user_address WHERE user_id=? ORDER BY is_default DESC, id DESC`)
    .all(userId)
    .map(mapAddress)
}

function mapAddress(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    province: row.province,
    city: row.city,
    district: row.district,
    detail: row.detail,
    isDefault: !!row.is_default,
    full: `${row.province}${row.city}${row.district}${row.detail}`,
  }
}

function getAddress(userId, id) {
  const row = db().prepare(`SELECT * FROM user_address WHERE id=? AND user_id=?`).get(id, userId)
  return mapAddress(row)
}

function saveAddress(userId, body) {
  const d = db()
  const name = String(body.name || '').trim()
  const phone = String(body.phone || '').replace(/\s+/g, '').trim()
  const province = String(body.province || '').trim()
  const city = String(body.city || '').trim()
  const district = String(body.district || '').trim()
  const detail = String(body.detail || '').trim()
  if (!name || !phone || !detail) return { ok: false, msg: '请填写姓名、手机号与详细地址' }
  if (!province || !city || !district) return { ok: false, msg: '请选择省市区' }
  if (!/^1\d{10}$/.test(phone)) return { ok: false, msg: '手机号格式不正确' }
  const t = now()
  const isDefault = body.isDefault ? 1 : 0
  const id = body.id != null && body.id !== '' ? Number(body.id) : 0
  try {
    if (isDefault) {
      d.prepare(`UPDATE user_address SET is_default=0 WHERE user_id=?`).run(userId)
    }
    if (id > 0) {
      const row = d.prepare(`SELECT id FROM user_address WHERE id=? AND user_id=?`).get(id, userId)
      if (!row) return { ok: false, msg: '地址不存在' }
      d.prepare(
        `UPDATE user_address SET name=?, phone=?, province=?, city=?, district=?, detail=?, is_default=?, updated_at=? WHERE id=?`
      ).run(name, phone, province, city, district, detail, isDefault, t, id)
      return { ok: true, address: getAddress(userId, id) }
    }
    // 首条默认
    const count = d.prepare(`SELECT COUNT(*) AS n FROM user_address WHERE user_id=?`).get(userId).n
    const def = isDefault || count === 0 ? 1 : 0
    if (def) d.prepare(`UPDATE user_address SET is_default=0 WHERE user_id=?`).run(userId)
    const info = d
      .prepare(
        `INSERT INTO user_address (user_id,name,phone,province,city,district,detail,is_default,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run(userId, name, phone, province, city, district, detail, def, t, t)
    let newId = Number(info.lastInsertRowid || info.insertId || 0)
    if (!newId) {
      const latest = d
        .prepare(`SELECT id FROM user_address WHERE user_id=? ORDER BY id DESC LIMIT 1`)
        .get(userId)
      newId = latest && latest.id
    }
    if (!newId) return { ok: false, msg: '地址保存失败，请重试' }
    return { ok: true, address: getAddress(userId, newId) }
  } catch (e) {
    console.warn('[commerce] saveAddress', e && e.message)
    return { ok: false, msg: e.message || '地址保存失败' }
  }
}

function deleteAddress(userId, id) {
  const d = db()
  const row = d.prepare(`SELECT * FROM user_address WHERE id=? AND user_id=?`).get(id, userId)
  if (!row) return { ok: false, msg: '地址不存在' }
  d.prepare(`DELETE FROM user_address WHERE id=?`).run(id)
  if (row.is_default) {
    const next = d.prepare(`SELECT id FROM user_address WHERE user_id=? ORDER BY id DESC LIMIT 1`).get(userId)
    if (next) d.prepare(`UPDATE user_address SET is_default=1 WHERE id=?`).run(next.id)
  }
  return { ok: true }
}

function setDefaultAddress(userId, id) {
  const d = db()
  const row = d.prepare(`SELECT id FROM user_address WHERE id=? AND user_id=?`).get(id, userId)
  if (!row) return { ok: false, msg: '地址不存在' }
  d.prepare(`UPDATE user_address SET is_default=0 WHERE user_id=?`).run(userId)
  d.prepare(`UPDATE user_address SET is_default=1, updated_at=? WHERE id=?`).run(now(), id)
  return { ok: true, address: getAddress(userId, id) }
}

/* ——— 下单 ——— */
function validateAddressPayload(address) {
  if (!address) return '请选择收货地址'
  if (!address.name || !address.phone || !address.detail) return '收货地址不完整'
  if (!/^1\d{10}$/.test(String(address.phone))) return '手机号格式不正确'
  return ''
}

function ensureOrderExtras() {
  // MySQL 列由发布前 schema / 人工迁移保证，业务请求禁止 information_schema / ALTER。
  if (dbMod.DIALECT === 'mysql') return
  try {
    require('./wxPayService').ensurePayColumns()
  } catch (_) {}
  try {
    require('./opsService').ensureSchemaExtras()
  } catch (_) {}
  dbMod.addColumnIfMissing(
    db(),
    'redeem_order',
    'items_json',
    `MEDIUMTEXT NULL`,
    `TEXT NOT NULL DEFAULT ''`
  )
}

function parseOrderItems(row) {
  if (!row) return []
  try {
    const raw = row.items_json
    if (!raw) return []
    const arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw
    return Array.isArray(arr) ? arr : []
  } catch (_) {
    return []
  }
}

/**
 * 商城多件一单（购物车结算）
 */
function placeMallMulti(userId, body = {}) {
  seedGiftProducts()
  ensureOrderExtras()
  const d = db()
  let address = body.address || null
  if (body.addressId) address = getAddress(userId, body.addressId)
  const addrErr = validateAddressPayload(address)
  if (addrErr) return { ok: false, msg: addrErr }

  const listingService = require('./listingService')
  listingService.ensureReady()
  const rawItems = Array.isArray(body.items) ? body.items : []
  if (!rawItems.length) return { ok: false, msg: '购物车为空' }

  const lines = []
  for (const it of rawItems) {
    const pid = String((it && (it.productId || it.id)) || '').trim()
    const q = Math.max(1, Math.round(Number(it && it.qty) || 1))
    if (!pid) continue
    const prod = d.prepare('SELECT * FROM product WHERE id=?').get(pid)
    if (!prod || prod.status !== 'on') return { ok: false, msg: `商品已下架：${pid}` }
    const offer = listingService.resolveChannelOffer(pid, 'mall')
    if (!offer || offer.status !== 'on') return { ok: false, msg: `未在商城上架：${prod.name}` }
    if (prod.stock < q) return { ok: false, msg: `${prod.name} 库存不足` }
    lines.push({
      productId: pid,
      productName: prod.name,
      qty: q,
      payPoints: Number(offer.payPoints || 0) * q,
      payCashCent: Number(offer.payCashCent || 0) * q,
      costCent: Number(prod.cost_cent || 0) * q,
      imageUrl: offer.imageUrl || '',
    })
  }
  if (!lines.length) return { ok: false, msg: '没有可结算商品' }

  const payPoints = lines.reduce((s, x) => s + x.payPoints, 0)
  const payCashCent = lines.reduce((s, x) => s + x.payCashCent, 0)
  const cost = lines.reduce((s, x) => s + x.costCent, 0)
  const qtyTotal = lines.reduce((s, x) => s + x.qty, 0)
  const productName =
    lines.length === 1 ? lines[0].productName : `${lines[0].productName} 等${lines.length}件`
  const productId = lines[0].productId

  const currency = require('./currencyService')
  currency.ensureMerged(userId)
  const energyBal = currency.walletEnergy(userId)
  if (payPoints > energyBal) {
    const gap = payPoints - energyBal
    return {
      ok: false,
      msg:
        energyBal <= 0
          ? `还差 ${payPoints} 能量值才能下单，去做签到或任务攒一攒吧`
          : `还差 ${gap} 能量值才能下单（当前 ${energyBal} / 需 ${payPoints}）`,
    }
  }

  const addrJson = {
    name: address.name,
    phone: address.phone,
    province: address.province || '',
    city: address.city || '',
    district: address.district || '',
    detail: address.detail,
    full:
      address.full ||
      `${address.province || ''}${address.city || ''}${address.district || ''}${address.detail}`,
  }
  const ono = `M${Date.now()}${Math.floor(Math.random() * 900 + 100)}`
  const needWxPay = payCashCent > 0
  const initialStatus = needWxPay ? 'unpaid' : 'pending'
  const itemsJson = JSON.stringify(lines)
  const t = now()

  const tx = d.transaction(() => {
    const tdb = db()
    lines.forEach((line) => deductStockOrThrow(tdb, line.productId, line.qty, t))
    if (payPoints > 0) {
      const spent = currency.spendEnergy(userId, payPoints, {
        note: 'order:mall_cart',
        refType: 'order_energy',
        refId: ono,
      })
      if (!spent.ok) throw new Error(spent.msg || '能量值不足')
    }
    const cols = d.prepare('PRAGMA table_info(redeem_order)').all().map((c) => c.name)
    const hasPay = cols.includes('pay_status')
    const hasEntry = cols.includes('entry_from')
    const hasItems = cols.includes('items_json')
    if (hasPay && hasEntry && hasItems) {
      d.prepare(
        `INSERT INTO redeem_order (order_no,user_id,order_type,product_id,product_name,qty,pay_points,pay_cash_cent,cost_cent,status,pay_status,address_json,entry_from,items_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        ono,
        userId,
        'mall',
        productId,
        productName,
        qtyTotal,
        payPoints,
        payCashCent,
        cost,
        initialStatus,
        needWxPay ? 'unpaid' : 'none',
        JSON.stringify(addrJson),
        'cart',
        itemsJson,
        t,
        t
      )
    } else if (hasPay && hasEntry) {
      d.prepare(
        `INSERT INTO redeem_order (order_no,user_id,order_type,product_id,product_name,qty,pay_points,pay_cash_cent,cost_cent,status,pay_status,address_json,entry_from,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        ono,
        userId,
        'mall',
        productId,
        productName,
        qtyTotal,
        payPoints,
        payCashCent,
        cost,
        initialStatus,
        needWxPay ? 'unpaid' : 'none',
        JSON.stringify(addrJson),
        'cart',
        t,
        t
      )
      if (hasItems) {
        d.prepare(`UPDATE redeem_order SET items_json=? WHERE order_no=?`).run(itemsJson, ono)
      }
    } else {
      d.prepare(
        `INSERT INTO redeem_order (order_no,user_id,order_type,product_id,product_name,qty,pay_points,pay_cash_cent,cost_cent,status,address_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        ono,
        userId,
        'mall',
        productId,
        productName,
        qtyTotal,
        payPoints,
        payCashCent,
        cost,
        initialStatus,
        JSON.stringify(addrJson),
        t,
        t
      )
      try {
        d.prepare(`UPDATE redeem_order SET items_json=?, entry_from=?, pay_status=? WHERE order_no=?`).run(
          itemsJson,
          'cart',
          needWxPay ? 'unpaid' : 'none',
          ono
        )
      } catch (_) {}
    }
    if (!needWxPay && cost > 0) {
      adminService.addFinance({
        entryType: 'cost',
        category: 'gift_cost',
        amountCent: cost,
        refType: 'order',
        refId: ono,
        note: `履约成本 ${productName}`,
      })
    }
  })
  try {
    tx()
  } catch (e) {
    return { ok: false, msg: (e && e.message) || '下单失败' }
  }

  if (body.clearCart) {
    try {
      require('./cartService').clearCart(
        userId,
        lines.map((x) => x.productId)
      )
    } catch (_) {}
  }

  const order = getOrderByNo(userId, ono)
  return {
    ok: true,
    orderNo: ono,
    order,
    needWxPay,
    wallet: require('./currencyService').getWallet(userId),
  }
}

/** 条件扣库存：并发下单不超卖；不足时抛错让事务回滚（须传事务内 db()） */
function deductStockOrThrow(tdb, productId, qty, t) {
  const r = tdb
    .prepare(`UPDATE product SET stock=stock-?, updated_at=? WHERE id=? AND stock>=?`)
    .run(qty, t, productId, qty)
  if (!r || !r.changes) throw new Error('库存不足')
}

/**
 * 统一下单：mall / gift / jar / lottery_claim；商城多件传 items[]
 */
function placeOrder(userId, body = {}) {
  seedGiftProducts()
  ensureOrderExtras()
  const orderType = body.orderType || 'mall'
  if (orderType === 'mall' && Array.isArray(body.items) && body.items.length > 0) {
    return placeMallMulti(userId, body)
  }

  const d = db()
  const productId = body.productId || ''
  const qty = Math.max(1, Number(body.qty || 1))

  // 实物兑礼走风控熔断（商城现金单仍允许卖货变现）
  if (orderType !== 'mall') {
    try {
      const gate = require('./opsService').assertCanFulfill(userId, {
        orderType,
        isPhysical: true,
      })
      if (!gate.ok) return gate
    } catch (e) {}
  }

  let address = body.address || null
  if (body.addressId) {
    address = getAddress(userId, body.addressId)
  }
  const addrErr = validateAddressPayload(address)
  if (addrErr) return { ok: false, msg: addrErr }

  const prod = productId ? d.prepare('SELECT * FROM product WHERE id=?').get(productId) : null
  if (!prod) return { ok: false, msg: '商品不存在或已下架' }
  if (prod.status !== 'on') return { ok: false, msg: '商品已下架' }
  if (prod.stock < qty) return { ok: false, msg: '库存不足' }

  const listingService = require('./listingService')
  listingService.ensureReady()

  let channelOffer = null
  let meta = {}
  try {
    meta = JSON.parse(prod.meta_json || '{}')
  } catch (e) {}

  const wallet = d.prepare('SELECT * FROM user_wallet WHERE user_id=?').get(userId)
  if (!wallet) return { ok: false, msg: '钱包不存在' }

  // 兑价一律由服务端决定，客户端 payPoints/payCashCent 仅作展示，不参与计价
  let payPoints = 0
  let payCashCent = 0
  let claimRow = null
  let flashLock = null
  const entryFrom = String(body.entryFrom || body.from || body.channel || '')
    .trim()
    .slice(0, 64)

  const currency = require('./currencyService')
  currency.ensureMerged(userId)

  // 抽奖兑奖：必须核销 claimToken，防止重复兑
  if (orderType === 'lottery') {
    const token = String(body.claimToken || '').trim()
    if (!token) return { ok: false, msg: '缺少中奖凭证，请从中奖记录进入兑奖' }
    const consumed = require('./lotteryService').consumeClaim(userId, token, productId)
    if (!consumed.ok) return consumed
    claimRow = consumed.claim
    payPoints = 0
    payCashCent = 0
  } else if (orderType === 'mall') {
    channelOffer = listingService.resolveChannelOffer(productId, 'mall')
    if (!channelOffer || channelOffer.status !== 'on') {
      return { ok: false, msg: '该商品未在商城上架' }
    }
    payPoints = channelOffer.payPoints * qty
    payCashCent = channelOffer.payCashCent * qty
  } else if (orderType === 'gift' || orderType === 'jar') {
    channelOffer = listingService.resolveChannelOffer(productId, 'gift')
    if (!channelOffer || channelOffer.status !== 'on') {
      return { ok: false, msg: '该礼品未在兑好礼上架' }
    }
    meta = { ...meta, ...(channelOffer.listingMeta || {}) }
    if (entryFrom === 'flash') {
      // 准点价只认服务端「已锁名额」记录，防止绕过开兑窗口直接低价下单
      if (qty !== 1) return { ok: false, msg: '准点兑换每场限兑 1 件' }
      flashLock = require('./flashRedeemService').findOpenLock(userId, productId)
      if (!flashLock) return { ok: false, msg: '准点兑换名额已失效，请在开兑时段重新抢兑' }
      payPoints = flashLock.payPoints
      payCashCent = flashLock.payCashCent
    } else {
      payPoints = channelOffer.payPoints * qty
      payCashCent = channelOffer.payCashCent * qty
    }
    const needStreak = Number(meta.needStreak || 0)
    const needInvite = Number(meta.needInvite || 0)
    if (needStreak > 0) {
      try {
        const st = require('./checkinService').status(userId)
        const streak = st.todayDone ? st.streak : st.streak
        if ((streak || 0) < needStreak) {
          return { ok: false, msg: `需连签 ${needStreak} 天（当前 ${streak || 0}）` }
        }
      } catch (e) {
        return { ok: false, msg: `需连签 ${needStreak} 天` }
      }
    }
    if (needInvite > 0) {
      try {
        const n = require('./inviteService').validInviteCount(userId)
        if (n < needInvite) {
          return { ok: false, msg: `需有效邀请 ${needInvite} 人（当前 ${n}）` }
        }
      } catch (e) {
        return { ok: false, msg: `需有效邀请 ${needInvite} 人` }
      }
    }
    if (meta.firstWave) {
      try {
        const ops = require('./opsService')
        const snap = ops.riskSnapshot()
        const today = new Date().toISOString().slice(0, 10)
        const n = d
          .prepare(
            `SELECT COUNT(*) AS n FROM redeem_order r
             JOIN channel_listing l ON l.product_id=r.product_id AND l.channel='gift'
             WHERE substr(r.created_at,1,10)=? AND r.status!='cancelled'
               AND l.meta_json LIKE '%"firstWave":true%'`
          )
          .get(today).n
        if (n >= (snap.bigPrizeDailyCap || 30)) {
          return { ok: false, msg: '首兑专池今日已发完，明天再来' }
        }
      } catch (e) {}
    }
  }

  const energyBal = currency.walletEnergy(userId)
  if (payPoints > energyBal) {
    const gap = payPoints - energyBal
    return {
      ok: false,
      msg:
        energyBal <= 0
          ? `还差 ${payPoints} 能量值才能下单，去做签到或任务攒一攒吧`
          : `还差 ${gap} 能量值才能下单（当前 ${energyBal} / 需 ${payPoints}）`,
    }
  }

  const addrJson = {
    name: address.name,
    phone: address.phone,
    province: address.province || '',
    city: address.city || '',
    district: address.district || '',
    detail: address.detail,
    full: address.full || `${address.province || ''}${address.city || ''}${address.district || ''}${address.detail}`,
  }

  const defaultEntry =
    orderType === 'lottery'
      ? 'lottery'
      : orderType === 'jar'
        ? 'jar'
        : orderType === 'mall'
          ? 'mall'
          : 'gift_center'
  const entryVal = entryFrom || defaultEntry

  const cost = prod.cost_cent * qty
  const prefix = orderType === 'mall' ? 'M' : orderType === 'jar' ? 'J' : orderType === 'lottery' ? 'L' : 'G'
  const ono = `${prefix}${Date.now()}${Math.floor(Math.random() * 900 + 100)}`
  const needWxPay = payCashCent > 0
  const initialStatus = needWxPay ? 'unpaid' : 'pending'
  try {
    require('./wxPayService').ensurePayColumns()
  } catch (e) {}
  try {
    require('./opsService').ensureSchemaExtras()
  } catch (e) {}

  const tx = d.transaction(() => {
    const tdb = db()
    // 先做可回滚的抢占（库存 / 中奖凭证 / 准点名额），失败即整单回滚
    deductStockOrThrow(tdb, productId, qty, now())
    if (claimRow && claimRow.id) {
      if (!require('./lotteryService').markClaimUsed(claimRow.id, ono)) {
        throw new Error('中奖凭证已使用或失效')
      }
    }
    if (flashLock && !require('./flashRedeemService').bindLockToOrder(flashLock.id, ono)) {
      throw new Error('准点兑换名额已使用')
    }
    if (payPoints > 0) {
      const spent = require('./currencyService').spendEnergy(userId, payPoints, {
        note: `order:${orderType}`,
        refType: 'order_energy',
        refId: ono,
      })
      if (!spent.ok) throw new Error(spent.msg || '能量值不足')
    }
    const cols = d.prepare('PRAGMA table_info(redeem_order)').all().map((c) => c.name)
    const hasPay = cols.includes('pay_status')
    const hasEntry = cols.includes('entry_from')
    if (hasPay && hasEntry) {
      d.prepare(
        `INSERT INTO redeem_order (order_no,user_id,order_type,product_id,product_name,qty,pay_points,pay_cash_cent,cost_cent,status,pay_status,address_json,entry_from,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        ono,
        userId,
        orderType,
        productId,
        prod.name,
        qty,
        payPoints,
        payCashCent,
        cost,
        initialStatus,
        needWxPay ? 'unpaid' : 'none',
        JSON.stringify(addrJson),
        entryVal,
        now(),
        now()
      )
    } else if (hasPay) {
      d.prepare(
        `INSERT INTO redeem_order (order_no,user_id,order_type,product_id,product_name,qty,pay_points,pay_cash_cent,cost_cent,status,pay_status,address_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        ono,
        userId,
        orderType,
        productId,
        prod.name,
        qty,
        payPoints,
        payCashCent,
        cost,
        initialStatus,
        needWxPay ? 'unpaid' : 'none',
        JSON.stringify(addrJson),
        now(),
        now()
      )
    } else if (hasEntry) {
      d.prepare(
        `INSERT INTO redeem_order (order_no,user_id,order_type,product_id,product_name,qty,pay_points,pay_cash_cent,cost_cent,status,address_json,entry_from,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        ono,
        userId,
        orderType,
        productId,
        prod.name,
        qty,
        payPoints,
        payCashCent,
        cost,
        initialStatus,
        JSON.stringify(addrJson),
        entryVal,
        now(),
        now()
      )
    } else {
      d.prepare(
        `INSERT INTO redeem_order (order_no,user_id,order_type,product_id,product_name,qty,pay_points,pay_cash_cent,cost_cent,status,address_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        ono,
        userId,
        orderType,
        productId,
        prod.name,
        qty,
        payPoints,
        payCashCent,
        cost,
        initialStatus,
        JSON.stringify(addrJson),
        now(),
        now()
      )
    }
    // 现金单：等微信支付回调成功后再记收入；纯积分单可即时记履约成本
    if (!needWxPay && cost > 0) {
      adminService.addFinance({
        entryType: 'cost',
        category: 'gift_cost',
        amountCent: cost,
        refType: 'order',
        refId: ono,
        note: `履约成本 ${prod.name}`,
      })
    }
  })
  try {
    tx()
  } catch (e) {
    return { ok: false, msg: (e && e.message) || '下单失败' }
  }

  if (body.clearCart && productId) {
    try {
      require('./cartService').clearCart(userId, [productId])
    } catch (_) {}
  }

  const order = getOrderByNo(userId, ono)
  return {
    ok: true,
    orderNo: ono,
    order,
    needWxPay,
    wallet: require('./currencyService').getWallet(userId),
  }
}

function statusText(status) {
  return (
    {
      unpaid: '待支付',
      pending: '待发货',
      shipped: '已发货',
      done: '已完成',
      cancelled: '已取消',
      refunded: '已退款',
    }[status] || status
  )
}

/** 东八区展示时间 YYYY-MM-DD HH:mm（库内多为 UTC ISO） */
function formatChinaDateTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16).replace('T', ' ')
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d)
    const g = (t) => (parts.find((p) => p.type === t) || {}).value || ''
    let hour = g('hour')
    if (hour === '24') hour = '00'
    return `${g('year')}-${g('month')}-${g('day')} ${hour}:${g('minute')}`
  } catch (_) {
    return String(iso).slice(0, 16).replace('T', ' ')
  }
}

function mapOrder(row) {
  if (!row) return null
  let address = {}
  try {
    address = JSON.parse(row.address_json || '{}')
  } catch (e) {}
  const items = parseOrderItems(row)
  const refundStatus = row.refund_status || 'none'
  let status = refundStatus === 'success' && row.status !== 'refunded' ? 'refunded' : row.status
  let payStatus = row.pay_status || (Number(row.pay_cash_cent) > 0 ? 'unpaid' : 'none')
  // 已支付但 status 仍停在 unpaid（回调崩溃遗留）→ 归一化
  if ((payStatus === 'paid' || row.wx_transaction_id) && status === 'unpaid') {
    payStatus = 'paid'
    status = row.order_type === 'festival' ? 'done' : 'pending'
  }
  if (row.wx_transaction_id && payStatus !== 'paid' && payStatus !== 'refunded') {
    payStatus = 'paid'
  }
  const canCancel =
    (status === 'unpaid' || status === 'pending') &&
    payStatus !== 'paid' &&
    status !== 'shipped' &&
    status !== 'done' &&
    status !== 'refunded' &&
    status !== 'cancelled'
  return {
    id: row.id,
    orderNo: row.order_no,
    orderType: row.order_type,
    productId: row.product_id,
    productName: row.product_name,
    qty: row.qty,
    items,
    payPoints: row.pay_points,
    payCashCent: row.pay_cash_cent,
    payCashYuan: adminService.centToYuan(row.pay_cash_cent),
    costCent: row.cost_cent,
    status,
    statusText: statusText(status),
    payStatus,
    refundStatus,
    refundCent: Number(row.refund_cent || 0),
    refundYuan: adminService.centToYuan(row.refund_cent || 0),
    wxRefundId: row.wx_refund_id || '',
    refundedAt: formatChinaDateTime(row.refunded_at || ''),
    wxTransactionId: row.wx_transaction_id || '',
    wxPrepayId: row.wx_prepay_id || '',
    paidAt: formatChinaDateTime(row.paid_at || ''),
    needWxPay:
      Number(row.pay_cash_cent || 0) > 0 &&
      payStatus !== 'paid' &&
      status !== 'cancelled' &&
      status !== 'refunded' &&
      status !== 'shipped' &&
      status !== 'done',
    canCancel,
    address,
    carrier: row.carrier || '',
    trackingNo: row.tracking_no || '',
    shippedAt: formatChinaDateTime(row.shipped_at || ''),
    entryFrom: row.entry_from || '',
    createdAt: formatChinaDateTime(row.created_at) || row.created_at,
    createdAtRaw: row.created_at,
    updatedAt: formatChinaDateTime(row.updated_at) || row.updated_at,
  }
}

function listOrders(userId, { status = '', statusIn = '', orderType = '', types = '', page = 1, pageSize = 20 } = {}) {
  ensureOrderExtras()
  const d = db()
  const where = ['user_id=?']
  const args = [userId]
  if (status === 'refunded') {
    // 兼容：status 已改 refunded，或仅 refund_status=success
    where.push(`(status='refunded' OR refund_status='success')`)
  } else if (status) {
    where.push('status=?')
    args.push(status)
    // 「全部」以外的非退款态排除已退款成功单，避免重复出现
    if (status !== 'cancelled') {
      where.push(`(refund_status IS NULL OR refund_status='' OR refund_status='none' OR refund_status='processing')`)
    }
  } else if (statusIn) {
    const sts = String(statusIn)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (sts.length) {
      where.push(`status IN (${sts.map(() => '?').join(',')})`)
      args.push(...sts)
    }
  }
  const typeList = String(types || orderType || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (typeList.length === 1) {
    where.push('order_type=?')
    args.push(typeList[0])
  } else if (typeList.length > 1) {
    where.push(`order_type IN (${typeList.map(() => '?').join(',')})`)
    args.push(...typeList)
  }
  const w = `WHERE ${where.join(' AND ')}`
  const total = d.prepare(`SELECT COUNT(*) AS n FROM redeem_order ${w}`).get(...args).n
  const offset = (Math.max(1, page) - 1) * pageSize
  const list = d
    .prepare(`SELECT * FROM redeem_order ${w} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, pageSize, offset)
    .map(mapOrder)
  return { total, page: Number(page), pageSize, list }
}

function getOrderByNo(userId, orderNo) {
  const row = db()
    .prepare(`SELECT * FROM redeem_order WHERE order_no=? AND user_id=?`)
    .get(orderNo, userId)
  return mapOrder(row)
}

function getOrderById(userId, id) {
  const row = db().prepare(`SELECT * FROM redeem_order WHERE id=? AND user_id=?`).get(id, userId)
  return mapOrder(row)
}

/** async 路由专用：禁止在 await 前后用 deasync 查单 */
async function getOrderAsync(userId, idOrNo) {
  const raw = String(idOrNo || '').trim()
  if (!raw) return null
  const asNum = Number(raw)
  if (Number.isFinite(asNum) && asNum > 0 && String(asNum) === raw) {
    const [rows] = await dbMod.queryAsync(`SELECT * FROM redeem_order WHERE id=? AND user_id=?`, [
      asNum,
      userId,
    ])
    if (rows && rows[0]) return mapOrder(rows[0])
  }
  const [byNo] = await dbMod.queryAsync(`SELECT * FROM redeem_order WHERE order_no=? AND user_id=?`, [
    raw,
    userId,
  ])
  return mapOrder(byNo && byNo[0])
}

function restoreOrderStock(row) {
  const d = db()
  const t = now()
  const lines = parseOrderItems(row)
  if (lines.length) {
    lines.forEach((line) => {
      if (!line.productId) return
      d.prepare(`UPDATE product SET stock=stock+?, updated_at=? WHERE id=?`).run(
        Math.max(1, Number(line.qty) || 1),
        t,
        line.productId
      )
    })
    return
  }
  if (row.product_id) {
    d.prepare(`UPDATE product SET stock=stock+?, updated_at=? WHERE id=?`).run(
      row.qty,
      t,
      row.product_id
    )
  }
}

function cancelOrder(userId, id) {
  ensureOrderExtras()
  const d = db()
  const row = d.prepare(`SELECT * FROM redeem_order WHERE id=? AND user_id=?`).get(id, userId)
  if (!row) return { ok: false, msg: '订单不存在' }
  if (['shipped', 'done', 'refunded', 'cancelled'].includes(row.status)) {
    return { ok: false, msg: '已发货/已完成订单不可取消' }
  }
  if (row.status !== 'pending' && row.status !== 'unpaid') {
    return { ok: false, msg: '仅待支付/待发货订单可取消' }
  }
  if (row.pay_status === 'paid' || row.wx_transaction_id) {
    return { ok: false, msg: '已支付订单请联系客服处理' }
  }
  let cancelled = false
  const tx = d.transaction(() => {
    const r = d
      .prepare(
        `UPDATE redeem_order SET status='cancelled', updated_at=?
         WHERE id=? AND status IN ('pending','unpaid')
           AND IFNULL(pay_status,'')!='paid' AND IFNULL(wx_transaction_id,'')=''`
      )
      .run(now(), id)
    if (!r.changes) return
    cancelled = true
    restoreOrderStock(row)
    require('./currencyService').restoreOrderEnergy(row, 'cancel_order')
  })
  tx()
  if (!cancelled) return { ok: false, msg: '订单状态已变化，请刷新后重试' }
  return { ok: true, order: getOrderById(userId, id), wallet: require('./currencyService').getWallet(userId) }
}

/** 用户确认收货 */
function confirmOrder(userId, id) {
  ensureOrderExtras()
  const d = db()
  const row = d.prepare(`SELECT * FROM redeem_order WHERE id=? AND user_id=?`).get(id, userId)
  if (!row) return { ok: false, msg: '订单不存在' }
  if (row.status !== 'shipped') return { ok: false, msg: '仅已发货订单可确认收货' }
  d.prepare(`UPDATE redeem_order SET status='done', updated_at=? WHERE id=?`).run(now(), id)
  return { ok: true, order: getOrderById(userId, id) }
}

const PREPAY_TTL_MS = (2 * 60 + 10) * 60 * 1000

/** 未支付超时关单（默认 30 分钟） */
function closeExpiredUnpaidOrders({ ttlMinutes } = {}) {
  ensureOrderExtras()
  try {
    require('./wxPayService').ensurePayColumns()
  } catch (_) {}
  const ttl = Math.max(5, Number(ttlMinutes || process.env.ORDER_UNPAID_TTL_MIN || 30))
  const d = db()
  const cutoff = new Date(Date.now() - ttl * 60 * 1000).toISOString()
  // 已调起收银台的单：微信 prepay_id 有效 2 小时，期满前用户仍可能付款，不能按 30 分钟关
  const prepayCutoff = new Date(Date.now() - PREPAY_TTL_MS).toISOString()
  const rows = d
    .prepare(
      `SELECT * FROM redeem_order
       WHERE status='unpaid' AND IFNULL(wx_transaction_id,'')=''
         AND (
           ((pay_status IS NULL OR pay_status IN ('unpaid','none','')) AND created_at < ?)
           OR (pay_status='prepay' AND updated_at < ?)
         )`
    )
    .all(cutoff, prepayCutoff)
  let closed = 0
  rows.forEach((row) => {
    try {
      const tx = d.transaction(() => {
        const r = d
          .prepare(
            `UPDATE redeem_order SET status='cancelled', updated_at=?
             WHERE id=? AND status='unpaid' AND IFNULL(pay_status,'')!='paid' AND IFNULL(wx_transaction_id,'')=''`
          )
          .run(now(), row.id)
        if (!r.changes) return
        const cur = d.prepare(`SELECT * FROM redeem_order WHERE id=?`).get(row.id)
        restoreOrderStock(cur)
        require('./currencyService').restoreOrderEnergy(cur, 'unpaid_timeout')
        closed += 1
      })
      tx()
    } catch (e) {
      console.warn('[orders] close unpaid', row.order_no, e && e.message)
    }
  })
  return { ok: true, closed, ttlMinutes: ttl }
}

async function syncOrderPayIfNeeded(userId, order) {
  if (!order || !order.needWxPay || order.payStatus === 'paid') return order
  // 没拿到 prepay_id 说明收银台没建起来，微信必然 404「订单不存在」
  if (!order.wxPrepayId && order.payStatus !== 'prepay') return order
  try {
    const wxPay = require('./wxPayService')
    if (!wxPay.isConfigured()) return order
    const q = await wxPay.queryByOutTradeNo(order.orderNo)
    if (q && q.trade_state === 'SUCCESS') {
      // await 查单之后禁止 deasync：异步记账，用返回行 map（勿再 prepare 同步读）
      const paid = await wxPay.markOrderPaidAsync(order.orderNo, q.transaction_id || '')
      if (paid && paid.order) return mapOrder(paid.order)
      return order
    }
  } catch (e) {
    const missing = e && (e.status === 404 || /订单不存在/.test(e.message || ''))
    console.warn(
      '[orders] sync pay',
      order.orderNo,
      missing ? '微信无此单号（预下单未成功，或商户号与下单时不一致）' : e && e.message
    )
  }
  return order
}

/** 汉服节：把「微信已付但库仍 unpaid」的最近订单补记并返回已处理单号 */
async function syncUnpaidFestivalOrders(userId, { limit = 8 } = {}) {
  ensureOrderExtras()
  const [rows] = await dbMod.queryAsync(
    `SELECT * FROM redeem_order
     WHERE user_id=?
       AND (order_type='festival' OR product_id LIKE 'fest_%')
       AND (pay_status IS NULL OR pay_status IN ('unpaid','prepay','none',''))
       AND IFNULL(status,'') NOT IN ('cancelled','refunded')
     ORDER BY id DESC
     LIMIT ?`,
    [userId, Math.max(1, Math.min(20, Number(limit) || 8))]
  )
  const synced = []
  for (const row of rows || []) {
    try {
      const before = mapOrder(row)
      if (!before || !before.needWxPay) continue
      const after = await syncOrderPayIfNeeded(userId, before)
      if (after && after.payStatus === 'paid') synced.push(after.orderNo)
    } catch (e) {
      console.warn('[orders] festival sync', row && row.order_no, e && e.message)
    }
  }
  return { ok: true, synced }
}

module.exports = {
  seedGiftProducts,
  purgeDemoGiftsWithoutImage,
  listGiftsAdmin,
  listGifts,
  listAddresses,
  getAddress,
  saveAddress,
  deleteAddress,
  setDefaultAddress,
  placeOrder,
  placeMallMulti,
  listOrders,
  confirmOrder,
  getOrderByNo,
  getOrderById,
  getOrderAsync,
  cancelOrder,
  closeExpiredUnpaidOrders,
  syncOrderPayIfNeeded,
  syncUnpaidFestivalOrders,
  mapOrder,
  statusText,
  ensureOrderExtras,
}

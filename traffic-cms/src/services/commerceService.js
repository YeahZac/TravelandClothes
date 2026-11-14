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
 * 禁止自动灌演示兑礼。
 * 仅：纠偏 gift 分类；清理无真实主图的演示 g1–g5（有上传图视为运营货，保留）。
 */
function seedGiftProducts() {
  const d = db()
  const t = now()
  try {
    d.prepare(
      `UPDATE product SET category='兑礼', updated_at=? WHERE kind='gift' AND category!='兑礼'`
    ).run(t)
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
  return db()
    .prepare(`SELECT * FROM product WHERE category='兑礼' AND status='on' ORDER BY sort_order, id`)
    .all()
    .map(mapGiftRow)
}

function listGiftsAdmin() {
  seedGiftProducts()
  return db()
    .prepare(`SELECT * FROM product WHERE category='兑礼' ORDER BY sort_order, id`)
    .all()
    .map(mapGiftRow)
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

/**
 * 统一下单：mall / gift / jar / lottery_claim
 */
function placeOrder(userId, body = {}) {
  seedGiftProducts()
  const d = db()
  const orderType = body.orderType || 'mall'
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

  let meta = {}
  try {
    meta = JSON.parse(prod.meta_json || '{}')
  } catch (e) {}

  const wallet = d.prepare('SELECT * FROM user_wallet WHERE user_id=?').get(userId)
  if (!wallet) return { ok: false, msg: '钱包不存在' }

  let payPoints = Number(body.payPoints || 0)
  let payCashCent = Number(body.payCashCent || 0)
  let claimRow = null

  const currency = require('./currencyService')
  currency.ensureMerged(userId)
  const mix = require('./pricingService').resolvePayMix(prod)

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
    payPoints = mix.payEnergy * qty
    payCashCent = mix.payCashCent * qty
  } else if (orderType === 'gift' || orderType === 'jar') {
    payPoints = mix.payEnergy
    payCashCent = mix.payCashCent
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
             JOIN product p ON p.id=r.product_id
             WHERE substr(r.created_at,1,10)=? AND r.status!='cancelled'
               AND p.meta_json LIKE '%"firstWave":true%'`
          )
          .get(today).n
        if (n >= (snap.bigPrizeDailyCap || 30)) {
          return { ok: false, msg: '首兑专池今日已发完，明天再来' }
        }
      } catch (e) {}
    }
  }

  const energyBal = currency.walletEnergy(userId)
  if (payPoints > energyBal) return { ok: false, msg: `能量值不足（需 ${payPoints}，当前 ${energyBal}）` }

  const addrJson = {
    name: address.name,
    phone: address.phone,
    province: address.province || '',
    city: address.city || '',
    district: address.district || '',
    detail: address.detail,
    full: address.full || `${address.province || ''}${address.city || ''}${address.district || ''}${address.detail}`,
  }

  const entryFrom = String(body.entryFrom || body.from || body.channel || '')
    .trim()
    .slice(0, 64)
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
    if (payPoints > 0) {
      const spent = require('./currencyService').spendEnergy(userId, payPoints, { note: `order:${orderType}` })
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
    d.prepare(`UPDATE product SET stock=stock-?, updated_at=? WHERE id=?`).run(qty, now(), productId)

    if (claimRow && claimRow.id) {
      require('./lotteryService').markClaimUsed(claimRow.id, ono)
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
  tx()

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
    }[status] || status
  )
}

function mapOrder(row) {
  if (!row) return null
  let address = {}
  try {
    address = JSON.parse(row.address_json || '{}')
  } catch (e) {}
  return {
    id: row.id,
    orderNo: row.order_no,
    orderType: row.order_type,
    productId: row.product_id,
    productName: row.product_name,
    qty: row.qty,
    payPoints: row.pay_points,
    payCashCent: row.pay_cash_cent,
    payCashYuan: adminService.centToYuan(row.pay_cash_cent),
    costCent: row.cost_cent,
    status: row.status,
    statusText: statusText(row.status),
    payStatus: row.pay_status || (row.pay_cash_cent > 0 ? 'unpaid' : 'none'),
    wxTransactionId: row.wx_transaction_id || '',
    paidAt: row.paid_at || '',
    needWxPay: Number(row.pay_cash_cent || 0) > 0 && row.pay_status !== 'paid' && row.status !== 'cancelled',
    address,
    carrier: row.carrier || '',
    trackingNo: row.tracking_no || '',
    shippedAt: row.shipped_at || '',
    entryFrom: row.entry_from || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function listOrders(userId, { status = '', page = 1, pageSize = 20 } = {}) {
  const d = db()
  const where = ['user_id=?']
  const args = [userId]
  if (status) {
    where.push('status=?')
    args.push(status)
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

function cancelOrder(userId, id) {
  const d = db()
  const row = d.prepare(`SELECT * FROM redeem_order WHERE id=? AND user_id=?`).get(id, userId)
  if (!row) return { ok: false, msg: '订单不存在' }
  if (row.status !== 'pending' && row.status !== 'unpaid') {
    return { ok: false, msg: '仅待支付/待发货订单可取消' }
  }
  if (row.pay_status === 'paid') return { ok: false, msg: '已支付订单请联系客服处理' }
  const tx = d.transaction(() => {
    d.prepare(`UPDATE redeem_order SET status='cancelled', updated_at=? WHERE id=?`).run(now(), id)
    if (row.product_id) {
      d.prepare(`UPDATE product SET stock=stock+?, updated_at=? WHERE id=?`).run(
        row.qty,
        now(),
        row.product_id
      )
    }
    if (row.pay_points > 0) {
      require('./currencyService').grantEnergy(userId, row.pay_points, { note: 'cancel_order' })
    }
  })
  tx()
  return { ok: true, order: getOrderById(userId, id) }
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
  listOrders,
  getOrderByNo,
  getOrderById,
  cancelOrder,
  statusText,
}

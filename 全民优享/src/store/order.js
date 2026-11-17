import { reactive } from 'vue'
import { USE_REMOTE, invalidateRequestCache } from '../api/request.js'
import * as api from '../api/commerce.js'
import { session } from './session.js'
import { removePurchased } from './cart.js'

const LOCAL_KEY = 'qmyx_orders'

function readLocal() {
  try {
    return JSON.parse(uni.getStorageSync(LOCAL_KEY) || '[]')
  } catch (e) {
    return []
  }
}

function writeLocal(list) {
  try {
    uni.setStorageSync(LOCAL_KEY, JSON.stringify(list))
  } catch (e) {}
}

export const orderState = reactive({
  list: readLocal(),
  loaded: false,
  error: '',
})

export const STATUS_MAP = {
  unpaid: '待支付',
  pending: '待发货',
  shipped: '已发货',
  done: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
}

export function clearLocalOrdersOnly() {
  writeLocal([])
  orderState.list = []
  orderState.loaded = false
}

/**
 * 调起微信小程序支付；成功仅表示收银台关闭，以服务端订单状态为准。
 * @returns {Promise<{ok:boolean, msg?:string, cancelled?:boolean}>}
 */
export function invokeWxPay(payParams) {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    uni.requestPayment({
      provider: 'wxpay',
      timeStamp: String(payParams.timeStamp),
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType || 'RSA',
      paySign: payParams.paySign,
      success() {
        resolve({ ok: true })
      },
      fail(err) {
        const msg = (err && (err.errMsg || err.message)) || '支付未完成'
        const cancelled = /cancel|取消/i.test(msg)
        resolve({ ok: false, cancelled, msg: cancelled ? '已取消支付' : msg })
      },
    })
    // #endif
    // #ifndef MP-WEIXIN
    resolve({ ok: false, msg: '请在小程序内支付' })
    // #endif
  })
}

function orderLooksPaid(order) {
  return !!(
    order &&
    (order.payStatus === 'paid' ||
      order.status === 'pending' ||
      order.status === 'shipped' ||
      order.status === 'done')
  )
}

function withTimeout(promise, ms, label = 'timeout') {
  let timer
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms)
    }),
  ])
}

/** 收银台已成功后的静默补记（不阻塞 UI） */
function settlePayInBackground(orderNo) {
  const run = async () => {
    try {
      await withTimeout(api.confirmWxPay(orderNo), 4000)
    } catch (_) {}
    try {
      await withTimeout(loadOrderDetail(orderNo), 4000)
    } catch (_) {}
  }
  setTimeout(run, 800)
  setTimeout(run, 3500)
}

/**
 * 对已创建订单发起预支付并调起收银台。
 * 微信 requestPayment success 后即视为用户侧支付成功：
 * confirm 404/502/超时时不再死等（避免按钮一直转圈）。
 */
/** 未完成支付时自动关单，释放已扣能量值 */
async function releaseUnpaidAfterPayFail(orderNo) {
  try {
    const order = await withTimeout(loadOrderDetail(orderNo), 2500).catch(() => null)
    if (!order) return
    if (order.status !== 'unpaid' && order.payStatus !== 'unpaid' && order.payStatus !== 'prepay') {
      return
    }
    if (order.payStatus === 'paid' || orderLooksPaid(order)) return
    const id = order.id || order.orderNo || orderNo
    const r = await cancelMyOrder(id)
    if (r && r.ok && r.wallet) {
      session.user.energy = Number(r.wallet.energy) || session.user.energy
      session.user.points = Number(r.wallet.points != null ? r.wallet.points : r.wallet.energy) || session.user.points
    } else if (r && r.ok) {
      invalidateRequestCache('/api/traffic/v1/me')
    }
  } catch (e) {
    console.warn('[pay] release unpaid', e && e.message)
  }
}

export async function payOrder(orderNo) {
  if (!USE_REMOTE) return { ok: false, msg: '离线模式无法支付' }
  try {
    const payParams = await api.prepayWx(orderNo)
    const paid = await invokeWxPay(payParams)
    if (!paid.ok) {
      // 取消/失败：立即关待支付单并退回能量，避免能量被占住
      await releaseUnpaidAfterPayFail(orderNo)
      return paid
    }

    // 快速确认一轮（短超时）；失败则立刻放行 UI
    try {
      const conf = await withTimeout(api.confirmWxPay(orderNo), 2800)
      if (conf && conf.paid) {
        const order = await withTimeout(loadOrderDetail(orderNo), 2000).catch(() => null)
        return { ok: true, order: order || undefined }
      }
    } catch (e) {
      console.warn('[pay] confirm', e && e.message)
    }

    try {
      const order = await withTimeout(loadOrderDetail(orderNo), 2500)
      if (orderLooksPaid(order)) return { ok: true, order }
    } catch (e) {
      console.warn('[pay] detail after pay', e && e.message)
    }

    settlePayInBackground(orderNo)
    return {
      ok: true,
      pendingConfirm: true,
      orderNo,
      msg: '支付成功，出票确认中',
    }
  } catch (e) {
    await releaseUnpaidAfterPayFail(orderNo)
    return { ok: false, msg: e.message || '支付失败' }
  }
}

export async function loadOrders(status = '') {
  if (USE_REMOTE) {
    try {
      const params = { page: 1, pageSize: 50 }
      if (status === 'refunded') {
        // 兼容：status=refunded 或 refund_status=success 映射后的列表
        params.status = 'refunded'
      } else if (status) {
        params.status = status
      }
      const data = await api.fetchOrders(params)
      orderState.list = Array.isArray(data && data.list) ? data.list : []
      writeLocal(orderState.list)
      orderState.loaded = true
      orderState.error = ''
      return orderState.list
    } catch (e) {
      console.warn('[orders]', e)
      orderState.error = (e && e.message) || '订单加载失败'
      // 失败时保留已有列表，避免闪成空态
      orderState.loaded = true
      throw e
    }
  }
  orderState.list = readLocal()
  orderState.loaded = true
  return orderState.list
}

export async function loadOrderDetail(id, opts = {}) {
  const local =
    orderState.list.find((o) => String(o.id) === String(id) || o.orderNo === id) || null
  if (USE_REMOTE) {
    try {
      const remote = await api.fetchOrder(id)
      if (remote) {
        // 刷新列表缓存中的同单
        const idx = orderState.list.findIndex(
          (o) => String(o.id) === String(remote.id) || o.orderNo === remote.orderNo
        )
        if (idx >= 0) {
          orderState.list[idx] = remote
          writeLocal(orderState.list)
        }
        return opts.withError ? { order: remote } : remote
      }
    } catch (e) {
      console.warn('[order detail]', e)
      if (local) return opts.withError ? { order: local, error: e.message } : local
      return opts.withError ? { order: null, error: (e && e.message) || '加载失败' } : null
    }
  }
  if (opts.withError) return { order: local, error: local ? '' : '订单不存在' }
  return local
}

/**
 * @param {{
 *  orderType: 'mall'|'gift'|'jar'|'lottery',
 *  productId: string,
 *  qty?: number,
 *  addressId?: number,
 *  address?: object,
 *  clearCartAfter?: boolean,
 * }} payload
 */
export async function placeOrder(payload) {
  const isFestival = payload.orderType === 'festival' || !!payload.ticketId
  if (
    !isFestival &&
    !payload.addressId &&
    !(payload.address && payload.address.detail)
  ) {
    return { ok: false, msg: '请选择收货地址' }
  }

  if (USE_REMOTE) {
    try {
      const body = {
        orderType: payload.orderType || 'mall',
        productId: payload.productId,
        ticketId: payload.ticketId || (payload.orderType === 'festival' ? payload.productId : undefined),
        ticketIds: Array.isArray(payload.ticketIds) ? payload.ticketIds : undefined,
        qty: payload.qty || 1,
        addressId: payload.addressId,
        address: payload.address,
        visitor: payload.visitor,
        phone: payload.phone,
        payPoints: payload.payPoints,
        payCashCent: payload.payCashCent,
        claimToken: payload.claimToken,
        entryFrom: payload.entryFrom || payload.from || payload.channel,
        clearCart: !!payload.clearCartAfter,
      }
      if (Array.isArray(payload.items) && payload.items.length) {
        body.items = payload.items
        delete body.productId
        delete body.qty
      }
      const data = await api.createOrder(body)
      if (data.wallet) {
        session.user.points = data.wallet.points
        session.user.energy = data.wallet.energy
        session.user.coins = data.wallet.coins
      }
      if (payload.clearCartAfter) {
        if (Array.isArray(payload.items) && payload.items.length) {
          removePurchased(payload.items.map((x) => x.productId || x.id))
        } else {
          removePurchased(payload.productId)
        }
      }
      // 刷新列表失败不影响已成功下单/兑换（曾因 URLSearchParams 把成功单打成「兑换失败」）
      try {
        await loadOrders()
      } catch (e) {
        console.warn('[orders] refresh after place', e)
      }
      const needWxPay = !!(data.needWxPay || (data.order && data.order.needWxPay))
      const orderNo = data.orderNo || (data.order && (data.order.orderNo || data.order.id))
      invalidateRequestCache('/api/traffic/v1/me')
      invalidateRequestCache('/api/traffic/v1/gifts')
      invalidateRequestCache('/api/traffic/v1/catalog')
      invalidateRequestCache('/api/traffic/v1/festival/')
      return {
        ok: true,
        orderNo,
        order: data.order,
        needWxPay,
      }
    } catch (e) {
      return { ok: false, msg: e.message || '下单失败' }
    }
  }

  // 离线 mock
  const order = {
    id: Date.now(),
    orderNo: `L${Date.now()}`,
    orderType: payload.orderType || 'mall',
    productId: payload.productId,
    productName: payload.productName || payload.productId,
    qty: payload.qty || 1,
    payPoints: payload.payPoints || 0,
    payCashCent: payload.payCashCent || 0,
    payCashYuan: (payload.payCashCent || 0) / 100,
    status: 'pending',
    statusText: '待发货',
    address: payload.address || {},
    createdAt: new Date().toISOString(),
  }
  if (order.payPoints) session.user.points = Math.max(0, session.user.points - order.payPoints)
  const list = [order, ...readLocal()]
  writeLocal(list)
  orderState.list = list
  if (payload.clearCartAfter) removePurchased(payload.productId)
  return { ok: true, orderNo: order.orderNo, order }
}

export async function cancelMyOrder(id) {
  if (USE_REMOTE) {
    try {
      const data = await api.cancelOrder(id)
      if (data && data.wallet) {
        session.user.energy = Number(data.wallet.energy) || 0
        session.user.points =
          Number(data.wallet.points != null ? data.wallet.points : data.wallet.energy) || 0
      } else {
        invalidateRequestCache('/api/traffic/v1/me')
      }
      await loadOrders()
      return {
        ok: true,
        wallet: data && data.wallet,
        energyRestored: Number((data && data.energyRestored) || 0),
        msg: (data && data.msg) || '',
      }
    } catch (e) {
      return { ok: false, msg: e.message }
    }
  }
  const list = readLocal().map((o) =>
    o.id === id ? { ...o, status: 'cancelled', statusText: '已取消' } : o
  )
  writeLocal(list)
  orderState.list = list
  return { ok: true }
}

/** 跳转确认页 */
export function goConfirm(query) {
  const q = Object.keys(query)
    .filter((k) => query[k] != null && query[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join('&')
  uni.navigateTo({ url: `/pages/order/confirm?${q}` })
}

import { request, USE_REMOTE } from './request.js'
import { buildQuery } from '../utils/queryString.js'

export function fetchGifts() {
  if (!USE_REMOTE) return Promise.resolve({ list: [] })
  return request('/api/traffic/v1/gifts')
}

/** 按 productId 精确解析兑礼/商城物料，禁止用列表第一件顶替 */
export function fetchOffer(id) {
  if (!USE_REMOTE || !id) return Promise.resolve({ offer: null })
  return request(`/api/traffic/v1/offers/${encodeURIComponent(id)}`)
}

export function fetchAddresses() {
  return request('/api/traffic/v1/me/addresses')
}

export function saveAddress(body) {
  // 用 POST：云托管 callContainer 对 PUT body 不稳定
  return request('/api/traffic/v1/me/addresses', { method: 'POST', data: body })
}

export function deleteAddress(id) {
  return request(`/api/traffic/v1/me/addresses/${id}`, { method: 'DELETE' })
}

export function setDefaultAddress(id) {
  return request(`/api/traffic/v1/me/addresses/${id}/default`, { method: 'POST', data: {} })
}

export function createOrder(body) {
  return request('/api/traffic/v1/orders/create', { method: 'POST', data: body })
}

export function fetchCart() {
  return request('/api/traffic/v1/me/cart')
}

export function upsertCartItem(productId, qty) {
  // POST：云托管 callContainer 对 PUT body 不稳定
  return request('/api/traffic/v1/me/cart', {
    method: 'POST',
    data: { productId, qty },
  })
}

export function removeCartItem(productId) {
  return request(`/api/traffic/v1/me/cart/${encodeURIComponent(productId)}/remove`, {
    method: 'POST',
    data: {},
  })
}

export function clearRemoteCart() {
  return request('/api/traffic/v1/me/cart/clear', { method: 'POST', data: {} })
}

export function mergeCart(items) {
  return request('/api/traffic/v1/me/cart/merge', {
    method: 'POST',
    data: { items },
  })
}

export function fetchOrders(params = {}) {
  // 勿用 URLSearchParams：部分 iOS 小程序 JSCore 无此全局，会 ReferenceError
  const qs = buildQuery({
    status: params.status,
    statusIn: params.statusIn,
    types: params.types,
    orderType: params.orderType,
    page: params.page != null ? String(params.page) : undefined,
    pageSize: params.pageSize != null ? String(params.pageSize) : undefined,
  })
  return request(`/api/traffic/v1/me/orders${qs ? `?${qs}` : ''}`)
}

export function fetchOrder(id) {
  return request(`/api/traffic/v1/me/orders/${id}`)
}

export function cancelOrder(id) {
  return request(`/api/traffic/v1/me/orders/${id}/cancel`, { method: 'POST', data: {} })
}

/** 确认收货 → 已完成 */
export function confirmOrder(id) {
  return request(`/api/traffic/v1/me/orders/${id}/confirm`, { method: 'POST', data: {} })
}

/** 微信支付预下单 → 返回 wx.requestPayment 参数 */
export function prepayWx(orderNo) {
  return request('/api/traffic/v1/pay/wx/prepay', {
    method: 'POST',
    data: { orderNo },
  })
}

/** 收银台成功后主动查单入账（不依赖支付回调；多路径兼容云托管旧镜像 404） */
export async function confirmWxPay(orderNo) {
  const body = { orderNo }
  const paths = [
    '/api/traffic/v1/pay/wx/confirm',
    '/api/traffic/v1/pay/confirm',
    '/api/traffic/v1/me/orders/sync-pay',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await request(path, { method: 'POST', data: body })
    } catch (e) {
      lastErr = e
      const msg = String((e && e.message) || '')
      // 仅对网关/镜像缺失类错误换路径；业务 400 直接抛
      if (!/HTTP 404|HTTP 502|HTTP 503|timeout|request:fail/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('confirm failed')
}

export function fetchWxPayStatus() {
  return request('/api/traffic/v1/pay/wx/status')
}

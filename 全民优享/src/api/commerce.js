import { request, USE_REMOTE } from './request.js'

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
  const q = new URLSearchParams()
  if (params.status) q.set('status', params.status)
  if (params.statusIn) q.set('statusIn', params.statusIn)
  if (params.types) q.set('types', params.types)
  if (params.orderType) q.set('orderType', params.orderType)
  if (params.page) q.set('page', String(params.page))
  if (params.pageSize) q.set('pageSize', String(params.pageSize))
  return request(`/api/traffic/v1/me/orders?${q.toString()}`)
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

export function fetchWxPayStatus() {
  return request('/api/traffic/v1/pay/wx/status')
}

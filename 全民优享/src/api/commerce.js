import { request, USE_REMOTE } from './request.js'

export function fetchGifts() {
  if (!USE_REMOTE) return Promise.resolve({ list: [] })
  return request('/api/traffic/v1/gifts')
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

export function fetchOrders(params = {}) {
  const q = new URLSearchParams()
  if (params.status) q.set('status', params.status)
  if (params.page) q.set('page', String(params.page))
  return request(`/api/traffic/v1/me/orders?${q.toString()}`)
}

export function fetchOrder(id) {
  return request(`/api/traffic/v1/me/orders/${id}`)
}

export function cancelOrder(id) {
  return request(`/api/traffic/v1/me/orders/${id}/cancel`, { method: 'POST', data: {} })
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

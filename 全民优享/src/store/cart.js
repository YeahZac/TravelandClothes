import { reactive, computed } from 'vue'
import { USE_REMOTE, getToken } from '../api/request.js'
import * as api from '../api/commerce.js'
import { isLoggedIn } from '../api/auth.js'

const KEY = 'qmyx_cart'

function read() {
  try {
    return JSON.parse(uni.getStorageSync(KEY) || '[]')
  } catch (e) {
    return []
  }
}

function write(items) {
  try {
    uni.setStorageSync(KEY, JSON.stringify(items))
  } catch (e) {}
}

export const cart = reactive({
  items: read(),
  syncing: false,
})

export const cartCount = computed(() => cart.items.reduce((s, i) => s + Number(i.qty || 0), 0))

function applyItems(items) {
  cart.items = Array.isArray(items) ? items : []
  write(cart.items)
}

export function addToCart(product, qty = 1) {
  if (!product || !product.id) return
  const items = [...cart.items]
  const hit = items.find((i) => String(i.id) === String(product.id))
  if (hit) hit.qty += qty
  else {
    items.push({
      id: product.id,
      name: product.name,
      price: Number(product.price || product.payCashYuan || 0),
      payCashCent: product.payCashCent != null ? Number(product.payCashCent) : undefined,
      payPoints: product.payPoints != null ? Number(product.payPoints) : 0,
      imageUrl: product.imageUrl || '',
      qty,
    })
  }
  applyItems(items)
  if (USE_REMOTE && getToken() && isLoggedIn()) {
    const line = items.find((i) => String(i.id) === String(product.id))
    api.upsertCartItem(product.id, line ? line.qty : qty).catch(() => {})
  }
  return cart.items
}

export function setQty(id, qty) {
  const items = cart.items
    .map((i) => (String(i.id) === String(id) ? { ...i, qty: Math.max(0, qty) } : i))
    .filter((i) => i.qty > 0)
  applyItems(items)
  if (USE_REMOTE && getToken() && isLoggedIn()) {
    api.upsertCartItem(id, Math.max(0, qty)).catch(() => {})
  }
}

export function removeFromCart(id) {
  applyItems(cart.items.filter((i) => String(i.id) !== String(id)))
  if (USE_REMOTE && getToken() && isLoggedIn()) {
    api.removeCartItem(id).catch(() => {})
  }
}

export function clearCart() {
  applyItems([])
  if (USE_REMOTE && getToken() && isLoggedIn()) {
    api.clearRemoteCart().catch(() => {})
  }
}

/** 结算后只移除已下单 SKU */
export function removePurchased(id) {
  if (id == null || id === '') return clearCart()
  if (Array.isArray(id)) {
    applyItems(cart.items.filter((i) => !id.map(String).includes(String(i.id))))
    if (USE_REMOTE && getToken() && isLoggedIn()) {
      id.forEach((pid) => api.removeCartItem(pid).catch(() => {}))
    }
    return
  }
  removeFromCart(id)
}

/** 单行实付（元）：优先 payCashCent，与列表展示一致，勿用标价 price */
export function linePayYuan(it) {
  if (!it) return 0
  const qty = Math.max(0, Number(it.qty) || 0)
  if (it.payCashCent != null && it.payCashCent !== '') {
    return (Number(it.payCashCent) * qty) / 100
  }
  return Number(it.price || 0) * qty
}

/** 购物车合计（元）= 各行实付之和 */
export function cartTotal() {
  return cart.items.reduce((s, i) => s + linePayYuan(i), 0)
}

/** 登录后：合并本地 → 拉服务端 */
export async function syncCartFromServer() {
  if (!USE_REMOTE || !(getToken() && isLoggedIn())) return cart.items
  if (cart.syncing) return cart.items
  cart.syncing = true
  try {
    const local = read()
    if (local.length) {
      await api.mergeCart(local)
    }
    const data = await api.fetchCart()
    applyItems(
      (data.items || []).map((it) => {
        const payCashCent =
          it.payCashCent != null && it.payCashCent !== '' ? Number(it.payCashCent) : undefined
        // 展示/合计统一用实付；price 仅作兜底，避免标价把合计撑大
        const priceYuan =
          payCashCent != null ? payCashCent / 100 : Number(it.price || it.payCashYuan || 0)
        return {
          id: it.productId || it.id,
          name: it.name,
          price: priceYuan,
          payCashCent,
          payPoints: it.payPoints,
          imageUrl: it.imageUrl || '',
          qty: it.qty,
        }
      })
    )
  } catch (e) {
    console.warn('[cart sync]', e)
  } finally {
    cart.syncing = false
  }
  return cart.items
}

export function clearLocalCartOnly() {
  applyItems([])
}

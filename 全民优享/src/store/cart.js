import { reactive, computed } from 'vue'

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
})

export const cartCount = computed(() => cart.items.reduce((s, i) => s + i.qty, 0))

export function addToCart(product, qty = 1) {
  if (!product || !product.id) return
  const items = [...cart.items]
  const hit = items.find((i) => i.id === product.id)
  if (hit) hit.qty += qty
  else {
    items.push({
      id: product.id,
      name: product.name,
      price: Number(product.price || 0),
      pointsOff: Number(product.pointsOff || 0),
      imageUrl: product.imageUrl || '',
      qty,
    })
  }
  cart.items = items
  write(items)
  return cart.items
}

export function setQty(id, qty) {
  const items = cart.items
    .map((i) => (i.id === id ? { ...i, qty: Math.max(0, qty) } : i))
    .filter((i) => i.qty > 0)
  cart.items = items
  write(items)
}

export function removeFromCart(id) {
  cart.items = cart.items.filter((i) => i.id !== id)
  write(cart.items)
}

export function clearCart() {
  cart.items = []
  write([])
}

export function cartTotal() {
  return cart.items.reduce((s, i) => s + (i.price - (i.pointsOff || 0)) * i.qty, 0)
}

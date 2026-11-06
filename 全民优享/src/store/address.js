import { reactive } from 'vue'
import { USE_REMOTE } from '../api/request.js'
import * as api from '../api/commerce.js'

const LOCAL_KEY = 'qmyx_addresses'

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

export const addressState = reactive({
  list: readLocal(),
  loaded: false,
})

export async function loadAddresses() {
  if (USE_REMOTE) {
    try {
      const data = await api.fetchAddresses()
      addressState.list = data.list || []
      writeLocal(addressState.list)
      addressState.loaded = true
      return addressState.list
    } catch (e) {
      console.warn('[address] remote fail', e)
    }
  }
  addressState.list = readLocal()
  addressState.loaded = true
  return addressState.list
}

export function defaultAddress() {
  return addressState.list.find((a) => a.isDefault) || addressState.list[0] || null
}

export async function upsertAddress(payload) {
  if (USE_REMOTE) {
    const saved = await api.saveAddress(payload)
    await loadAddresses()
    return saved
  }
  const list = readLocal()
  if (payload.id) {
    const i = list.findIndex((a) => a.id === payload.id)
    if (i >= 0) list[i] = { ...list[i], ...payload, full: fullText(payload) }
  } else {
    const id = Date.now()
    const item = {
      id,
      ...payload,
      isDefault: payload.isDefault || !list.length,
      full: fullText(payload),
    }
    if (item.isDefault) list.forEach((a) => (a.isDefault = false))
    list.unshift(item)
  }
  writeLocal(list)
  addressState.list = list
  return list[0]
}

function fullText(a) {
  return `${a.province || ''}${a.city || ''}${a.district || ''}${a.detail || ''}`
}

export async function removeAddress(id) {
  if (USE_REMOTE) {
    await api.deleteAddress(id)
    return loadAddresses()
  }
  const list = readLocal().filter((a) => a.id !== id)
  writeLocal(list)
  addressState.list = list
}

export async function makeDefault(id) {
  if (USE_REMOTE) {
    await api.setDefaultAddress(id)
    return loadAddresses()
  }
  const list = readLocal().map((a) => ({ ...a, isDefault: a.id === id }))
  writeLocal(list)
  addressState.list = list
}

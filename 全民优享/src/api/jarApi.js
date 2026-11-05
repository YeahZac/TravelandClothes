import { request, actionId, USE_REMOTE } from './request.js'

export async function fetchJarState() {
  if (!USE_REMOTE) return null
  return request('/api/traffic/v1/jar/state')
}

export async function apiHarvest() {
  return request('/api/traffic/v1/jar/harvest', {
    method: 'POST',
    data: { actionId: actionId('harvest') },
  })
}

export async function apiWater() {
  return request('/api/traffic/v1/jar/water', {
    method: 'POST',
    data: { actionId: actionId('water') },
  })
}

export async function apiClearEvent() {
  return request('/api/traffic/v1/jar/clear-event', {
    method: 'POST',
    data: { actionId: actionId('clear') },
  })
}

export async function apiRedeem() {
  return request('/api/traffic/v1/jar/redeem', {
    method: 'POST',
    data: { actionId: actionId('redeem') },
  })
}

export async function fetchJarFeed() {
  if (!USE_REMOTE) return null
  return request('/api/traffic/v1/jar/feed')
}

export async function markJarFeedRead() {
  return request('/api/traffic/v1/jar/feed/read', { method: 'POST', data: {} })
}

export async function reportSubscribeGrants(grants) {
  return request('/api/traffic/v1/subscribe/grant', {
    method: 'POST',
    data: { grants },
  })
}

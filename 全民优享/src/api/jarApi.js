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

export async function apiFertilize() {
  return request('/api/traffic/v1/jar/fertilize', {
    method: 'POST',
    data: { actionId: actionId('fertilize') },
  })
}

export async function apiLight() {
  return request('/api/traffic/v1/jar/light', {
    method: 'POST',
    data: { actionId: actionId('light') },
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

export async function apiClaimDrop() {
  return request('/api/traffic/v1/jar/claim-drop', {
    method: 'POST',
    data: { actionId: actionId('claim_drop') },
  })
}

export async function apiPlantSeed(seedId) {
  return request('/api/traffic/v1/jar/plant', {
    method: 'POST',
    data: { seedId, actionId: actionId('plant') },
  })
}

export async function apiHarvestFruit() {
  return request('/api/traffic/v1/jar/harvest-fruit', {
    method: 'POST',
    data: { actionId: actionId('harvest_fruit') },
  })
}

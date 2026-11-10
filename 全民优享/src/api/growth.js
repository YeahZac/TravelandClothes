import { request, actionId, USE_REMOTE } from './request.js'

export async function apiCheckin() {
  return request('/api/traffic/v1/checkin', { method: 'POST', data: {} })
}

export async function fetchCheckinStatus() {
  if (!USE_REMOTE) return null
  return request('/api/traffic/v1/checkin/status')
}

export async function fetchFriends() {
  if (!USE_REMOTE) return null
  return request('/api/traffic/v1/friends')
}

export async function apiSteal(friendId) {
  return request('/api/traffic/v1/friends/steal', {
    method: 'POST',
    data: { friendId, actionId: actionId('steal') },
  })
}

export async function apiHelp(friendId) {
  return request('/api/traffic/v1/friends/help', {
    method: 'POST',
    data: { friendId, actionId: actionId('help') },
  })
}

export async function apiStealNutrition(friendId) {
  return request('/api/traffic/v1/friends/steal-nutrition', {
    method: 'POST',
    data: { friendId, actionId: actionId('steal_nut') },
  })
}

export async function fetchInviteSummary() {
  if (!USE_REMOTE) return null
  return request('/api/traffic/v1/invite/summary')
}

export async function apiInviteUnlock() {
  return request('/api/traffic/v1/invite/unlock', { method: 'POST', data: {} })
}

export async function fetchStepsStatus() {
  if (!USE_REMOTE) return null
  return request('/api/traffic/v1/steps/status')
}

export async function apiStepsSync(payload) {
  return request('/api/traffic/v1/steps/sync', {
    method: 'POST',
    data: payload || {},
  })
}

export async function apiStepsClaim() {
  return request('/api/traffic/v1/steps/claim', {
    method: 'POST',
    data: { actionId: actionId('steps') },
  })
}

export async function fetchIaaStatus() {
  if (!USE_REMOTE) return null
  return request('/api/traffic/v1/iaa/status')
}

export async function apiIaaClaim(kind) {
  return request('/api/traffic/v1/iaa/claim', {
    method: 'POST',
    data: { kind, actionId: actionId(`iaa_${kind}`) },
  })
}

export async function apiCompleteTask(taskId) {
  return request('/api/traffic/v1/tasks/complete', {
    method: 'POST',
    data: { taskId },
  })
}

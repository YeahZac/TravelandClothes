import { request, actionId, USE_REMOTE, invalidateRequestCache } from './request.js'

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

/** 用户专属邀请小程序码（服务端生成并缓存 COS） */
export async function fetchInviteQrcode(force = false) {
  if (!USE_REMOTE) return null
  const q = force ? '?force=1' : ''
  return request(`/api/traffic/v1/invite/qrcode${q}`)
}

export async function apiInviteUnlock() {
  return request('/api/traffic/v1/invite/unlock', { method: 'POST', data: {} })
}

export async function fetchStepsStatus() {
  if (!USE_REMOTE) return null
  return request('/api/traffic/v1/steps/status')
}

/** 云托管冷启/忙时会回 503，同一份密文重试一次即可，不要把它当同步失败抛给用户 */
function isBusyError(e) {
  const code = Number(e && (e.statusCode || e.code)) || 0
  if (code === 503 || code === 502) return true
  return /503|502|繁忙|稍后|重启中/.test(String((e && e.message) || ''))
}

export async function apiStepsSync(payload) {
  // 含 wx.login + 刷新 session_key + 解密，给足超时，避免 12s 误杀
  const opts = {
    method: 'POST',
    data: payload || {},
    timeout: 20000,
    cloudTimeout: 15000,
  }
  let data
  try {
    data = await request('/api/traffic/v1/steps/sync', opts)
  } catch (e) {
    if (!isBusyError(e)) throw e
    await new Promise((r) => setTimeout(r, 1200))
    data = await request('/api/traffic/v1/steps/sync', opts)
  }
  invalidateRequestCache('/api/traffic/v1/steps/status')
  return data
}

export async function apiStepsClaim() {
  return request('/api/traffic/v1/steps/claim', {
    method: 'POST',
    data: { actionId: actionId('steps') },
  })
}

export async function fetchStepsHistory(days = 30) {
  if (!USE_REMOTE) return { list: [] }
  return request(`/api/traffic/v1/steps/history?days=${days}`)
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

/** 今日任务进度（0/N、已完成，日切重置） */
export async function fetchTodayTasks() {
  if (!USE_REMOTE) return { list: [], dayKey: '', doneCount: 0, total: 0 }
  return request('/api/traffic/v1/tasks/today')
}

export async function apiCompleteTask(taskId) {
  return request('/api/traffic/v1/tasks/complete', {
    method: 'POST',
    data: { taskId, actionId: actionId('task') },
  })
}

/** 上报当日可统计行为：share / browse_mall / browse_festival */
export async function apiRecordTaskAction(actionKey) {
  return request('/api/traffic/v1/tasks/action', {
    method: 'POST',
    data: { actionKey, actionId: actionId('task_action') },
  })
}

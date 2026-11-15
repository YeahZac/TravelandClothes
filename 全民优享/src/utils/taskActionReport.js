/**
 * 任务行为上报（浏览商城/活动页），客户端节流 + 服务端日上限
 */
import { USE_REMOTE, getToken } from '../api/request.js'
import { isLoggedIn } from '../api/auth.js'
import { apiRecordTaskAction } from '../api/growth.js'

const lastAt = Object.create(null)

export function reportTaskBrowse(actionKey, minIntervalMs = 8000) {
  if (!(USE_REMOTE && getToken() && isLoggedIn())) return
  const key = String(actionKey || '')
  if (!key) return
  const now = Date.now()
  if (lastAt[key] && now - lastAt[key] < minIntervalMs) return
  lastAt[key] = now
  apiRecordTaskAction(key).catch(() => {})
}

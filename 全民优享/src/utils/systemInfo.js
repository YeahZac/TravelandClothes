/**
 * 兼容新基础库：优先 getWindowInfo / getDeviceInfo，避免 getSystemInfoSync 弃用告警。
 * 结果进程内缓存：反复 getWindowInfo 会在基础库挂 WindowInfoChanged 监听，导致内存泄漏告警。
 */

let cachedInfo = null
let cachedAt = 0
let cachedStatusBar = null
/** 窗口信息变化不频繁，缓存 5 分钟足够；旋转等场景可主动 invalidate */
const CACHE_TTL_MS = 5 * 60 * 1000

export function invalidateSystemInfoCache() {
  cachedInfo = null
  cachedAt = 0
  cachedStatusBar = null
}

function readFreshSystemInfo() {
  const out = {}
  try {
    if (typeof uni.getWindowInfo === 'function') Object.assign(out, uni.getWindowInfo() || {})
  } catch (e) {}
  try {
    if (typeof uni.getDeviceInfo === 'function') Object.assign(out, uni.getDeviceInfo() || {})
  } catch (e) {}
  try {
    if (typeof uni.getAppBaseInfo === 'function') Object.assign(out, uni.getAppBaseInfo() || {})
  } catch (e) {}
  if (!Object.keys(out).length) {
    try {
      Object.assign(out, uni.getSystemInfoSync() || {})
    } catch (e) {}
  }
  return out
}

export function getSafeSystemInfo() {
  const now = Date.now()
  if (cachedInfo && now - cachedAt < CACHE_TTL_MS) return cachedInfo
  cachedInfo = readFreshSystemInfo()
  cachedAt = now
  if (cachedInfo && cachedInfo.statusBarHeight != null) {
    cachedStatusBar = Number(cachedInfo.statusBarHeight) || cachedStatusBar
  }
  return cachedInfo
}

export function getStatusBarHeight(fallback = 20) {
  if (cachedStatusBar != null) return cachedStatusBar
  try {
    const info = getSafeSystemInfo()
    if (info && info.statusBarHeight != null) {
      cachedStatusBar = Number(info.statusBarHeight) || fallback
      return cachedStatusBar
    }
  } catch (e) {}
  return fallback
}

// 窗口尺寸变化时清缓存（只注册一次）
let resizeBound = false
function bindResizeOnce() {
  if (resizeBound) return
  resizeBound = true
  try {
    if (typeof uni.onWindowResize === 'function') {
      uni.onWindowResize(() => invalidateSystemInfoCache())
    }
  } catch (e) {}
}
bindResizeOnce()

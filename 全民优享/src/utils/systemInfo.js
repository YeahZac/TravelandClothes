/**
 * 兼容新基础库：优先 getWindowInfo / getDeviceInfo，避免 getSystemInfoSync 弃用告警
 */
export function getStatusBarHeight(fallback = 20) {
  try {
    if (typeof uni.getWindowInfo === 'function') {
      const w = uni.getWindowInfo()
      if (w && w.statusBarHeight != null) return Number(w.statusBarHeight) || fallback
    }
  } catch (e) {}
  try {
    const info = uni.getSystemInfoSync()
    if (info && info.statusBarHeight != null) return Number(info.statusBarHeight) || fallback
  } catch (e) {}
  return fallback
}

export function getSafeSystemInfo() {
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

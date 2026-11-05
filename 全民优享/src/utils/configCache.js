/**
 * 壳层配置本地缓存
 *
 * Key:
 *   qmyx_cfg_meta     → { version, publishedAt, assetBase, cachedAt }
 *   qmyx_cfg_payload  → 完整 AppConfig JSON
 *
 * 策略：
 *   1. 冷启动先读 payload → 秒开
 *   2. 并行拉 /meta，version 变再拉 /bootstrap
 *   3. 网络失败用缓存；缓存也无则用包内 fallback
 */

const META_KEY = 'qmyx_cfg_meta'
const PAYLOAD_KEY = 'qmyx_cfg_payload'
const META_THROTTLE_MS = 60 * 1000

let lastMetaAt = 0

export function readCachedMeta() {
  try {
    const raw = uni.getStorageSync(META_KEY)
    return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null
  } catch (e) {
    return null
  }
}

export function readCachedConfig() {
  try {
    const raw = uni.getStorageSync(PAYLOAD_KEY)
    return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null
  } catch (e) {
    return null
  }
}

export function writeCachedConfig(config, meta = {}) {
  if (!config) return
  const version = String(config.version || meta.version || '')
  const pack = {
    version,
    publishedAt: config.publishedAt || meta.publishedAt || null,
    assetBase: meta.assetBase || null,
    cdnHost: meta.cdnHost || null,
    cachedAt: Date.now(),
  }
  try {
    uni.setStorageSync(META_KEY, pack)
    uni.setStorageSync(PAYLOAD_KEY, config)
  } catch (e) {
    console.warn('[configCache] write failed', e)
  }
}

export function clearConfigCache() {
  try {
    uni.removeStorageSync(META_KEY)
    uni.removeStorageSync(PAYLOAD_KEY)
  } catch (e) {}
}

export function shouldProbeMeta(force = false) {
  if (force) return true
  return Date.now() - lastMetaAt > META_THROTTLE_MS
}

export function markMetaProbed() {
  lastMetaAt = Date.now()
}

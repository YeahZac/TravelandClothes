import { request, USE_REMOTE } from './request.js'
import { rewriteConfigAssets } from '../utils/assetUrl.js'
import {
  readCachedConfig,
  readCachedMeta,
  writeCachedConfig,
  shouldProbeMeta,
  markMetaProbed,
} from '../utils/configCache.js'
import fallback from '../config/fallback.json'

function packLocal(config, from) {
  return {
    config: rewriteConfigAssets(config, { remote: false }),
    platform: 'mp-weixin',
    channel: 'organic',
    from,
    meta: { version: String(config.version || ''), assetBase: null },
  }
}

/** 拉 meta；失败返回 null */
export async function fetchMeta(force = false) {
  if (!USE_REMOTE) return null
  if (!shouldProbeMeta(force)) return readCachedMeta()
  try {
    const meta = await request('/api/traffic/v1/meta')
    markMetaProbed()
    return meta
  } catch (e) {
    console.warn('[meta]', e)
    return readCachedMeta()
  }
}

/**
 * 启动 / 刷新配置
 * @param {{ force?: boolean, platform?: string, channel?: string }} opts
 */
export async function fetchBootstrap(opts = {}) {
  const platform = opts.platform || 'mp-weixin'
  const channel = opts.channel || 'organic'
  const force = !!opts.force

  if (!USE_REMOTE) {
    return packLocal(fallback, 'fallback')
  }

  const cached = readCachedConfig()
  const cachedMeta = readCachedMeta()

  // 1) 先探测版本
  let meta = null
  try {
    meta = await fetchMeta(force)
  } catch (e) {}

  const localVer = String((cached && cached.version) || (cachedMeta && cachedMeta.version) || '')
  const remoteVer = meta && meta.version != null ? String(meta.version) : ''

  // 2) version 未变 → 用缓存
  if (!force && cached && remoteVer && localVer && remoteVer === localVer) {
    return {
      config: rewriteConfigAssets(cached, { remote: true, assetBase: (meta && meta.assetBase) || cachedMeta.assetBase }),
      platform,
      channel,
      from: 'cache',
      meta: meta || cachedMeta,
    }
  }

  // 3) 拉全量（带本地 version，服务端可回 304）
  try {
    const q = [
      `platform=${encodeURIComponent(platform)}`,
      `channel=${encodeURIComponent(channel)}`,
    ]
    if (localVer) q.push(`version=${encodeURIComponent(localVer)}`)
    const data = await request(`/api/traffic/v1/bootstrap?${q.join('&')}`)

    if (data && data.__unchanged && cached) {
      writeCachedConfig(cached, meta || cachedMeta || data)
      return {
        config: rewriteConfigAssets(cached, { remote: true, assetBase: (meta && meta.assetBase) || data.assetBase }),
        platform,
        channel,
        from: 'cache-304',
        meta: meta || data,
      }
    }

    const cfg = rewriteConfigAssets(data.config || {}, {
      remote: true,
      assetBase: (data.meta && data.meta.assetBase) || (meta && meta.assetBase),
    })
    writeCachedConfig(cfg, data.meta || meta || {})
    markMetaProbed()
    return {
      ...data,
      config: cfg,
      from: 'remote',
      meta: data.meta || meta,
    }
  } catch (e) {
    console.warn('[bootstrap] remote failed', e)
    if (cached) {
      return {
        config: rewriteConfigAssets(cached, { remote: true, assetBase: cachedMeta && cachedMeta.assetBase }),
        platform,
        channel,
        from: 'cache-offline',
        meta: cachedMeta,
      }
    }
    return packLocal(fallback, 'fallback')
  }
}

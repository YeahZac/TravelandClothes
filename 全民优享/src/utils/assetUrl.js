import { CMS_BASE } from '../api/request.js'

/**
 * 配置内素材路径处理
 * - 远程：保留 /uploads/qmyx/... 给 cloudImage/callContainer；清空 /static
 * - 离线：尽量映射包内 static
 */
export function assetUrl(url, { remote = false, assetBase = null } = {}) {
  if (!url || typeof url !== 'string') return url
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) {
    // 云托管坏公网域名：交给 cloudImage 抽 key，这里先原样返回由上层处理
    return url
  }

  if (url.startsWith('/static/') || url.startsWith('static/')) {
    return remote ? '' : url.startsWith('/') ? url : `/${url}`
  }

  if (url.startsWith('/uploads/') || url.startsWith('/cos/') || url.startsWith('qmyx/')) {
    const path = url.startsWith('qmyx/')
      ? `/uploads/${url}`
      : url.startsWith('/cos/')
        ? `/uploads/${url.replace(/^\/cos\//, '')}`
        : url

    if (remote) {
      // 关键：不要改写成 CDN / tcloudbase 公网
      return path
    }

    const name = path.replace(/^\/uploads\//, '').replace(/^qmyx\/[^/]+\//, '')
    if (/^(home|mall|festival|energy|mine)(-active)?\.png$/.test(name)) {
      return `/static/tab/${name}`
    }
    if (name.startsWith('banner-') || name.startsWith('illu-') || name.startsWith('ico-')) {
      return `/static/ui/${name}`
    }
    const base = name.split('/').pop()
    if (base) return `/static/ui/${base}`
    return path
  }

  return url
}

export function rewriteConfigAssets(cfg, { remote = false, assetBase = null } = {}) {
  if (!cfg) return cfg
  const walk = (v) => {
    if (typeof v === 'string') return assetUrl(v, { remote, assetBase })
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out = {}
      Object.keys(v).forEach((k) => {
        out[k] = walk(v[k])
      })
      return out
    }
    return v
  }
  return walk(cfg)
}

// 保留引用，避免未使用告警
void CMS_BASE

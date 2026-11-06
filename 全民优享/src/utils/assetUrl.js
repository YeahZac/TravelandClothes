import { CMS_BASE } from '../api/request.js'

/**
 * 配置内素材路径 → 可加载 URL
 * 远程优先：CDN assetBase → CMS /uploads → 绝对 URL
 * 本地 fallback：/static/...
 */
export function assetUrl(url, { remote = false, assetBase = null } = {}) {
  if (!url || typeof url !== 'string') return url
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) return url

  // 包内 /static：仅离线兜底；远程模式一律视为「未配置」，强制走后台 COS
  if (url.startsWith('/static/') || url.startsWith('static/')) {
    return remote ? '' : url.startsWith('/') ? url : `/${url}`
  }

  if (url.startsWith('/uploads/') || url.startsWith('/cos/') || url.startsWith('qmyx/')) {
    const path = url.startsWith('qmyx/')
      ? `/uploads/${url}`
      : url.startsWith('/cos/')
        ? `/uploads/${url.replace(/^\/cos\//, '')}`
        : url

    if (!remote) {
      // 离线包：尽量映射到 static
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

    if (assetBase) {
      if (path.startsWith('/uploads/')) {
        const key = path.slice('/uploads/'.length)
        const base = assetBase.replace(/\/$/, '')
        if (base.endsWith('/uploads')) return `${base}/${key}`
        // 云托管对象存储 / COS：对象键直接挂在 CDN 根下
        if (/tcb\.qcloud\.la|myqcloud\.com|cos\./i.test(base) || key.startsWith('qmyx/')) {
          return `${base}/${key}`
        }
        // 历史脏路径 /uploads/home.png → 仍走 CMS 域名本地盘（仅兼容）
        return `${CMS_BASE}/uploads/${key}`
      }
    }
    return `${CMS_BASE}${path}`
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

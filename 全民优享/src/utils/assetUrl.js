import { CMS_BASE } from '../api/request.js'

/**
 * 配置内素材路径 → 可加载 URL
 * 远程优先：CDN assetBase → CMS /uploads → 绝对 URL
 * 本地 fallback：/static/...
 */
export function assetUrl(url, { remote = false, assetBase = null } = {}) {
  if (!url || typeof url !== 'string') return url
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) return url

  // 包内静态（仅 fallback / 开发兜底）
  if (url.startsWith('/static/')) return url

  if (url.startsWith('/uploads/') || url.startsWith('/cos/')) {
    const path = url.startsWith('/cos/')
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
      // qmyx/icons/xxx.png → 尝试 ico 名
      const base = name.split('/').pop()
      if (base) return `/static/ui/${base}`
      return path
    }

    if (assetBase) {
      // assetBase：COS/TCB 公网根（…tcb.qcloud.la）或 CMS …/uploads
      if (path.startsWith('/uploads/')) {
        const key = path.slice('/uploads/'.length)
        const base = assetBase.replace(/\/$/, '')
        if (base.endsWith('/uploads')) return `${base}/${key}`
        // 云托管对象存储 / COS：对象键为 qmyx/...，不要再拼一层 /uploads/
        if (
          /tcb\.qcloud\.la|myqcloud\.com|cos\./i.test(base) ||
          key.startsWith('qmyx/')
        ) {
          return `${base}/${key}`
        }
        return `${base}/uploads/${key}`
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

import { CMS_BASE } from '../api/request.js'

const TAB_RE = /^(home|mall|festival|energy|mine|friends|lottery|tasks)(-active)?\.png$/

/** 把配置里的相对素材路径转成小程序可加载地址（fallback 本地 / 远程 CMS） */
export function assetUrl(url, { remote = false } = {}) {
  if (!url || typeof url !== 'string') return url
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) return url
  if (url.startsWith('/static/')) return url

  if (url.startsWith('/uploads/')) {
    const name = url.slice('/uploads/'.length)
    if (!remote) {
      if (TAB_RE.test(name)) return `/static/tab/${name}`
      // 优先本地新资产命名
      if (name.startsWith('banner-') || name.startsWith('illu-') || name.startsWith('ico-')) {
        return `/static/ui/${name}`
      }
      return `/static/ui/${name}`
    }
    return `${CMS_BASE}${url}`
  }
  return url
}

export function rewriteConfigAssets(cfg, { remote = false } = {}) {
  if (!cfg) return cfg
  const walk = (v) => {
    if (typeof v === 'string') return assetUrl(v, { remote })
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

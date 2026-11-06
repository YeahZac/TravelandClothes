/**
 * 运营台配置图解析：远程优先，忽略包内 /static 占位。
 * 图标顺序：条目 iconUrl → iconKey 对应 catalog/assets → 空（交给 VIcon）
 */
import { assetUrl } from './assetUrl.js'
import { appConfig } from '../store/appConfig.js'

export function isPackageStatic(url) {
  return typeof url === 'string' && (url.startsWith('/static/') || url.startsWith('static/'))
}

export function remoteMedia(url) {
  if (!url || typeof url !== 'string') return ''
  if (isPackageStatic(url)) return ''
  return (
    assetUrl(url, {
      remote: true,
      assetBase: appConfig.assetBase || (appConfig.meta && appConfig.meta.assetBase) || null,
    }) || ''
  )
}

function iconMap() {
  return {
    ...(appConfig.assets || {}),
    ...((appConfig.catalog && appConfig.catalog.icons) || {}),
  }
}

/** Banner / 商品主图等纯 URL */
export function resolveImageSrc(url) {
  return remoteMedia(url)
}

/** 金刚区 / 菜单：配置 URL 或 iconKey → 后台图标库 */
export function resolveIconSrc(item = {}) {
  const icons = iconMap()
  const key = item.iconKey || item.icon || ''
  const candidates = [
    item.iconUrl,
    item.imageUrl,
    key && icons[key],
    key && icons[`ico.${key}`],
    key && icons[String(key).replace(/^ico\./, '')],
  ]
  for (const c of candidates) {
    const u = remoteMedia(c)
    if (u) return u
  }
  return ''
}

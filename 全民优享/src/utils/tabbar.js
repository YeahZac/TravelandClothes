import { appConfig } from '../store/appConfig.js'
import { remoteMedia } from './resolveMedia.js'

let lastAppliedSig = ''
let applyInflight = null

function isOnTabBarPage() {
  try {
    const pages = getCurrentPages()
    if (!pages || !pages.length) return false
    const cur = pages[pages.length - 1]
    const route = (cur && (cur.route || cur.$page?.fullPath || '')) || ''
    const path = String(route).split('?')[0].replace(/^\//, '')
    const tabs = (appConfig.tabBar || [])
      .map((t) => String((t && (t.pagePath || t.path)) || '').replace(/^\//, ''))
      .filter(Boolean)
    if (!tabs.length) {
      return /pages\/(home|festival|mall|energy|mine)\//.test(path)
    }
    return tabs.some((t) => path === t || path.startsWith(t.replace(/\/index$/, '')))
  } catch (e) {
    return false
  }
}

function downloadLocal(url) {
  return new Promise((resolve) => {
    const src = remoteMedia(url) || (typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '')
    if (!src) {
      resolve('')
      return
    }
    uni.downloadFile({
      url: src,
      success(res) {
        resolve(res.statusCode === 200 && res.tempFilePath ? res.tempFilePath : '')
      },
      fail() {
        resolve('')
      },
    })
  })
}

function tabBarSignature(list) {
  return (list || [])
    .map((item) =>
      [
        item && item.text,
        item && (item.iconPath || item.iconUrl || ''),
        item && (item.selectedIconPath || item.selectedIconUrl || ''),
        item && (item.pagePath || item.path || ''),
      ].join('|')
    )
    .join(';;')
}

/** 用配置刷新原生 tabBar：文案 + 后台上传的图标（并行下载，同配置跳过） */
export async function applyNativeTabBar() {
  if (!isOnTabBarPage()) return
  const list = appConfig.tabBar || []
  const sig = `${appConfig.version || ''}:${tabBarSignature(list)}`
  if (sig && sig === lastAppliedSig) return
  if (applyInflight) return applyInflight

  applyInflight = (async () => {
    try {
      await Promise.all(
        list.map(async (item, index) => {
          if (!item) return
          const patch = {}
          if (item.text) patch.text = item.text
          try {
            const [icon, selected] = await Promise.all([
              downloadLocal(item.iconPath || item.iconUrl || ''),
              downloadLocal(
                item.selectedIconPath || item.selectedIconUrl || item.iconPath || item.iconUrl || ''
              ),
            ])
            if (icon) patch.iconPath = icon
            if (selected) patch.selectedIconPath = selected
            if (!Object.keys(patch).length) return
            await new Promise((resolve) => {
              uni.setTabBarItem({
                index,
                ...patch,
                complete: resolve,
              })
            })
          } catch (e) {}
        })
      )
      lastAppliedSig = sig
    } finally {
      applyInflight = null
    }
  })()
  return applyInflight
}

export function syncTabBar(_selected) {
  applyNativeTabBar()
}

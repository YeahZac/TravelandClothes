import { appConfig } from '../store/appConfig.js'
import { remoteMedia } from './resolveMedia.js'

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

/** 用配置刷新原生 tabBar：文案 + 后台上传的图标 */
export async function applyNativeTabBar() {
  if (!isOnTabBarPage()) return
  const list = appConfig.tabBar || []
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index]
    if (!item) continue
    const patch = {}
    if (item.text) patch.text = item.text
    try {
      const icon = await downloadLocal(item.iconPath || item.iconUrl || '')
      const selected = await downloadLocal(
        item.selectedIconPath || item.selectedIconUrl || item.iconPath || item.iconUrl || ''
      )
      if (icon) patch.iconPath = icon
      if (selected) patch.selectedIconPath = selected
      if (!Object.keys(patch).length) continue
      await new Promise((resolve) => {
        uni.setTabBarItem({
          index,
          ...patch,
          complete: resolve,
        })
      })
    } catch (e) {}
  }
}

export function syncTabBar(_selected) {
  applyNativeTabBar()
}

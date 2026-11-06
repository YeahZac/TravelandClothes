import { appConfig } from '../store/appConfig.js'

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
      // pages.json 默认 tab：home / festival / tasks / mall / mine
      return /pages\/(home|festival|tasks|mall|mine)\//.test(path)
    }
    return tabs.some((t) => path === t || path.startsWith(t.replace(/\/index$/, '')))
  } catch (e) {
    return false
  }
}

/** 用配置里的文案刷新原生 tabBar（图标仍用本地 static/tab） */
export function applyNativeTabBar() {
  if (!isOnTabBarPage()) return
  const list = appConfig.tabBar || []
  list.forEach((item, index) => {
    if (!item || !item.text) return
    try {
      uni.setTabBarItem({
        index,
        text: item.text,
      })
    } catch (e) {}
  })
}

export function syncTabBar(_selected) {
  applyNativeTabBar()
}

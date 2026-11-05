import { appConfig } from '../store/appConfig.js'

/** 用配置里的文案刷新原生 tabBar（图标仍用本地 static/tab） */
export function applyNativeTabBar() {
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

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

/**
 * 远程图标下载失败（后台配了已删除的 /uploads/*.png，或域名未进下载白名单）时，
 * 记住这个 URL：原生 tabBar 本就打包了本地图标，不该每次切 tab 再打一轮必失败的请求。
 */
const BAD_ICON_KEY = 'qmyx_tabbar_bad_icons'
const BAD_ICON_TTL_MS = 24 * 60 * 60 * 1000
let badIcons = null

function loadBadIcons() {
  if (badIcons) return badIcons
  badIcons = new Map()
  try {
    const raw = uni.getStorageSync(BAD_ICON_KEY)
    const obj = raw && typeof raw === 'object' ? raw : JSON.parse(raw || '{}')
    const now = Date.now()
    Object.keys(obj || {}).forEach((url) => {
      const at = Number(obj[url]) || 0
      if (now - at < BAD_ICON_TTL_MS) badIcons.set(url, at)
    })
  } catch (_) {}
  return badIcons
}

function markBadIcon(url) {
  const map = loadBadIcons()
  map.set(url, Date.now())
  try {
    const obj = {}
    map.forEach((at, key) => {
      obj[key] = at
    })
    uni.setStorageSync(BAD_ICON_KEY, obj)
  } catch (_) {}
}

function downloadLocal(url) {
  return new Promise((resolve) => {
    const src = remoteMedia(url) || (typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '')
    if (!src || loadBadIcons().has(src)) {
      resolve('')
      return
    }
    uni.downloadFile({
      url: src,
      timeout: 6000,
      success(res) {
        if (res.statusCode === 200 && res.tempFilePath) {
          resolve(res.tempFilePath)
          return
        }
        markBadIcon(src)
        resolve('')
      },
      fail() {
        markBadIcon(src)
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
      // 等一帧：避开 switchTab 动画期改 TextView，减少 removeTextView 报错
      await new Promise((r) => setTimeout(r, 80))
      if (!isOnTabBarPage()) return
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
              try {
                uni.setTabBarItem({
                  index,
                  ...patch,
                  complete: resolve,
                  fail: resolve,
                })
              } catch (_) {
                resolve()
              }
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
  applyNativeTabBar().catch(() => {})
}

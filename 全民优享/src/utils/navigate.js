import { resolveLink } from '../store/appConfig.js'
import { doCheckin } from '../store/session.js'
import { isEnergyJarPlayEnabled, isEnergyJarPlayPath } from '../config/featureFlags.js'
import { requireAuth, currentPagePath } from './loginGate.js'

/** 与 pages.json tabBar 对齐；CMS 若把 tab 配成 page 也能兜底 */
const TAB_PATHS = new Set([
  '/pages/home/index',
  '/pages/mall/index',
  '/pages/festival/index',
  '/pages/energy/index',
  '/pages/mine/index',
])

function withQuery(path, params) {
  if (!params || !Object.keys(params).length) return path
  const q = Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&')
  return path.includes('?') ? `${path}&${q}` : `${path}?${q}`
}

function normalizePath(path) {
  if (!path) return ''
  return path.startsWith('/') ? path : `/${path}`
}

function isTabPath(path) {
  const p = normalizePath(String(path || '').split('?')[0])
  return TAB_PATHS.has(p)
}

function blockPlayIfHidden(path) {
  if (isEnergyJarPlayEnabled()) return false
  if (!isEnergyJarPlayPath(path)) return false
  uni.showToast({ title: '养成玩法下版开放', icon: 'none' })
  return true
}

export function openPage(path, params) {
  const url = withQuery(normalizePath(path), params)
  const bare = url.split('?')[0]
  if (blockPlayIfHidden(bare)) return
  if (isTabPath(bare)) {
    uni.switchTab({ url: bare })
    return
  }
  uni.navigateTo({ url })
}

export function openLink(linkOrKey) {
  if (
    !isEnergyJarPlayEnabled() &&
    (linkOrKey === 'friends' || (linkOrKey && linkOrKey.linkKey === 'friends'))
  ) {
    uni.showToast({ title: '养成玩法下版开放', icon: 'none' })
    return
  }
  const link = resolveLink(linkOrKey)
  if (!link || link.type === 'none') return

  if (link.type === 'action') {
    if (link.path === 'checkin') {
      doCheckin()
    }
    return
  }

  if (blockPlayIfHidden(link.path)) return

  if (link.type === 'tab' || isTabPath(link.path)) {
    uni.switchTab({ url: normalizePath(link.path).split('?')[0] })
    return
  }

  if (link.type === 'page') {
    openPage(link.path, link.params)
    return
  }

  if (link.type === 'webview' && link.path) {
    uni.navigateTo({
      url: `/pages/content/detail?id=webview&title=${encodeURIComponent('详情')}&url=${encodeURIComponent(link.path)}`,
    })
  }
}

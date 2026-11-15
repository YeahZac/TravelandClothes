import { USE_REMOTE, getToken } from '../api/request.js'
import { isLoggedIn } from '../api/auth.js'
import { openLoginSheet, closeLoginSheet, loginSheet } from '../store/loginSheet.js'

/**
 * 打开登录：有半屏组件则当前页弹层；否则跳转登录页兜底
 */
export function goLogin(redirectPath) {
  const path = redirectPath || currentPagePath() || ''
  openLoginSheet(path)
  setTimeout(() => {
    if (loginSheet._mounted > 0) return
    closeLoginSheet()
    const q = path ? `?redirect=${encodeURIComponent(path)}` : ''
    uni.navigateTo({ url: `/pages/login/index${q}` })
  }, 60)
}

export function currentPagePath() {
  try {
    const pages = getCurrentPages()
    const cur = pages && pages.length ? pages[pages.length - 1] : null
    if (!cur || !cur.route) return ''
    const q = cur.options || {}
    const qs = Object.keys(q)
      .map((k) => `${k}=${encodeURIComponent(q[k])}`)
      .join('&')
    return `/${cur.route}${qs ? `?${qs}` : ''}`
  } catch (_) {
    return ''
  }
}

export function isAuthed() {
  if (!USE_REMOTE) return true
  return !!(getToken() && isLoggedIn())
}

export function requireAuth(redirectPath, toastTitle = '请先登录') {
  if (isAuthed()) return true
  uni.showToast({ title: toastTitle || '请先登录', icon: 'none' })
  const dest = redirectPath || currentPagePath() || '/pages/home/index'
  setTimeout(() => goLogin(dest), 400)
  return false
}

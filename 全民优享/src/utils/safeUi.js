/**
 * 模拟器/真机在切页、关弹层时，Toast/Loading 的 TextView 可能已卸载，
 * 再 hide/show 会报 removeTextView:fail no root view。统一走安全封装。
 */

let toastTimer = null
let lastToastAt = 0
let lastToastTitle = ''

function pageAlive() {
  try {
    const pages = getCurrentPages()
    return !!(pages && pages.length)
  } catch (_) {
    return false
  }
}

export function safeHideLoading() {
  try {
    uni.hideLoading({ fail() {} })
  } catch (_) {}
}

export function safeShowLoading(opts = {}) {
  if (!pageAlive()) return
  try {
    uni.showLoading({
      title: (opts && opts.title) || '加载中',
      mask: !!(opts && opts.mask),
      fail() {},
    })
  } catch (_) {}
}

/**
 * 短时间同文案去重；切页中跳过，避免 removeTextView 竞态
 */
export function safeShowToast(opts = {}) {
  if (!pageAlive()) return
  const title = String((opts && opts.title) || '').trim()
  if (!title) return
  const now = Date.now()
  if (title === lastToastTitle && now - lastToastAt < 800) return
  lastToastTitle = title
  lastToastAt = now
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
  // 错开导航动画，降低 DevTools TextView 卸载竞态
  toastTimer = setTimeout(() => {
    toastTimer = null
    if (!pageAlive()) return
    try {
      uni.showToast({
        title,
        icon: (opts && opts.icon) || 'none',
        duration: (opts && opts.duration) || 2000,
        mask: !!(opts && opts.mask),
        fail() {},
      })
    } catch (_) {}
  }, opts && opts.delayMs != null ? Number(opts.delayMs) || 0 : 40)
}

export function safeHideToast() {
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
  try {
    uni.hideToast({ fail() {} })
  } catch (_) {}
}

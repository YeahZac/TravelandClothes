/**
 * 轻量 UI 调用兜底：给纯展示类 uni API 注入空 fail 回调。
 *
 * uni 的 API 在没有 success/fail/complete 时会返回 Promise，底层原生调用一旦失败
 * （页面已销毁、tabBar 不在栈、真机调试通道断开 → removeTextView:fail no root view）
 * 就是一条 Uncaught (in promise)，直接把 console 刷满、掩盖真实报错。
 *
 * 这里只包装「从不取返回值」的 API（已核对全仓 178 处调用点无 await/then 依赖），
 * showModal / chooseImage 等需要结果的 API 一律不碰。
 */
const GUARDED = [
  'showToast',
  'hideToast',
  'showLoading',
  'hideLoading',
  'setTabBarItem',
  'setTabBarStyle',
  'showNavigationBarLoading',
  'hideNavigationBarLoading',
  'stopPullDownRefresh',
]

export function installUiGuard() {
  if (typeof uni === 'undefined') return
  GUARDED.forEach((name) => {
    let orig
    try {
      orig = uni[name]
    } catch (e) {
      return
    }
    if (typeof orig !== 'function' || orig.__uiGuarded) return
    const wrapped = function (opts) {
      const o = Object.assign({}, opts || {})
      if (!o.success && !o.fail && !o.complete) o.fail = noop
      try {
        return orig.call(uni, o)
      } catch (e) {
        return undefined
      }
    }
    wrapped.__uiGuarded = true
    try {
      uni[name] = wrapped
    } catch (e) {
      /* 平台不允许改写就算了，safeUi 仍在关键路径生效 */
    }
  })
}

function noop() {}

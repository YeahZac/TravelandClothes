/**
 * 统一下拉刷新：页面需在 pages.json 打开 enablePullDownRefresh
 * @param {() => Promise<any>|any} reloadFn
 */
import { onPullDownRefresh } from '@dcloudio/uni-app'

export function bindPullRefresh(reloadFn) {
  onPullDownRefresh(async () => {
    try {
      await reloadFn()
    } catch (e) {
      console.warn('[pullRefresh]', e && e.message)
    } finally {
      try {
        uni.stopPullDownRefresh()
      } catch (_) {}
    }
  })
}

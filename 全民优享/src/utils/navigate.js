import { resolveLink } from '../store/appConfig.js'
import { doCheckin } from '../store/session.js'

function withQuery(path, params) {
  if (!params || !Object.keys(params).length) return path
  const q = Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&')
  return path.includes('?') ? `${path}&${q}` : `${path}?${q}`
}

export function openLink(linkOrKey) {
  const link = resolveLink(linkOrKey)
  if (!link || link.type === 'none') return

  if (link.type === 'action') {
    if (link.path === 'checkin') {
      doCheckin()
    }
    return
  }

  if (link.type === 'tab') {
    uni.switchTab({ url: link.path })
    return
  }

  if (link.type === 'page') {
    uni.navigateTo({ url: withQuery(link.path, link.params) })
    return
  }

  if (link.type === 'webview' && link.path) {
    uni.navigateTo({
      url: `/pages/content/detail?id=webview&title=${encodeURIComponent('详情')}&url=${encodeURIComponent(link.path)}`,
    })
  }
}

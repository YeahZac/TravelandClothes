import { request, USE_REMOTE } from './request.js'
import { rewriteConfigAssets } from '../utils/assetUrl.js'
import fallback from '../config/fallback.json'

export async function fetchBootstrap(platform = 'mp-weixin') {
  if (!USE_REMOTE) {
    return {
      config: rewriteConfigAssets(fallback, { remote: false }),
      platform,
      channel: 'organic',
      from: 'fallback',
    }
  }
  try {
    const data = await request(
      `/api/traffic/v1/bootstrap?platform=${encodeURIComponent(platform)}`
    )
    // CMS 已 absolutize；再兜底一次相对路径
    return {
      ...data,
      config: rewriteConfigAssets(data.config || {}, { remote: true }),
      from: 'remote',
    }
  } catch (e) {
    console.warn('[bootstrap] remote failed, use fallback', e)
    return {
      config: rewriteConfigAssets(fallback, { remote: false }),
      platform,
      channel: 'organic',
      from: 'fallback',
    }
  }
}

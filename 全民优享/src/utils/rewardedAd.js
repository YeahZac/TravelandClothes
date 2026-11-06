/**
 * 激励视频：真机 createRewardedVideoAd；无广告位/失败时 mock 完播以便联调发奖
 */
import { appConfig } from '../store/appConfig.js'

let adInstance = null

function adUnitId() {
  const g = (appConfig.game && appConfig.game.iaa) || {}
  return g.adUnitId || ''
}

/**
 * @returns {Promise<{ok:boolean, mock?:boolean, err?:any}>}
 */
export function showRewardedAd() {
  const unitId = adUnitId()
  // #ifdef MP-WEIXIN
  if (unitId && !String(unitId).includes('placeholder') && typeof wx !== 'undefined' && wx.createRewardedVideoAd) {
    return new Promise((resolve) => {
      try {
        if (!adInstance) {
          adInstance = wx.createRewardedVideoAd({ adUnitId: unitId })
        }
        const onClose = (res) => {
          adInstance.offClose(onClose)
          if (res && res.isEnded) resolve({ ok: true })
          else resolve({ ok: false, err: 'skipped' })
        }
        const onError = (err) => {
          adInstance.offError(onError)
          // 广告拉取失败 → mock 完播，避免卡死联调
          console.warn('[iaa] ad error, mock complete', err)
          resolve({ ok: true, mock: true, err })
        }
        adInstance.onClose(onClose)
        adInstance.onError(onError)
        adInstance.show().catch(() => {
          adInstance
            .load()
            .then(() => adInstance.show())
            .catch((e) => {
              console.warn('[iaa] show fail, mock', e)
              resolve({ ok: true, mock: true, err: e })
            })
        })
      } catch (e) {
        resolve({ ok: true, mock: true, err: e })
      }
    })
  }
  // #endif
  return Promise.resolve({ ok: true, mock: true })
}

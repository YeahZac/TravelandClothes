/**
 * 微信运动：真机 getWeRunData；开发者工具/非微信降级为本地模拟步数
 */
export function getWeRunPayload() {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    if (typeof wx !== 'undefined' && wx.getWeRunData) {
      wx.getWeRunData({
        success(res) {
          resolve({
            ok: true,
            encryptedData: res.encryptedData,
            iv: res.iv,
          })
        },
        fail(err) {
          // 未授权或开发工具：走模拟
          resolve({
            ok: false,
            err,
            mock: true,
            steps: mockSteps(),
            source: 'werun_mock',
          })
        },
      })
      return
    }
    // #endif
    resolve({
      ok: false,
      mock: true,
      steps: mockSteps(),
      source: 'werun_mock',
    })
  })
}

function mockSteps() {
  try {
    const key = 'qmyx_mock_steps'
    let n = Number(uni.getStorageSync(key) || 0)
    if (!n || n < 1000) n = 6200
    // 每次同步略增，方便联调跨档
    n = Math.min(20000, n + Math.floor(Math.random() * 800))
    uni.setStorageSync(key, n)
    return n
  } catch (e) {
    return 6200
  }
}

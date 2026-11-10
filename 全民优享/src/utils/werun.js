/**
 * 微信运动步数：
 * - 真机：申请 scope.werun → getWeRunData（iOS 健康步数需在「微信运动」里开启同步苹果健康）
 * - 开发者工具 / 拒绝授权：本地模拟，便于联调
 */

function mockSteps() {
  try {
    const key = 'qmyx_mock_steps'
    let n = Number(uni.getStorageSync(key) || 0)
    if (!n || n < 1000) n = 6200
    n = Math.min(20000, n + Math.floor(Math.random() * 800))
    uni.setStorageSync(key, n)
    return n
  } catch (e) {
    return 6200
  }
}

function platformHint() {
  try {
    const info = uni.getSystemInfoSync() || {}
    const sys = String(info.system || info.platform || '').toLowerCase()
    if (sys.includes('ios')) {
      return {
        isIOS: true,
        tip: 'iPhone 请在「微信 → 我 → 设置 → 通用 → 辅助功能 → 微信运动」或系统「健康」中允许微信读取步数',
      }
    }
    return { isIOS: false, tip: '请授权微信运动以同步今日步数' }
  } catch (e) {
    return { isIOS: false, tip: '请授权微信运动以同步今日步数' }
  }
}

/** 打开设置页，引导用户打开微信运动权限 */
export function openWeRunSetting() {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    uni.openSetting({
      success(res) {
        resolve({ ok: !!(res.authSetting && res.authSetting['scope.werun']) })
      },
      fail() {
        resolve({ ok: false })
      },
    })
    return
    // #endif
    // #ifndef MP-WEIXIN
    resolve({ ok: false })
    // #endif
  })
}

/**
 * 申请微信运动权限（首次会弹系统授权；iOS 健康数据经微信运动读取）
 */
export function authorizeWeRun() {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    uni.getSetting({
      success(setting) {
        const auth = setting.authSetting || {}
        if (auth['scope.werun'] === true) {
          resolve({ ok: true, authorized: true, ...platformHint() })
          return
        }
        if (auth['scope.werun'] === false) {
          resolve({
            ok: false,
            needSetting: true,
            msg: '未开启微信运动权限',
            ...platformHint(),
          })
          return
        }
        uni.authorize({
          scope: 'scope.werun',
          success() {
            resolve({ ok: true, authorized: true, ...platformHint() })
          },
          fail() {
            resolve({
              ok: false,
              needSetting: true,
              msg: '需要微信运动权限才能同步步数',
              ...platformHint(),
            })
          },
        })
      },
      fail() {
        uni.authorize({
          scope: 'scope.werun',
          success() {
            resolve({ ok: true, authorized: true, ...platformHint() })
          },
          fail() {
            resolve({ ok: false, needSetting: true, ...platformHint() })
          },
        })
      },
    })
    return
    // #endif
    // #ifndef MP-WEIXIN
    resolve({ ok: false, mock: true, ...platformHint() })
    // #endif
  })
}

/**
 * 读取今日步数载荷（加密包或 mock）
 * @returns {Promise<{ok, encryptedData?, iv?, steps?, source?, needSetting?, tip?, isIOS?}>}
 */
export async function getWeRunPayload() {
  const hint = platformHint()
  // #ifdef MP-WEIXIN
  const auth = await authorizeWeRun()
  if (!auth.ok && auth.needSetting) {
    return {
      ok: false,
      needSetting: true,
      msg: auth.msg || '请开启微信运动权限',
      tip: auth.tip || hint.tip,
      isIOS: !!auth.isIOS,
      mock: true,
      steps: mockSteps(),
      source: 'werun_mock',
    }
  }
  if (typeof wx !== 'undefined' && wx.getWeRunData) {
    return new Promise((resolve) => {
      wx.getWeRunData({
        success(res) {
          resolve({
            ok: true,
            encryptedData: res.encryptedData,
            iv: res.iv,
            source: hint.isIOS ? 'werun_health' : 'werun',
            tip: hint.tip,
            isIOS: hint.isIOS,
          })
        },
        fail(err) {
          resolve({
            ok: false,
            err,
            mock: true,
            steps: mockSteps(),
            source: 'werun_mock',
            tip: hint.tip,
            isIOS: hint.isIOS,
            msg: (err && err.errMsg) || '读取微信运动失败',
          })
        },
      })
    })
  }
  // #endif
  return {
    ok: false,
    mock: true,
    steps: mockSteps(),
    source: 'werun_mock',
    tip: hint.tip,
    isIOS: hint.isIOS,
  }
}

export { platformHint, mockSteps }

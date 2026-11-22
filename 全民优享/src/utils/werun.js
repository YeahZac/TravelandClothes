/**
 * 运动步数步数：
 * - 真机：申请 scope.werun → getWeRunData
 * - 未授权：明确 needSetting，禁止静默“同步成功”
 * - 开发者工具：getWeRunData 常失败，仅在明确 mock 且调用方允许时返回模拟步数
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

let _hintCache = null
let _devtoolsCache = null

function platformHint() {
  if (_hintCache) return _hintCache
  try {
    // eslint-disable-next-line global-require
    const { getSafeSystemInfo } = require('./systemInfo.js')
    const info = getSafeSystemInfo() || {}
    const sys = String(info.system || info.platform || '').toLowerCase()
    if (sys.includes('ios')) {
      _hintCache = {
        isIOS: true,
        tip: 'iPhone 请在系统「健康」中允许读取步数，并打开步数同步',
      }
      return _hintCache
    }
    _hintCache = { isIOS: false, tip: '请授权运动步数以同步今日步数' }
    return _hintCache
  } catch (e) {
    _hintCache = { isIOS: false, tip: '请授权运动步数以同步今日步数' }
    return _hintCache
  }
}

function isDevtools() {
  if (_devtoolsCache != null) return _devtoolsCache
  try {
    // eslint-disable-next-line global-require
    const { getSafeSystemInfo } = require('./systemInfo.js')
    const info = getSafeSystemInfo() || {}
    const p = String(info.platform || info.environment || '').toLowerCase()
    _devtoolsCache = p === 'devtools' || p.includes('devtools')
    return _devtoolsCache
  } catch (e) {
    _devtoolsCache = false
    return _devtoolsCache
  }
}

/** 打开设置页，引导用户打开运动步数权限 */
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

/** 只读：是否已授权 scope.werun（不弹窗） */
export function isWeRunGranted() {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    uni.getSetting({
      success(setting) {
        resolve(!!(setting.authSetting && setting.authSetting['scope.werun'] === true))
      },
      fail() {
        resolve(false)
      },
    })
    return
    // #endif
    // #ifndef MP-WEIXIN
    resolve(false)
    // #endif
  })
}

/**
 * 申请运动步数权限（首次弹系统授权）
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
            msg: '未开启运动步数权限',
            ...platformHint(),
          })
          return
        }
        // 未询问过：主动弹授权
        uni.authorize({
          scope: 'scope.werun',
          success() {
            resolve({ ok: true, authorized: true, ...platformHint() })
          },
          fail() {
            resolve({
              ok: false,
              needSetting: true,
              msg: '需要运动步数权限才能同步步数',
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
    resolve({ ok: false, needSetting: true, ...platformHint() })
    // #endif
  })
}

function readWeRunData(hint) {
  return new Promise((resolve) => {
    // 动态取 API，避免 uni 编译把 getWeRunData 写进 requiredPrivateInfos（开发者工具已不接受该字段值）
    const getWeRun = typeof wx !== 'undefined' ? wx['getWeRunData'] : null
    if (typeof getWeRun !== 'function') {
      resolve({
        ok: false,
        needSetting: true,
        msg: '当前环境不支持运动步数',
        tip: hint.tip,
        isIOS: hint.isIOS,
      })
      return
    }
    getWeRun({
      success(res) {
        if (!res || !res.encryptedData || !res.iv) {
          resolve({
            ok: false,
            msg: '未读到运动步数数据',
            tip: hint.tip,
            isIOS: hint.isIOS,
          })
          return
        }
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
        const msg = String((err && err.errMsg) || '')
        const denied = /auth|deny|authorize|scope\.werun|permission/i.test(msg)
        resolve({
          ok: false,
          needSetting: denied,
          err,
          msg: denied ? '需要运动步数权限才能同步步数' : msg || '读取运动步数失败',
          tip: hint.tip,
          isIOS: hint.isIOS,
        })
      },
    })
  })
}

/**
 * 读取今日步数载荷
 * @param {{ allowMock?: boolean, skipAuthorize?: boolean }} opts
 *   skipAuthorize：自动同步路径只读已授权，不弹系统授权框
 */
export async function getWeRunPayload(opts = {}) {
  const hint = platformHint()
  const allowMock = opts.allowMock === true || (opts.allowMock !== false && isDevtools())

  // #ifdef MP-WEIXIN
  let auth
  if (opts.skipAuthorize) {
    const granted = await isWeRunGranted()
    auth = granted
      ? { ok: true, authorized: true, ...hint }
      : { ok: false, needSetting: true, msg: '未开启运动步数权限', ...hint }
  } else {
    auth = await authorizeWeRun()
  }
  if (!auth.ok) {
    // 开发者工具无法真正授权时，可给模拟步数但必须标明 mock，由 UI 提示
    if (allowMock && isDevtools()) {
      return {
        ok: false,
        needSetting: false,
        mock: true,
        steps: mockSteps(),
        source: 'werun_mock',
        msg: '模拟器无法读取真实步数，已用测试步数',
        tip: '真机请授权运动步数',
        isIOS: !!auth.isIOS,
      }
    }
    return {
      ok: false,
      needSetting: true,
      msg: auth.msg || '请开启运动步数权限',
      tip: auth.tip || hint.tip,
      isIOS: !!auth.isIOS,
    }
  }

  const data = await readWeRunData(hint)
  if (data.ok) return data

  if (allowMock && isDevtools()) {
    return {
      ok: false,
      mock: true,
      steps: mockSteps(),
      source: 'werun_mock',
      msg: '模拟器无法读取真实步数，已用测试步数',
      tip: '真机请授权运动步数',
      isIOS: hint.isIOS,
    }
  }

  return {
    ok: false,
    needSetting: !!data.needSetting,
    msg: data.msg || '读取运动步数失败',
    tip: data.tip || hint.tip,
    isIOS: hint.isIOS,
  }
  // #endif

  // #ifndef MP-WEIXIN
  return {
    ok: false,
    needSetting: true,
    msg: '请在小程序内同步步数',
    tip: hint.tip,
    isIOS: hint.isIOS,
  }
  // #endif
}

export { platformHint, mockSteps, isDevtools }

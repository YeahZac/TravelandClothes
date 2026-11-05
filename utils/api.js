const config = require('./config')
const { walk } = require('./cdn')

const RETRY_DELAYS = [0, 700, 1600]
const CALL_TIMEOUT = 8000
const HARD_TIMEOUT = 10000
const WARM_WAIT_MS = 2500

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error((label || 'timeout') + ' ' + ms + 'ms'))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

function unwrap(res) {
  const body = res.data
  if (typeof body === 'string') {
    const err = new Error('接口不可用')
    err.statusCode = res.statusCode
    throw err
  }
  const data = body || {}
  if (data.code === 0) return walk(data.data)
  if (data.status === 'ok') return walk(data)
  const err = new Error(data.msg || '请求失败')
  err.body = data
  err.statusCode = res.statusCode
  throw err
}

function viaRequest(path, method, data) {
  return new Promise((resolve, reject) => {
    if (!config.BASE_URL) {
      reject(new Error('未配置服务地址'))
      return
    }
    wx.request({
      url: config.BASE_URL + path,
      method: method || 'GET',
      data: data || {},
      timeout: CALL_TIMEOUT,
      success: (res) => {
        try { resolve(unwrap(res)) } catch (e) { reject(e) }
      },
      fail: reject
    })
  })
}

function withQuery(path, method, data) {
  if (method !== 'GET' || !data || !Object.keys(data).length) return path
  const qs = Object.keys(data).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(data[k])).join('&')
  return path + (path.indexOf('?') >= 0 ? '&' : '?') + qs
}

function caller() {
  try {
    const app = getApp()
    if (app && app.globalData && app.globalData.cloud && app.globalData.cloud.callContainer) {
      return app.globalData.cloud
    }
  } catch (e) {}
  return wx.cloud
}

function ready() {
  try {
    const app = getApp()
    const p = app && app.globalData && app.globalData.cloudReady
    if (p && typeof p.then === 'function') return p
  } catch (e) {}
  return Promise.resolve()
}

function callContainerOnce(path, method, data) {
  const job = new Promise((resolve, reject) => {
    const cloud = caller()
    if (!cloud || typeof cloud.callContainer !== 'function') {
      reject(new Error('云托管不可用'))
      return
    }
    let settled = false
    const done = (fn) => (payload) => {
      if (settled) return
      settled = true
      fn(payload)
    }
    try {
      cloud.callContainer({
        config: { env: config.ENV_ID },
        path: path,
        method: method,
        header: {
          'X-WX-SERVICE': config.SERVICE,
          'content-type': 'application/json'
        },
        data: method === 'GET' ? {} : data,
        timeout: CALL_TIMEOUT,
        success: done((res) => {
          try { resolve(unwrap(res)) } catch (e) {
            console.error('接口失败', path, res && res.statusCode, res && res.data)
            reject(e)
          }
        }),
        fail: done((err) => {
          console.error('云托管调用失败', path, err)
          reject(err || new Error('网络失败'))
        })
      })
    } catch (e) {
      done(reject)(e)
    }
  })
  return withTimeout(job, HARD_TIMEOUT, 'callContainer')
}

async function requestWithRetry(path, method, data) {
  let lastErr = null
  for (let i = 0; i < RETRY_DELAYS.length; i++) {
    if (RETRY_DELAYS[i]) await sleep(RETRY_DELAYS[i])
    try {
      return await callContainerOnce(path, method, data)
    } catch (err) {
      lastErr = err
      console.warn('云托管重试', i + 1 + '/' + RETRY_DELAYS.length, path, err && err.message)
    }
  }
  try {
    return await viaRequest(path, method, method === 'GET' ? {} : data)
  } catch (e) {
    throw lastErr || e
  }
}

let warmPromise = null

function warmup() {
  if (warmPromise) return warmPromise
  warmPromise = ready()
    .then(() => requestWithRetry('/ping', 'GET', {}).catch(() => requestWithRetry('/health', 'GET', {})))
    .then((data) => {
      try {
        const app = getApp()
        if (app && app.globalData) app.globalData.cloudWarmed = true
      } catch (e) {}
      return data
    })
    .catch((err) => {
      console.warn('云托管预热失败', err && err.message)
      warmPromise = null
      return null
    })
  return warmPromise
}

function ensureWarm() {
  return warmup().then((data) => !!data)
}

function waitWarm() {
  const warm = (() => {
    try {
      const app = getApp()
      const p = app && app.globalData && app.globalData.cloudWarm
      if (p && typeof p.then === 'function') return p
    } catch (e) {}
    return warmup()
  })()
  return withTimeout(
    Promise.resolve(warm).then(() => null, () => null),
    WARM_WAIT_MS,
    'warm-wait'
  ).catch(() => null)
}

function request(path, options) {
  const method = (options && options.method) || 'GET'
  const data = (options && options.data) || {}
  const url = withQuery(path, method, data)
  return ready()
    .then(() => waitWarm())
    .then(() => requestWithRetry(url, method, data))
}

function get(path, data) {
  return request(path, { method: 'GET', data: data })
}

function post(path, data) {
  return request(path, { method: 'POST', data: data })
}

module.exports = { request, get, post, warmup, ensureWarm }

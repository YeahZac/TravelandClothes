const config = require('./config')
const { walk } = require('./cdn')

function unwrap(res) {
  const body = res.data
  if (typeof body === 'string') {
    const err = new Error('接口不可用')
    err.statusCode = res.statusCode
    throw err
  }
  const data = body || {}
  if (data.code === 0) return walk(data.data)
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

function request(path, options) {
  const method = (options && options.method) || 'GET'
  const data = (options && options.data) || {}
  const url = withQuery(path, method, data)
  return ready().then(() => new Promise((resolve, reject) => {
    const fallback = (err) => {
      viaRequest(url, method, method === 'GET' ? {} : data).then(resolve).catch(() => reject(err || new Error('网络失败')))
    }
    const cloud = caller()
    if (!cloud || typeof cloud.callContainer !== 'function') {
      fallback(new Error('云托管不可用'))
      return
    }
    cloud.callContainer({
      config: { env: config.ENV_ID },
      path: url,
      method: method,
      header: {
        'X-WX-SERVICE': config.SERVICE,
        'content-type': 'application/json'
      },
      data: method === 'GET' ? {} : data,
      success: (res) => {
        try { resolve(unwrap(res)) } catch (e) {
          console.error('接口失败', url, res.statusCode, res.data)
          fallback(e)
        }
      },
      fail: (err) => {
        console.error('云托管调用失败', url, err)
        fallback(err)
      }
    })
  }))
}

function get(path, data) {
  return request(path, { method: 'GET', data: data })
}

function post(path, data) {
  return request(path, { method: 'POST', data: data })
}

module.exports = { request, get, post }

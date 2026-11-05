/** CMS 地址：真机请改为电脑局域网 IP */
export const CMS_BASE = 'http://127.0.0.1:3100'
export const USE_REMOTE = true

export function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${CMS_BASE}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: { 'Content-Type': 'application/json', ...(options.header || {}) },
      timeout: options.timeout || 8000,
      success(res) {
        const body = res.data
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
          resolve(body.data)
        } else {
          reject(new Error((body && body.msg) || `HTTP ${res.statusCode}`))
        }
      },
      fail(err) {
        reject(err)
      },
    })
  })
}

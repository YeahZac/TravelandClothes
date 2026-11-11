import { request, USE_REMOTE } from '../api/request.js'

function guessMime(filePath = '') {
  const p = String(filePath).toLowerCase()
  if (p.endsWith('.png')) return 'image/png'
  if (p.endsWith('.webp')) return 'image/webp'
  if (p.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

/** 本地临时头像 → base64 上传 CMS，返回持久化 path */
export function uploadAvatarFile(filePath) {
  if (!filePath) return Promise.reject(new Error('无头像文件'))
  if (!USE_REMOTE) return Promise.resolve({ path: filePath })
  // 已是可访问的 http(s) 或 /uploads 路径，直接交 profile 用
  if (/^https?:\/\//i.test(filePath) || filePath.startsWith('/uploads/')) {
    return Promise.resolve({ path: filePath })
  }
  return new Promise((resolve, reject) => {
    const fs = uni.getFileSystemManager && uni.getFileSystemManager()
    if (!fs || typeof fs.readFile !== 'function') {
      reject(new Error('无法读取头像文件'))
      return
    }
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: async (res) => {
        try {
          const mime = guessMime(filePath)
          const data = await request('/api/traffic/v1/me/avatar', {
            method: 'POST',
            timeout: 20000,
            data: {
              mime,
              base64: `data:${mime};base64,${res.data}`,
            },
          })
          resolve(data)
        } catch (e) {
          reject(e)
        }
      },
      fail: (err) => reject(err || new Error('读取头像失败')),
    })
  })
}

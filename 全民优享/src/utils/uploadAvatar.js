import { request, USE_REMOTE } from '../api/request.js'

function guessMime(filePath = '') {
  const p = String(filePath).toLowerCase()
  if (p.endsWith('.png')) return 'image/png'
  if (p.endsWith('.webp')) return 'image/webp'
  if (p.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

/** 微信 chooseAvatar 临时文件：必须读盘上传，不能当永久 URL */
export function isTempAvatarPath(filePath = '') {
  const s = String(filePath || '').trim()
  if (!s) return false
  if (s.startsWith('wxfile://') || s.startsWith('file://')) return true
  if (/^https?:\/\/tmp\b/i.test(s)) return true
  if (s.includes('/tmp/') || s.includes('tmp_')) return true
  // 开发者工具 chooseAvatar 常见 http://usr/ 或本地相对路径
  if (/^https?:\/\/usr\b/i.test(s)) return true
  if (!/^https?:\/\//i.test(s) && !s.startsWith('/uploads/') && !s.startsWith('/static/')) return true
  return false
}

/** 从上传接口/各种形态里抽出可入库的相对路径 */
export function pickAvatarStoragePath(payload) {
  if (!payload) return ''
  if (typeof payload === 'string') {
    const s = payload.trim()
    if (!s || s === '[object Object]') return ''
    if (isTempAvatarPath(s)) return ''
    if (s.startsWith('/uploads/')) return s
    if (/^https?:\/\//i.test(s) && s.includes('/qmyx/')) {
      const i = s.indexOf('/qmyx/')
      return `/uploads${s.slice(i)}`.split('?')[0]
    }
    return s.startsWith('/static/') ? '' : s
  }
  if (typeof payload === 'object') {
    return (
      pickAvatarStoragePath(payload.path) ||
      pickAvatarStoragePath(payload.avatarUrl) ||
      pickAvatarStoragePath(payload.user && payload.user.avatarUrl)
    )
  }
  return ''
}

/** 本地临时头像 → base64 上传 CMS，返回 { path, user, ... } */
export function uploadAvatarFile(filePath) {
  if (!filePath) return Promise.reject(new Error('无头像文件'))
  if (!USE_REMOTE) return Promise.resolve({ path: filePath })

  const raw = String(filePath).trim()
  // 已是持久 /uploads 或合规 https，直接交给 profile
  if (!isTempAvatarPath(raw) && (raw.startsWith('/uploads/') || /^https?:\/\//i.test(raw))) {
    return Promise.resolve({ path: pickAvatarStoragePath(raw) || raw })
  }

  return new Promise((resolve, reject) => {
    const fs = uni.getFileSystemManager && uni.getFileSystemManager()
    if (!fs || typeof fs.readFile !== 'function') {
      reject(new Error('无法读取头像文件'))
      return
    }
    fs.readFile({
      filePath: raw,
      encoding: 'base64',
      success: async (res) => {
        try {
          const mime = guessMime(raw)
          const data = await request('/api/traffic/v1/me/avatar', {
            method: 'POST',
            timeout: 20000,
            data: {
              mime,
              base64: `data:${mime};base64,${res.data}`,
            },
          })
          const path = pickAvatarStoragePath(data)
          if (!path) {
            reject(new Error('头像上传未返回有效路径'))
            return
          }
          resolve({ ...(data || {}), path })
        } catch (e) {
          reject(e)
        }
      },
      fail: (err) => reject(err || new Error('读取头像失败')),
    })
  })
}

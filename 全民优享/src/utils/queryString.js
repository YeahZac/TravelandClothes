/**
 * 小程序 JSCore（尤其部分 iOS 基础库）无 URLSearchParams / URL，
 * 统一用手工拼/解析，避免 ReferenceError。
 */

export function buildQuery(params = {}) {
  const parts = []
  Object.keys(params || {}).forEach((k) => {
    const v = params[k]
    if (v == null || v === '') return
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  })
  return parts.join('&')
}

/** 解析 a=1&b=2 或仅含 key=value 的 scene 串 */
export function parseQuery(raw) {
  const out = Object.create(null)
  const s = String(raw || '').trim()
  if (!s) return out
  const q = s.startsWith('?') ? s.slice(1) : s
  q.split('&').forEach((pair) => {
    if (!pair) return
    const i = pair.indexOf('=')
    let key
    let val
    if (i < 0) {
      key = pair
      val = ''
    } else {
      key = pair.slice(0, i)
      val = pair.slice(i + 1)
    }
    try {
      key = decodeURIComponent(key.replace(/\+/g, ' '))
    } catch (_) {}
    try {
      val = decodeURIComponent(val.replace(/\+/g, ' '))
    } catch (_) {}
    if (key) out[key] = val
  })
  return out
}

/** 从完整 URL 或 ?key= 串里取单个参数 */
export function getQueryParam(raw, name) {
  const s = String(raw || '')
  const idx = s.indexOf('?')
  const q = idx >= 0 ? s.slice(idx + 1) : s.includes('=') ? s : ''
  const map = parseQuery(q)
  return map[name] != null ? map[name] : ''
}

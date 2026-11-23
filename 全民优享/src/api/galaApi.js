import { request } from './request.js'

export function fetchGalaByCode(code) {
  return request(`/api/gala/v1/events/by-code/${encodeURIComponent(code)}`)
}

export function galaCheckin(eventId, profile) {
  return request(`/api/gala/v1/events/${eventId}/checkin`, {
    method: 'POST',
    data: profile || {},
  })
}

export function galaMyCheckin(eventId) {
  return request(`/api/gala/v1/events/${eventId}/my-checkin`)
}

export function galaPostDanmaku(eventId, content) {
  return request(`/api/gala/v1/events/${eventId}/danmaku`, {
    method: 'POST',
    data: { content },
  })
}

/** 解析小程序码 scene：gXXXXXX 或 code=XXXXXX */
export function parseGalaScene(sceneRaw) {
  let raw = String(sceneRaw || '').trim()
  if (!raw) return ''
  try {
    raw = decodeURIComponent(raw)
  } catch (_) {}
  const m =
    raw.match(/^g([A-Za-z0-9]{4,16})$/i) ||
    raw.match(/(?:^|[?&])code=([A-Za-z0-9]+)/i) ||
    raw.match(/^([A-Za-z0-9]{4,16})$/)
  return m ? String(m[1] || '').toUpperCase() : ''
}

export function saveGalaPending(code) {
  const c = String(code || '')
    .trim()
    .toUpperCase()
  if (!c) return
  try {
    uni.setStorageSync('qmyx_gala_code', c)
  } catch (_) {}
}

export function readGalaPending() {
  try {
    return String(uni.getStorageSync('qmyx_gala_code') || '')
      .trim()
      .toUpperCase()
  } catch (_) {
    return ''
  }
}

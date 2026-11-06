import { request } from './request.js'

export function fetchLegalMeta() {
  return request('/api/traffic/v1/legal')
}

export function fetchLegalDoc(docId) {
  return request(`/api/traffic/v1/legal/${docId}`)
}

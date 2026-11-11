/**
 * 运营可配入口（首页四宫格 / 任务 / 我的菜单等）
 * 一律以后台下发为准；缺素材或缺跳转 → 灰显「待配置」，不可点。
 */

export function entrySort(a, b) {
  const sa = Number(a && a.sortOrder != null ? a.sortOrder : 999)
  const sb = Number(b && b.sortOrder != null ? b.sortOrder : 999)
  return sa - sb
}

export function isEntryEnabled(item) {
  if (!item) return false
  return item.enabled !== false && item.visible !== false && item.show !== false
}

export function entryDisplayName(item) {
  if (!item) return ''
  return String(item.name || item.title || '').trim()
}

export function entryHasJump(item) {
  if (!item) return false
  return !!(item.linkKey || item.path || item.action || item.link)
}

export function entryHasIcon(item) {
  if (!item) return false
  return !!(item.iconUrl || item.iconKey)
}

/** 名称 + 跳转 + 图标都有才算已配置 */
export function isEntryConfigured(item) {
  return !!(entryDisplayName(item) && entryHasJump(item) && entryHasIcon(item))
}

export function normalizeEntryList(items, { keepDisabled = false } = {}) {
  const list = Array.isArray(items) ? items.slice() : []
  return list
    .filter((it) => it && (keepDisabled || isEntryEnabled(it)))
    .sort(entrySort)
}

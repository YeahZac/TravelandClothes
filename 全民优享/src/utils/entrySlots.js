/**
 * 运营可配入口（首页四宫格 / 任务 / 我的菜单等）
 * 一律以后台下发为准；缺素材或缺跳转 → 灰显「待配置」，不可点。
 *
 * 命名约定：首页四宫格（黄金位）名称为准；同 linkKey 的我的菜单 / 任务 / 页标题应一致。
 */

/** 与运营台 DEFAULT_QUICK_ITEMS 对齐的兜底名（仅配置缺失时） */
export const LINK_TITLE_FALLBACK = {
  lottery: '幸运抽奖',
  gift: '兑好礼',
  energy: '换步数',
  invite: '邀好友',
  mall: '优享商城',
  festival: '汉服节',
  orders: '我的订单',
  address: '收货地址',
  cart: '购物车',
}

const PATH_TO_LINK = {
  '/pages/gift/list': 'gift',
  '/pages/lottery/index': 'lottery',
  '/pages/invite/index': 'invite',
  '/pages/energy/index': 'energy',
  '/pages/mall/index': 'mall',
  '/pages/festival/index': 'festival',
  '/pages/order/list': 'orders',
  '/pages/address/list': 'address',
  '/pages/cart/index': 'cart',
}

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

function itemLinkKey(it) {
  if (!it) return ''
  let key = String(it.linkKey || it.link || it.action || '').trim()
  if (!key && it.path) {
    const p = String(it.path).split('?')[0]
    key = PATH_TO_LINK[p] || ''
  }
  return key
}

/**
 * 解析某 linkKey 的对客名称：优先首页四宫格，再其它模块，最后兜底表。
 * @param {string} linkKey
 * @param {object} [pages] appConfig.pages
 */
export function resolveLinkEntryTitle(linkKey, pages) {
  const key = String(linkKey || '').trim()
  if (!key) return ''
  const root = pages && typeof pages === 'object' ? pages : {}
  const homeMods = (root.home && root.home.modules) || []
  const quick = homeMods.find((m) => m && (m.type === 'quick_grid' || m.id === 'home_quick'))
  const quickItems = (quick && quick.payload && quick.payload.items) || []
  for (let i = 0; i < quickItems.length; i++) {
    const it = quickItems[i]
    if (itemLinkKey(it) === key) {
      const n = entryDisplayName(it)
      if (n) return n
    }
  }
  const pageKeys = Object.keys(root)
  for (let p = 0; p < pageKeys.length; p++) {
    const mods = (root[pageKeys[p]] && root[pageKeys[p]].modules) || []
    for (let m = 0; m < mods.length; m++) {
      const mod = mods[m]
      if (!mod || mod.type === 'quick_grid') continue
      const items = (mod.payload && mod.payload.items) || []
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (itemLinkKey(it) === key) {
          const n = entryDisplayName(it)
          if (n) return n
        }
      }
    }
  }
  return LINK_TITLE_FALLBACK[key] || ''
}

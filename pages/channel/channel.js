const share = require('../../utils/share')
const { fetchChannel } = require('../../utils/assemble')
const { decorateDeal, spotSkus, skusForType } = require('../../utils/deals')
const { canSell } = require('../../utils/commerce')

const DEAL_TYPES = { hot: 1, spots: 1, ticket: 1 }

function priceFenOf(item, fallback) {
  const n = Number(item && item.price)
  if (!n) return fallback || 0
  return n >= 80 ? n : Math.round(n * 100)
}

function polishChannel(code, data) {
  const layout = data.layout || (DEAL_TYPES[code] ? 'deal' : 'list')
  let items = data.items || []
  if (layout === 'deal') {
    items = items.map((item) => {
      if (item.score && item.tags && item.tags.length) return item
      if (!canSell(item.type) && item.type && item.type !== 'ticket' && code !== 'hot' && code !== 'spots') {
        return item
      }
      const priceFen = priceFenOf(item, 0)
      const extra = Object.assign({}, item)
      if (!extra.skus || !extra.skus.length) {
        if (code === 'spots' || code === 'hot') {
          extra.skus = spotSkus(item, { price: priceFen })
        } else if (canSell(extra.type)) {
          extra.skus = skusForType(extra.type || 'ticket', extra.id, priceFen)
        }
      }
      return decorateDeal(extra, { priceFen: priceFen, unit: priceFen ? '起' : '', notes: extra.notes })
    })
  }
  let chips = data.chips || []
  if (code === 'hanfu') chips = (chips || []).filter((c) => c !== '租赁')
  const scrub = (t) => String(t || '').replace(/门票/g, '入园').replace(/酒店/g, '住宿')
  return Object.assign({}, data, {
    title: scrub(data.title),
    heroName: scrub(data.heroName || data.title),
    heroMeta: scrub(data.heroMeta),
    layout,
    items,
    chips
  })
}

function filterItems(list, chip) {
  if (!chip || chip === '全部') return list
  if (chip === '租赁') return []
  return (list || []).filter((item) => {
    const blob = (item.era || '') + (item.city || '') + (item.region || '') + (item.place || '') + (item.meta || '') + (item.name || '')
    return blob.indexOf(chip) !== -1
  })
}

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,
  data: {
    title: '',
    hero: '',
    heroName: '',
    heroMeta: '',
    chips: [],
    current: '全部',
    layout: 'list',
    items: [],
    visible: []
  },

  onLoad(query) {
    const code = query.type || query.code || 'spots'
    this.code = code
    this.load()
  },

  load() {
    fetchChannel(this.code).then((data) => {
      data = polishChannel(this.code, data)
      const items = data.items || []
      this.setData({
        title: data.title || '',
        hero: data.hero || '',
        heroName: data.heroName || data.title || '',
        heroMeta: data.heroMeta || '',
        chips: data.chips || [],
        current: (data.chips && data.chips[0]) || '全部',
        layout: data.layout || 'list',
        items: items,
        visible: items
      })
    }).catch(() => {
      wx.showToast({ title: '列表加载失败', icon: 'none' })
    })
  },

  filter(e) {
    const current = e.currentTarget.dataset.chip
    this.setData({
      current,
      visible: filterItems(this.data.items, current)
    })
  },

  open(e) {
    const item = this.data.visible[e.currentTarget.dataset.index]
    if (item && item.path) wx.navigateTo({ url: item.path })
  }
})

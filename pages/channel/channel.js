const share = require('../../utils/share')
const { fetchChannel } = require('../../utils/assemble')
const { decorateDeal, spotSkus, rentSkus, skusForType } = require('../../utils/deals')

const DEAL_TYPES = { hot: 1, spots: 1, ticket: 1, hotel: 1, food: 1, show: 1, hanfu: 1, rent: 1 }

function priceFenOf(item, fallback) {
  const n = Number(item && item.price)
  if (!n) return fallback || 0
  return n >= 80 ? n : Math.round(n * 100)
}

function polishChannel(code, data) {
  const layout = DEAL_TYPES[code] ? 'deal' : (data.layout || 'list')
  const items = (data.items || []).map((item) => {
    if (item.score && item.tags && item.tags.length) return item
    const priceFen = priceFenOf(item, code === 'hanfu' && item.type !== 'rent' ? 16800 : 0)
    const extra = Object.assign({}, item)
    if (!extra.skus || !extra.skus.length) {
      extra.skus = skusForType(extra.type || code, extra.id, priceFen || (code === 'hanfu' ? 16800 : 0))
      if ((code === 'spots' || code === 'hot') && (!extra.skus || !extra.skus.length)) {
        extra.skus = spotSkus(item, { price: priceFen })
      }
      if ((code === 'hanfu' || extra.type === 'rent') && (!extra.skus || !extra.skus.length)) {
        extra.skus = rentSkus(extra.id, priceFen || 16800)
      }
    }
    return decorateDeal(extra, { priceFen: priceFen, unit: priceFen ? '起' : '', notes: extra.notes })
  })
  let chips = data.chips || []
  if (code === 'hanfu' && chips.indexOf('租赁') === -1) chips = chips.concat(['租赁'])
  return Object.assign({}, data, { layout, items, chips })
}

function filterItems(list, chip) {
  if (!chip || chip === '全部') return list
  if (chip === '租赁') return (list || []).filter((item) => item.type === 'rent')
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

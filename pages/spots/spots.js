const share = require('../../utils/share')
const { fetchChannel } = require('../../utils/assemble')
const { decorateDeal, spotSkus, rentSkus, skusForType } = require('../../utils/deals')

function priceFenOf(item, fallback) {
  const n = Number(item && item.price)
  if (!n) return fallback || 0
  return n >= 80 ? n : Math.round(n * 100)
}

function polishTicket(data) {
  const items = (data.items || []).map((item) => {
    if (item.score && item.tags && item.tags.length) return item
    const priceFen = priceFenOf(item, 0)
    const extra = Object.assign({}, item)
    if (!extra.skus || !extra.skus.length) {
      extra.skus = skusForType(extra.type || 'ticket', extra.id, priceFen)
      if (!extra.skus || !extra.skus.length) extra.skus = spotSkus(item, { price: priceFen })
      if ((extra.type === 'rent') && (!extra.skus || !extra.skus.length)) {
        extra.skus = rentSkus(extra.id, priceFen || 16800)
      }
    }
    return decorateDeal(extra, { priceFen: priceFen, unit: priceFen ? '起' : '', notes: extra.notes })
  })
  return Object.assign({}, data, { items })
}

function filterItems(list, chip, keyword) {
  let next = list || []
  if (chip && chip !== '全部') {
    next = next.filter((item) => {
      const blob = (item.era || '') + (item.city || '') + (item.region || '') + (item.place || '') + (item.meta || '') + (item.name || '')
      return blob.indexOf(chip) !== -1
    })
  }
  const q = (keyword || '').trim()
  if (q) {
    next = next.filter((item) => {
      const blob = (item.name || '') + (item.place || '') + (item.city || '') + (item.meta || '')
      return blob.indexOf(q) !== -1
    })
  }
  return next
}

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,
  data: {
    hero: '',
    heroName: '',
    heroMeta: '',
    chips: [],
    current: '全部',
    keyword: '',
    items: [],
    visible: []
  },

  onLoad() {
    this.load()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    const app = getApp()
    const q = (app.globalData && app.globalData.spotsKeyword) || ''
    if (app.globalData) app.globalData.spotsKeyword = ''
    if (q !== this.data.keyword) {
      this.setData({
        keyword: q,
        current: '全部',
        visible: filterItems(this.data.items, '全部', q)
      })
    }
  },

  load() {
    fetchChannel('ticket').then((data) => {
      data = polishTicket(data)
      const items = data.items || []
      this.setData({
        hero: data.hero || '',
        heroName: data.heroName || '景区门票',
        heroMeta: data.heroMeta || '买贵赔 · 通兑券 · 绿色通道',
        chips: data.chips && data.chips.length ? data.chips : ['全部', '广州', '桂林', '敦煌'],
        current: (data.chips && data.chips[0]) || '全部',
        items: items,
        visible: filterItems(items, (data.chips && data.chips[0]) || '全部', this.data.keyword)
      })
    }).catch(() => wx.showToast({ title: '景区加载失败', icon: 'none' }))
  },

  filter(e) {
    const current = e.currentTarget.dataset.chip
    this.setData({
      current,
      visible: filterItems(this.data.items, current, this.data.keyword)
    })
  },

  clearSearch() {
    this.setData({
      keyword: '',
      current: '全部',
      visible: filterItems(this.data.items, '全部', '')
    })
  },

  open(e) {
    const item = this.data.visible[e.currentTarget.dataset.index]
    if (item && item.path) wx.navigateTo({ url: item.path })
  }
})

const share = require('../../utils/share')
const api = require('../../utils/api')
const { adaptService } = require('../../utils/assemble')
const { canSell, typeLabel } = require('../../utils/commerce')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,
  data: {
    item: null,
    spot: null,
    typeName: '',
    sellable: false,
    infoHint: ''
  },

  onLoad(query) {
    api.get('/api/content/service/' + query.id).then((raw) => {
      const data = adaptService(raw)
      const type = (data.item && data.item.type) || ''
      const sellable = canSell(type)
      this.setData({
        item: data.item,
        spot: data.spot,
        typeName: data.typeName || typeLabel(type) || '介绍',
        sellable,
        infoHint: sellable ? '' : '本页仅作行程参考，平台不提供在线预订。可前往关联景区购买入园通行。'
      })
    }).catch(() => wx.showToast({ title: '服务加载失败', icon: 'none' }))
  },

  goSpot() {
    if (!this.data.spot) return
    wx.navigateTo({ url: '/pages/spot/spot?id=' + this.data.spot.id })
  },

  book() {
    if (!this.data.item || !this.data.sellable) {
      wx.showToast({ title: '仅景区入园可预订', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/checkout/checkout?id=' + this.data.item.id })
  }
})

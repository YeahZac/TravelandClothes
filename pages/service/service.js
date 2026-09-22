const share = require('../../utils/share')
const api = require('../../utils/api')
const { adaptService } = require('../../utils/assemble')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,
  data: {
    item: null,
    spot: null,
    typeName: ''
  },

  onLoad(query) {
    api.get('/api/content/service/' + query.id).then((raw) => {
      const data = adaptService(raw)
      this.setData({
        item: data.item,
        spot: data.spot,
        typeName: data.typeName || '服务'
      })
    }).catch(() => wx.showToast({ title: '服务加载失败', icon: 'none' }))
  },

  goSpot() {
    if (!this.data.spot) return
    wx.navigateTo({ url: '/pages/spot/spot?id=' + this.data.spot.id })
  },

  book() {
    if (!this.data.item) return
    wx.navigateTo({ url: '/pages/checkout/checkout?id=' + this.data.item.id })
  }
})

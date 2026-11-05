const share = require('../../utils/share')
const api = require('../../utils/api')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,
  data: { item: null, garment: null, spot: null, services: [] },

  onLoad(query) {
    api.get('/api/content/event/' + query.id).then((data) => {
      const services = (data.services || []).filter((s) => s.type === 'ticket' || s.type === 'free')
      this.setData({
        item: data.item,
        garment: data.garment,
        spot: data.spot,
        services
      })
    }).catch(() => {})
  },

  goGarment() {
    if (!this.data.garment) return
    wx.navigateTo({ url: '/pages/garment/garment?id=' + this.data.garment.id })
  },

  goSpot() {
    if (!this.data.spot) return
    wx.navigateTo({ url: '/pages/spot/spot?id=' + this.data.spot.id })
  },

  goService(e) {
    wx.navigateTo({ url: '/pages/service/service?id=' + e.currentTarget.dataset.id })
  },

  signup() {
    wx.showToast({ title: '请关注主办方官方渠道', icon: 'none' })
  }
})

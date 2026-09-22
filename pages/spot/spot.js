const share = require('../../utils/share')
const api = require('../../utils/api')
const { adaptSpot } = require('../../utils/assemble')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,
  data: {
    item: null,
    related: [],
    groups: [],
    checkins: [],
    wears: [],
    ticket: null
  },

  onLoad(query) {
    api.get('/api/content/spot/' + query.id).then((raw) => {
      const data = adaptSpot(raw)
      this.setData({
        item: data.item,
        related: data.related || [],
        groups: data.groups || [],
        checkins: data.checkins || [],
        wears: data.wears || [],
        ticket: data.ticket || null
      })
    }).catch(() => wx.showToast({ title: '景区加载失败', icon: 'none' }))
  },

  goEvent(e) {
    wx.navigateTo({ url: '/pages/event/event?id=' + e.currentTarget.dataset.id })
  },

  goService(e) {
    wx.navigateTo({ url: '/pages/service/service?id=' + e.currentTarget.dataset.id })
  },

  goGarment(e) {
    wx.navigateTo({ url: '/pages/garment/garment?id=' + e.currentTarget.dataset.id })
  },

  buyTicket() {
    if (!this.data.ticket) return
    wx.navigateTo({ url: '/pages/checkout/checkout?id=' + this.data.ticket.id })
  }
})

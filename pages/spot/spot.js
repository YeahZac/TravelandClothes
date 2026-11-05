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
    const { canSell, groupTitle } = require('../../utils/commerce')
    api.get('/api/content/spot/' + query.id).then((raw) => {
      const data = adaptSpot(raw)
      const scrub = (t) => String(t || '').replace(/门票/g, '入园').replace(/酒店/g, '住宿')
      const ticket = data.ticket && canSell(data.ticket.type)
        ? Object.assign({}, data.ticket, { name: scrub(data.ticket.name) })
        : null
      const groups = (data.groups || []).map((g) => Object.assign({}, g, {
        title: scrub(groupTitle(g.type) || g.title),
        list: (g.list || []).map((row) => Object.assign({}, row, {
          name: scrub(row.name),
          sellable: canSell(row.type)
        }))
      }))
      this.setData({
        item: data.item,
        related: data.related || [],
        groups,
        checkins: data.checkins || [],
        wears: data.wears || [],
        ticket
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

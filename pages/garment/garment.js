const share = require('../../utils/share')
const api = require('../../utils/api')
const { adaptGarment } = require('../../utils/assemble')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,
  data: {
    item: null,
    fav: false,
    related: [],
    spots: []
  },

  onLoad(query) {
    api.get('/api/content/garment/' + query.id).then((raw) => {
      const data = adaptGarment(raw)
      this.setData({
        item: data.item,
        related: data.related || [],
        spots: data.spots || [],
        fav: getApp().isFav(data.item.id)
      })
    }).catch(() => wx.showToast({ title: '没有这条形制', icon: 'none' }))
  },

  toggle() {
    if (!this.data.item) return
    const fav = getApp().toggleFav(this.data.item.id)
    this.setData({ fav })
    wx.showToast({ title: fav ? '已收藏' : '已取消', icon: 'none' })
  },

  goEvent(e) {
    wx.navigateTo({ url: '/pages/event/event?id=' + e.currentTarget.dataset.id })
  },

  goSpot(e) {
    wx.navigateTo({ url: '/pages/spot/spot?id=' + e.currentTarget.dataset.id })
  },

  goCulture() {
    wx.navigateTo({ url: '/pages/culture/culture' })
  }
})

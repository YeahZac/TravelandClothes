const share = require('../../utils/share')
const api = require('../../utils/api')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,
  data: {
    eras: ['全部', '汉', '唐', '宋', '明'],
    current: '全部',
    all: [],
    list: []
  },

  onLoad() {
    api.get('/api/content/garment/list').then((list) => {
      this.setData({ all: list || [], list: list || [] })
    }).catch(() => wx.showToast({ title: '图鉴加载失败', icon: 'none' }))
  },

  filter(e) {
    const current = e.currentTarget.dataset.era
    const list = current === '全部'
      ? this.data.all
      : this.data.all.filter((item) => (item.era || '').indexOf(current) !== -1)
    this.setData({ current, list })
  },

  open(e) {
    wx.navigateTo({ url: '/pages/garment/garment?id=' + e.currentTarget.dataset.id })
  },

  goCulture() {
    wx.navigateTo({ url: '/pages/culture/culture' })
  }
})

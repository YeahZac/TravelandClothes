const share = require('../../utils/share')
const api = require('../../utils/api')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,
  data: {
    types: [{ id: 'all', name: '全部' }],
    current: 'all',
    all: [],
    list: []
  },

  onLoad() {
    this.fetch('all')
  },

  onShow() {
    const incoming = getApp().globalData.serviceType
    if (incoming) {
      getApp().globalData.serviceType = null
      this.fetch(incoming)
    }
  },

  fetch(type) {
    const current = type || 'all'
    api.get('/api/content/service/list', current === 'all' ? {} : { type: current }).then((data) => {
      const list = Array.isArray(data) ? data : (data.list || [])
      const types = (data && data.types) || this.data.types
      this.setData({ current, types, all: list, list })
    }).catch(() => wx.showToast({ title: '服务加载失败', icon: 'none' }))
  },

  filter(e) {
    this.fetch(e.currentTarget.dataset.type)
  },

  open(e) {
    wx.navigateTo({ url: '/pages/service/service?id=' + e.currentTarget.dataset.id })
  }
})

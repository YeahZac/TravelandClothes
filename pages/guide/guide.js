const share = require('../../utils/share')
const api = require('../../utils/api')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,
  data: { guide: [], taboos: [] },

  onLoad() {
    api.get('/api/content/guide/list').then((data) => {
      this.setData({
        guide: data.guides || [],
        taboos: (data.taboos || []).map((item) => item.text || item)
      })
    }).catch(() => wx.showToast({ title: '指南加载失败', icon: 'none' }))
  }
})

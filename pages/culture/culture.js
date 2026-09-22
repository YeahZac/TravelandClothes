const share = require('../../utils/share')
const api = require('../../utils/api')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,
  data: { articles: [] },
  onLoad() {
    api.get('/api/content/article/list').then((articles) => {
      this.setData({ articles: articles || [] })
    }).catch(() => wx.showToast({ title: '文章加载失败', icon: 'none' }))
  },
  open(e) {
    wx.navigateTo({ url: '/pages/article/article?id=' + e.currentTarget.dataset.id })
  }
})

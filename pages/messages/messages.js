const api = require('../../utils/api')

function filterChats(list, keyword) {
  const q = (keyword || '').trim()
  if (!q) return list
  return list.filter((item) => (item.name || '').indexOf(q) !== -1)
}

function filterNotices(list, kind) {
  if (!kind) return list
  return list.filter((item) => item.kind === kind)
}

Page({
  data: {
    tabs: ['私信', '互动'],
    activeTab: 0,
    keyword: '',
    focusSearch: false,
    noticeKind: '',
    shortcuts: [
      { id: 'at', name: '@我的', mark: '@', color: '#5b9ef0', badge: 0 },
      { id: 'comment', name: '评论', mark: '评', color: '#21c7b1', badge: 0 },
      { id: 'fans', name: '粉丝', mark: '粉', color: '#d9893b', badge: 0 }
    ],
    chats: [],
    notices: [],
    visibleChats: [],
    visibleNotices: []
  },

  onShow() {},

  onLoad() {
    api.get('/api/content/inbox').then((data) => {
      const chats = data.chats || []
      const notices = data.notices || []
      const shortcuts = this.data.shortcuts.map((item) => Object.assign({}, item, {
        badge: notices.filter((n) => n.kind === item.id || (item.id === 'fans' && n.kind === 'fans')).length
      }))
      this.setData({
        chats,
        notices,
        shortcuts,
        visibleChats: filterChats(chats, this.data.keyword),
        visibleNotices: filterNotices(notices, this.data.noticeKind)
      })
    }).catch(() => wx.showToast({ title: '消息加载失败', icon: 'none' }))
  },

  onSearch(e) {
    const keyword = e.detail.value
    this.setData({
      keyword,
      visibleChats: filterChats(this.data.chats, keyword)
    })
  },

  onSearchBlur() {
    this.setData({ focusSearch: false })
  },

  switchTab(e) {
    const activeTab = Number(e.currentTarget.dataset.index)
    this.setData({
      activeTab,
      noticeKind: activeTab === 1 ? this.data.noticeKind : '',
      visibleNotices: filterNotices(this.data.notices, activeTab === 1 ? this.data.noticeKind : '')
    })
  },

  openShortcut(e) {
    const noticeKind = e.currentTarget.dataset.id
    this.setData({
      activeTab: 1,
      noticeKind,
      visibleNotices: filterNotices(this.data.notices, noticeKind)
    })
  },

  goChat(e) {
    const item = this.data.chats.find((chat) => chat.id === e.currentTarget.dataset.id)
    if (!item) return
    wx.showModal({
      title: item.name,
      content: (item.last || '') + '\n\n私信会话即将开放，可先去圈子里互动。',
      confirmText: '去圈子',
      cancelText: '知道了',
      confirmColor: '#21c7b1',
      success: (res) => {
        if (res.confirm) wx.switchTab({ url: '/pages/circles/circles' })
      }
    })
  },

  openNotice(e) {
    const item = this.data.notices.find((n) => n.id === e.currentTarget.dataset.id)
    if (!item) return
    wx.showModal({
      title: item.title,
      content: item.text,
      confirmText: '去圈子',
      cancelText: '知道了',
      confirmColor: '#21c7b1',
      success: (res) => {
        if (res.confirm) wx.switchTab({ url: '/pages/circles/circles' })
      }
    })
  },

  goCircles() {
    wx.switchTab({ url: '/pages/circles/circles' })
  }
})

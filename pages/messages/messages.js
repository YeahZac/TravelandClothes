const { mapPhotos } = require('../../utils/cdn')

Page({
  data: {
    tabs: ['消息', '圈子'],
    activeTab: 0,
    shortcuts: [
      { id: 'at', name: '@我的', icon: '@', color: '#5b9ef0', badge: 5 },
      { id: 'comment', name: '评论', icon: '💬', color: '#21c7b1', badge: 12 },
      { id: 'fans', name: '粉丝', icon: '❤', color: '#ff9a6b', badge: 0 }
    ],
    chats: mapPhotos([
      { id: 'c1', name: '旅行达人群', avatar: '/images/photo/garment-ruqun.jpg', last: '有人发了敦煌攻略，快来看', time: '12:38', unread: 3 },
      { id: 'c2', name: '同袍会·素袍', avatar: '/images/photo/icon-checkin.jpg', last: '您的年卡已激活，享绿色通道', time: '昨天', unread: 1 },
      { id: 'c3', name: '小袍', avatar: '/images/photo/avatar-01.jpg', last: '周末一起去陈家祠打卡？', time: '昨天', unread: 0 },
      { id: 'c4', name: '系统通知', avatar: '/images/photo/icon-hanfu.jpg', last: '您集齐了湾区线3枚章，可领徽章', time: '2天前', unread: 0 },
      { id: 'c5', name: '青衫', avatar: '/images/photo/avatar-02.jpg', last: '马面裙链接发你了', time: '3天前', unread: 0 }
    ], ['avatar'])
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.index })
  },

  goChat(e) {
    const item = this.data.chats[e.currentTarget.dataset.index]
    wx.showToast({ title: '打开 ' + item.name, icon: 'none' })
  }
})

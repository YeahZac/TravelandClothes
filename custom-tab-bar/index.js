Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/home/home', text: '发现', icon: 'home', tabIndex: 0 },
      { pagePath: '/pages/spots/spots', text: '景区', icon: 'spot', tabIndex: 1 },
      { pagePath: '/pages/festival/festival', text: '汉服节', icon: 'fest', tabIndex: 2 },
      { pagePath: '/pages/circles/circles', text: '圈子', icon: 'circle', tabIndex: 3 },
      { pagePath: '/pages/mine/mine', text: '我的', icon: 'user', tabIndex: 4 }
    ]
  },
  methods: {
    switchTab(e) {
      const idx = e.currentTarget.dataset.index
      const item = this.data.list[idx]
      this.setData({ selected: item.tabIndex })
      wx.switchTab({ url: item.pagePath })
    }
  }
})

Component({
  options: { multipleSlots: true },
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
    tone: { type: String, value: 'light' },
    placeholder: { type: Boolean, value: true }
  },
  data: {
    statusBarHeight: 44,
    navBarHeight: 44,
    menuPadRight: 96
  },
  lifetimes: {
    attached() {
      const app = getApp()
      const nav = (app && app.globalData && app.globalData.nav) || app.computeNav()
      this.setData(nav)
    }
  },
  methods: {
    back() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/home/home' }) })
      } else {
        wx.switchTab({ url: '/pages/home/home' })
      }
    }
  }
})

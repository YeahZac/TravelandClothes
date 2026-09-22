const shareBehavior = require('./behaviors/share')
const { showMenus } = require('./utils/share')
const rawPage = Page
Page = function (options) {
  const next = options || {}
  next.behaviors = [shareBehavior].concat(next.behaviors || [])
  next.data = Object.assign({
    nav: { statusBarHeight: 44, navBarHeight: 44, menuPadRight: 96, navTotal: 88 }
  }, next.data || {})
  const oldOnLoad = next.onLoad
  next.onLoad = function (query) {
    const app = getApp()
    const nav = (app.globalData && app.globalData.nav) || app.computeNav()
    this.setData({ nav })
    if (oldOnLoad) oldOnLoad.call(this, query)
  }
  return rawPage(next)
}

App({
  onLaunch() {
    this.computeNav()
    showMenus()
    try {
      const cfg = require('./utils/config')
      if (wx.cloud && typeof wx.cloud.Cloud === 'function') {
        const cloud = new wx.cloud.Cloud({ resourceEnv: cfg.ENV_ID })
        const inited = cloud.init()
        this.globalData.cloud = cloud
        this.globalData.cloudReady = (inited && typeof inited.then === 'function') ? inited.catch(() => {}) : Promise.resolve()
      } else if (wx.cloud && wx.cloud.init) {
        wx.cloud.init({ env: cfg.ENV_ID, traceUser: true })
      }
    } catch (e) {}
  },

  computeNav() {
    const sys = wx.getSystemInfoSync()
    let menu = { top: sys.statusBarHeight + 4, height: 32, left: sys.windowWidth - 96 }
    try {
      menu = wx.getMenuButtonBoundingClientRect() || menu
    } catch (e) {}
    const statusBarHeight = sys.statusBarHeight || 20
    const navBarHeight = Math.max(44, (menu.top - statusBarHeight) * 2 + menu.height)
    const menuPadRight = Math.max(88, sys.windowWidth - (menu.left || sys.windowWidth - 96) + 8)
    const nav = {
      statusBarHeight,
      navBarHeight,
      menuPadRight,
      navTotal: statusBarHeight + navBarHeight
    }
    this.globalData.nav = nav
    return nav
  },

  globalData: {
    favKey: 'hanfu_favs',
    quizKey: 'hanfu_quiz',
    userKey: 'hanfu_user',
    serviceType: null,
    cloud: null,
    cloudReady: null,
    spotsKeyword: ''
  },

  openServices(type) {
    wx.navigateTo({ url: '/pages/channel/channel?type=' + (type || 'ticket') })
  },

  getFavs() {
    return wx.getStorageSync(this.globalData.favKey) || []
  },

  isFav(id) {
    return this.getFavs().indexOf(id) !== -1
  },

  toggleFav(id) {
    const list = this.getFavs()
    const i = list.indexOf(id)
    if (i === -1) list.unshift(id)
    else list.splice(i, 1)
    wx.setStorageSync(this.globalData.favKey, list)
    return i === -1
  },

  getQuiz() {
    return wx.getStorageSync(this.globalData.quizKey) || null
  },

  setQuiz(record) {
    wx.setStorageSync(this.globalData.quizKey, record)
  },

  getUser() {
    return wx.getStorageSync(this.globalData.userKey) || null
  },

  setUser(patch) {
    const next = Object.assign({}, this.getUser() || {}, patch)
    wx.setStorageSync(this.globalData.userKey, next)
    return next
  },

  clearUser() {
    wx.removeStorageSync(this.globalData.userKey)
  },

  comingSoon(content) {
    wx.showModal({
      title: '暂未开放',
      content: content || '支付与在线下单暂未开通，敬请期待',
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#21c7b1'
    })
  }
})

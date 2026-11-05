const share = require('../../utils/share')
const { fetchHome, shellHome, readHomeCache } = require('../../utils/assemble')
const { feedTitle } = require('../../utils/deals')

function guessCheckin(item) {
  const blob = String((item && item.photo) || '') + String((item && item.title) || '') + String((item && item.spotId) || '')
  if (/chen|陈家/.test(blob)) return 'ck-chen'
  if (/lizhiwan|荔枝/.test(blob)) return 'ck-lizhiwan'
  if (/xiangbi|象鼻/.test(blob)) return 'ck-xiangbi'
  if (/yuequan|月牙/.test(blob)) return 'ck-yuequan'
  if (/yuyin|余荫/.test(blob)) return 'ck-yuyin'
  if (/baiyun|白云/.test(blob)) return 'ck-baiyun'
  if (/yangshuo|阳朔/.test(blob)) return 'ck-yangshuo'
  if (/shazhou|沙州/.test(blob)) return 'ck-shazhou'
  if (/lihe|漓江/.test(blob)) return 'ck-lihe'
  if (/liangjiang|两江/.test(blob)) return 'ck-liangjiang'
  if (/mogao|莫高/.test(blob)) return 'ck-mogao'
  if (/yangguan|阳关/.test(blob)) return 'ck-yangguan'
  if (/yongqing|永庆/.test(blob)) return 'ck-yongqing'
  if (/shameen|沙面/.test(blob)) return 'ck-shameen'
  if (/ludi|芦笛/.test(blob)) return 'ck-ludi'
  return ''
}

function enrichFeed(feed) {
  const authors = [
    { user: '西关阿柠', avatar: 'avatar-01.jpg' },
    { user: '漓江小满', avatar: 'avatar-02.jpg' },
    { user: '沙洲晚风', avatar: 'garment-ruqun.jpg' },
    { user: '祠堂阿棠', avatar: 'garment-mamian.jpg' },
    { user: '月牙泉客', avatar: 'garment-qixiong.jpg' },
    { user: '余荫慢走', avatar: 'garment-beizi.jpg' },
    { user: '阳朔换装', avatar: 'garment-yuanling.jpg' },
    { user: '戈壁束带', avatar: 'garment-zhishen.jpg' },
    { user: '两江夜航', avatar: 'garment-shenyi.jpg' },
    { user: '永庆坊客', avatar: 'garment-quju.jpg' },
    { user: '芦笛洞外', avatar: 'checkin-xiangbi.jpg' },
    { user: '白云山行', avatar: 'checkin-yuequan.jpg' },
    { user: '沙面榕荫', avatar: 'checkin-lizhiwan.jpg' },
    { user: '陈家祠客', avatar: 'checkin-chen.jpg' },
    { user: '荔枝湾灯', avatar: 'icon-hanfu.jpg' }
  ]
  return (feed || []).map((item, i) => {
    const code = item.checkin_code || guessCheckin(item)
    const title = feedTitle({
      checkin_code: code,
      name: item.title,
      tip: item.tip,
      content: item.content || item.tip || item.title
    })
    const generic = !item.user || item.user === '旅行家' || item.user === '同袍达人' || item.user === '同袍'
    const author = generic ? authors[i % authors.length] : null
    return Object.assign({}, item, author || {}, { title })
  })
}

function filterFeed(feed, activeTab) {
  if (activeTab === 1) return (feed || []).filter((item) => /广州|荔湾|番禺|白云/.test(item.region || ''))
  if (activeTab === 3) return []
  return feed || []
}

function splitFeed(feed) {
  const feedLeft = []
  const feedRight = []
  ;(feed || []).forEach((item, i) => (i % 2 ? feedRight : feedLeft).push(item))
  return { feedLeft, feedRight }
}

function enrichCategories(list) {
  const flat = {
    hot: { icon: '/images/icons/cat-flat-hot.png' },
    spots: { icon: '/images/icons/cat-flat-spots.png' },
    hanfu: { icon: '/images/icons/cat-flat-hanfu.png' },
    food: { icon: '/images/icons/cat-flat-food.png' },
    show: { icon: '/images/icons/cat-flat-show.png' },
    guide: { icon: '/images/icons/cat-flat-guide.png' },
    ticket: { icon: '/images/icons/cat-flat-ticket.png' },
    hotel: { icon: '/images/icons/cat-flat-hotel.png' }
  }
  return (list || []).map((item) => {
    const meta = flat[item.id] || {}
    return Object.assign({}, item, meta, { flatIcon: true })
  })
}

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,

  data: {
    searchKey: '',
    rankings: [],
    categories: [],
    tabs: ['精选', '周边', '国内', '海外'],
    activeTab: 0,
    feed: [],
    visibleFeed: [],
    feedLeft: [],
    feedRight: [],
    banners: [],
    loading: true,
    waking: false,
    loadError: false
  },

  onLoad() {
    this._retryLeft = 3
    // 先画壳 / 缓存，避免云托管冷启动时整页空白
    const cached = readHomeCache() || shellHome()
    this.setData({
      categories: enrichCategories(cached.categories || []),
      banners: cached.banners || [],
      rankings: cached.rankings || [],
      tabs: cached.tabs || this.data.tabs,
      loading: true,
      waking: false,
      loadError: false
    })
    this.applyFeed(enrichFeed(cached.feed || []), this.data.activeTab)
    this.load(true)
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    // 回到首页若内容为空，自动再拉一次（应对云托管刚醒）
    if (!this.data.loading && this.isEmptyHome()) {
      this.load(true)
    }
  },

  onPullDownRefresh() {
    this._retryLeft = 2
    this.load(true).finally(() => wx.stopPullDownRefresh())
  },

  isEmptyHome() {
    return !(this.data.banners || []).length && !(this.data.rankings || []).length && !(this.data.feed || []).length
  },

  applyFeed(feed, activeTab) {
    const visibleFeed = filterFeed(feed, activeTab)
    const split = splitFeed(visibleFeed)
    this.setData({
      feed,
      activeTab,
      visibleFeed,
      feedLeft: split.feedLeft,
      feedRight: split.feedRight
    })
  },

  load(silent) {
    if (!silent) this.setData({ loading: true, waking: false, loadError: false })
    return fetchHome().then((data) => {
      const cats = enrichCategories(data.categories || [])
      const empty = !(data.banners || []).length && !(data.rankings || []).length && !(data.feed || []).length
      this.setData({
        categories: cats.length ? cats : this.data.categories,
        banners: data.banners || [],
        rankings: data.rankings || [],
        tabs: data.tabs || this.data.tabs,
        loading: false,
        waking: false,
        loadError: empty
      })
      this.applyFeed(enrichFeed(data.feed || []), this.data.activeTab)
      if (empty && this._retryLeft > 0) {
        this._retryLeft -= 1
        setTimeout(() => this.load(true), 1600)
      }
    }).catch(() => {
      this.setData({ loading: false, waking: false, loadError: this.isEmptyHome() })
      if (this._retryLeft > 0) {
        this._retryLeft -= 1
        setTimeout(() => this.load(true), 1800)
      } else if (!silent && this.isEmptyHome()) {
        wx.showToast({ title: '加载失败，下拉重试', icon: 'none' })
      }
    })
  },

  retryLoad() {
    this._retryLeft = 2
    this.load()
  },

  switchTab(e) {
    this.applyFeed(this.data.feed, Number(e.currentTarget.dataset.index))
  },

  onSearch(e) {
    this.setData({ searchKey: e.detail.value })
  },

  onSearchConfirm() {
    const q = (this.data.searchKey || '').trim()
    const app = getApp()
    app.globalData = app.globalData || {}
    app.globalData.spotsKeyword = q
    wx.switchTab({ url: '/pages/spots/spots' })
  },

  goAllSpots() {
    wx.switchTab({ url: '/pages/spots/spots' })
  },

  goRank(e) {
    const item = this.data.rankings[e.currentTarget.dataset.index]
    if (item && item.spotId) wx.navigateTo({ url: '/pages/spot/spot?id=' + item.spotId })
  },

  goCategory(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/channel/channel?type=' + id })
  },

  goFeed(e) {
    const col = e.currentTarget.dataset.col
    const index = Number(e.currentTarget.dataset.index)
    const list = col === 'right' ? this.data.feedRight : this.data.feedLeft
    const item = (list || [])[index]
    if (item && item.spotId) wx.navigateTo({ url: '/pages/spot/spot?id=' + item.spotId })
  },

  goBanner(e) {
    const item = this.data.banners[e.currentTarget.dataset.index]
    if (!item) return
    if (item.spotId) wx.navigateTo({ url: '/pages/spot/spot?id=' + item.spotId })
    else if (item.link) wx.navigateTo({ url: item.link })
  }
})

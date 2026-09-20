const share = require('../../utils/share')
const { cdn, mapPhotos } = require('../../utils/cdn')
const { spots } = require('../../data/spots')
const { garments } = require('../../data/hanfu')
const { events } = require('../../data/events')
const { checkins } = require('../../data/checkins')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,

  data: {
    searchKey: '',
    rankings: mapPhotos([
      { rank: 1, name: '敦煌月牙泉', stat: '上月 3.7w 人去过', photo: '/images/photo/banner-dunhuang.jpg', spotId: 'yuequan' },
      { rank: 2, name: '桂林象鼻山', stat: '上月 2.9w 人去过', photo: '/images/photo/banner-guilin.jpg', spotId: 'xiangbi' },
      { rank: 3, name: '广州陈家祠', stat: '上月 2.1w 人去过', photo: '/images/photo/banner-guangzhou.jpg', spotId: 'chen' }
    ]),
    categories: [
      { id: 'hot', name: '热门', icon: '🔥', color: '#ff6b6b' },
      { id: 'spots', name: '景区', icon: '🏔', color: '#48d9c0' },
      { id: 'hanfu', name: '汉服', icon: '👘', color: '#b799ff' },
      { id: 'food', name: '美食', icon: '🍜', color: '#ffc48a' },
      { id: 'hotel', name: '酒店', icon: '🏨', color: '#5b9ef0' },
      { id: 'ticket', name: '门票', icon: '🎫', color: '#ff9a6b' },
      { id: 'show', name: '演出', icon: '🎭', color: '#ff7a90' },
      { id: 'guide', name: '攻略', icon: '📖', color: '#8ec5ff' }
    ],
    tabs: ['精选', '周边', '国内', '海外'],
    activeTab: 0,
    feed: [],
    banners: mapPhotos([
      { id: 'b1', photo: '/images/photo/banner-guangzhou.jpg', name: '广州汉服打卡', meta: '陈家祠 · 年轻人旅拍', spotId: 'chen' },
      { id: 'b2', photo: '/images/photo/banner-guilin.jpg', name: '漓江汉服航线', meta: '桂林象鼻山 · 竹筏', spotId: 'xiangbi' },
      { id: 'b3', photo: '/images/photo/banner-dunhuang.jpg', name: '月牙泉日落', meta: '敦煌沙海 · 形制展览', spotId: 'yuequan' }
    ])
  },

  onLoad() {
    this.initFeed()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  initFeed() {
    const feed = []
    checkins.forEach((c) => {
      feed.push({
        id: 'c' + c.spotId, type: 'checkin',
        photo: c.photo, title: c.name,
        user: '同袍达人', avatar: cdn('/images/photo/avatar-01.jpg'),
        likes: Math.floor(Math.random() * 500 + 100),
        views: Math.floor(Math.random() * 5000 + 1000),
        spotId: c.spotId
      })
    })
    const sampleSpots = [spots.find(s => s.id === 'yuyin'), spots.find(s => s.id === 'xiangbi')]
    sampleSpots.forEach((s) => {
      if (!s) return
      feed.push({
        id: 's' + s.id, type: 'spot',
        photo: s.photo, title: s.name,
        user: '旅行家', avatar: cdn('/images/photo/avatar-02.jpg'),
        likes: Math.floor(Math.random() * 800 + 200),
        views: Math.floor(Math.random() * 8000 + 2000),
        spotId: s.id
      })
    })
    this.setData({ feed })
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.index })
  },

  onSearch(e) {
    this.setData({ searchKey: e.detail.value })
  },

  goRank(e) {
    const item = this.data.rankings[e.currentTarget.dataset.index]
    if (item && item.spotId) wx.navigateTo({ url: '/pages/spot/spot?id=' + item.spotId })
  },

  goCategory(e) {
    const id = e.currentTarget.dataset.id
    if (id === 'spots') { wx.navigateTo({ url: '/pages/spots/spots' }); return }
    if (id === 'hanfu') { wx.navigateTo({ url: '/pages/catalog/catalog' }); return }
    if (id === 'guide') { wx.navigateTo({ url: '/pages/guide/guide' }); return }
    getApp().openServices(id)
  },

  goFeed(e) {
    const item = this.data.feed[e.currentTarget.dataset.index]
    if (item && item.spotId) wx.navigateTo({ url: '/pages/spot/spot?id=' + item.spotId })
  },

  goBanner(e) {
    const item = this.data.banners[e.currentTarget.dataset.index]
    if (item && item.spotId) wx.navigateTo({ url: '/pages/spot/spot?id=' + item.spotId })
  }
})

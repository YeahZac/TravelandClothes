const share = require('../../utils/share')
const store = require('../../utils/store')
const api = require('../../utils/api')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,

  data: {
    user: {},
    stats: [
      { label: '国家', value: 3 },
      { label: '城市', value: 8 },
      { label: '足迹', value: 2 }
    ],
    memberStats: [
      { label: '关注', value: 128 },
      { label: '粉丝', value: 356 },
      { label: '获赞', value: 1248 }
    ],
    robeLevel: '普通会员',
    growthValue: 0,
    nextLevel: '素袍会员',
    growthToNext: 300,
    growthNextText: '',
    barWidth: 0,
    cardTitle: '开通年卡',
    cardDesc: '',
    gridPhotos: [],
    checkins: []
  },

  onLoad() {
    api.get('/api/content/checkin/list').then((list) => {
      this.setData({ checkins: list || [] })
      this.refresh()
    }).catch(() => this.refresh())
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 })
    }
    this.refresh()
  },

  refresh() {
    const snap = store.snapshot()
    const total = snap.member.growthValue + (snap.member.growthToNext || 0)
    const holding = !!(snap.card && snap.member.cardStatus === 1)
    const growthNextText = holding
      ? ('距' + snap.member.nextName + '还需 ' + snap.member.growthToNext)
      : (snap.member.unlockable >= 1 ? ('购卡即可解锁' + snap.member.unlockName) : ('距' + snap.member.nextName + '还需 ' + snap.member.growthToNext))
    const photos = (snap.stamps || []).map((s) => {
      const hit = (this.data.checkins || []).find((c) => c.spotId === s.id || c.spot_id === s.id)
      return hit ? { id: s.id, photo: hit.photo } : null
    }).filter(Boolean)
    const source = this.data.checkins || []
    const fallback = photos.length ? photos : source.slice(0, 6).map((c) => ({ id: c.spotId || c.id, photo: c.photo }))
    this.setData({
      user: Object.assign({}, snap.user, getApp().getUser() || {}),
      robeLevel: snap.member.levelName,
      growthValue: snap.member.growthValue,
      nextLevel: snap.member.nextName,
      growthToNext: snap.member.growthToNext,
      growthNextText,
      barWidth: total ? Math.min(100, Math.round(snap.member.growthValue / total * 100)) : 0,
      cardTitle: holding ? (snap.card.skuName + ' · 剩 ' + snap.card.remainScenic + ' 次') : '开通年卡解锁' + (snap.member.unlockName || '素袍'),
      cardDesc: holding ? ('有效期至 ' + store.padDate(snap.card.expireAt)) : '成长值 ' + snap.member.growthValue + ' 已达标，购卡即可用绿色通道',
      stats: [
        { label: '国家', value: 3 },
        { label: '城市', value: 3 },
        { label: '足迹', value: (snap.stamps || []).length }
      ],
      gridPhotos: fallback.slice(0, 6)
    })
  },

  persist(patch) {
    store.updateUser(patch)
    this.setData({ user: getApp().setUser(patch) })
  },

  saveAvatar(tempPath) {
    const dest = `${wx.env.USER_DATA_PATH}/hanfu-avatar.jpg`
    wx.getFileSystemManager().saveFile({
      tempFilePath: tempPath,
      filePath: dest,
      success: () => this.persist({ avatarUrl: dest }),
      fail: () => this.persist({ avatarUrl: tempPath })
    })
  },

  onChooseAvatar(e) {
    const url = e.detail && e.detail.avatarUrl
    if (url) this.saveAvatar(url)
  },

  onNickname(e) {
    const nickName = (e.detail.value || '').trim()
    if (nickName) this.persist({ nickName })
  },

  goQuiz() { wx.navigateTo({ url: '/pages/quiz/quiz' }) },
  goGuide() { wx.navigateTo({ url: '/pages/guide/guide' }) },
  goSpots() { wx.switchTab({ url: '/pages/spots/spots' }) },
  goCatalog() { wx.navigateTo({ url: '/pages/catalog/catalog' }) },
  goFestival() { wx.switchTab({ url: '/pages/festival/festival' }) },
  goMessages() { wx.navigateTo({ url: '/pages/messages/messages' }) },
  goCard() { wx.navigateTo({ url: '/pages/card/card' }) },
  goOrders() { wx.navigateTo({ url: '/pages/orders/orders' }) },
  goGrowth() { wx.navigateTo({ url: '/pages/growth/growth' }) },

  openFootprint(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: '/pages/spot/spot?id=' + id })
  }
})

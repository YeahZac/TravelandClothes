const share = require('../../utils/share')
const { cdn } = require('../../utils/cdn')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,

  data: {
    hero: cdn('banner-guangzhou.jpg'),
    slogan: '星火成炬 四海归衣',
    subtitle: '2026 汉服节 · 中国广州',
    meta: [
      { icon: 'time', label: '活动时间', value: '11.21-29' },
      { icon: 'place', label: '活动地点', value: '广州市文化馆' },
      { icon: 'org', label: '主办单位', value: '汉服广东' }
    ],
    stats: [
      { value: '20万+', label: '参与人次' },
      { value: '100万+', label: '覆盖游客' },
      { value: '70+', label: '支持协会' }
    ],
    intro: '2026汉服节以「星火成炬·四海归衣」为主题，汇聚全国各地汉服爱好者与传统文化社团，通过方阵巡游、文化论坛、时尚盛典、夜场狂欢等多元形式，展现中华传统服饰之美。活动联动全国百家景区，推出「买汉服节门票送景区通兑券」活动，以文化之力带动文旅融合发展。',
    guests: [
      { name: '璇玑', role: '文化学者', mark: '学' },
      { name: '浅野', role: '汉服设计大师', mark: '设' },
      { name: '清音', role: '古琴演奏家', mark: '琴' },
      { name: '墨白', role: '书法家', mark: '书' },
      { name: '云裳', role: '汉服模特', mark: '模' }
    ],
    tickets: [
      { id: 'day', name: '单日票', desc: '任选一日入场', price: '58', gift: '送300元通兑券', featured: false },
      { id: 'weekend', name: '周末两天票', desc: '周六周日畅玩', price: '68', gift: '送300元通兑券', featured: false },
      { id: 'pass', name: '通票', desc: '9天无限次入场', price: '128', gift: '送300元通兑券', featured: true }
    ]
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
  },

  buyTicket(e) {
    const id = e.currentTarget.dataset.id
    const ticket = (this.data.tickets || []).find((t) => t.id === id)
    wx.showToast({
      title: ticket ? ('已选 ' + ticket.name) : '门票即将开售',
      icon: 'none'
    })
  },

  moreWays() {
    wx.showToast({ title: '集赞玩法即将上线', icon: 'none' })
  },

  goSpots() {
    wx.switchTab({ url: '/pages/spots/spots' })
  }
})

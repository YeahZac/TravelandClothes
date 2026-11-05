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
    intro: '2026汉服节以「星火成炬·四海归衣」为主题，汇聚全国各地汉服爱好者与传统文化社团，通过方阵巡游、文化论坛、时尚盛典、夜场狂欢等多元形式，展现中华传统服饰之美。本小程序提供活动介绍与联动景区入园预订；汉服节现场入场票与演出票务由主办方另行发布，本平台不销售。',
    guests: [
      { name: '璇玑', role: '文化学者', mark: '学' },
      { name: '浅野', role: '汉服设计大师', mark: '设' },
      { name: '清音', role: '古琴演奏家', mark: '琴' },
      { name: '墨白', role: '书法家', mark: '书' },
      { name: '云裳', role: '汉服模特', mark: '模' }
    ],
    highlights: [
      { id: 'parade', name: '方阵巡游', desc: '全国社团联袂巡游，感受衣冠之美' },
      { id: 'forum', name: '文化论坛', desc: '学者对谈形制、礼仪与当代穿着' },
      { id: 'night', name: '夜场盛典', desc: '灯光与乐舞交织的汉服之夜（介绍）' }
    ]
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
  },

  moreWays() {
    wx.showToast({ title: '入场票请关注主办方官方渠道', icon: 'none' })
  },

  goSpots() {
    wx.switchTab({ url: '/pages/spots/spots' })
  }
})

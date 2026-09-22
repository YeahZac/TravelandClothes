const store = require('../../utils/store')
const memberLib = require('../../utils/member')

function whenText(ts) {
  return store.padDate(ts)
}

Page({
  data: {
    growthValue: 0,
    levelName: '普通会员',
    nextName: '素袍会员',
    growthToNext: 300,
    barWidth: 0,
    levels: memberLib.LEVELS,
    records: []
  },

  onShow() {
    const snap = store.snapshot()
    const total = snap.member.growthValue + (snap.member.growthToNext || 0)
    this.setData({
      growthValue: snap.member.growthValue,
      levelName: snap.member.levelName,
      nextName: snap.member.nextName,
      growthToNext: snap.member.growthToNext,
      barWidth: total ? Math.min(100, Math.round(snap.member.growthValue / total * 100)) : 0,
      records: (snap.records || []).map((item) => Object.assign({}, item, { when: whenText(item.createdAt) }))
    })
  }
})

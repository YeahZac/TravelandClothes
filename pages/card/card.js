const store = require('../../utils/store')
const memberLib = require('../../utils/member')

Page({
  data: {
    skus: memberLib.CARD_SKUS.map((item) => Object.assign({}, item, { yuan: item.price / 100 })),
    current: 'standard',
    payYuan: 399,
    holding: false,
    card: null,
    growthValue: 0,
    unlockName: '素袍会员',
    expireText: '',
    trialUsed: false,
    quotas: [],
    wantTrial: false
  },

  onLoad(query) {
    this.setData({
      wantTrial: query.trial === '1',
      current: query.sku || 'standard'
    })
    this.refresh()
    if (this.data.wantTrial && !this.data.trialUsed && !this.data.holding) {
      wx.showModal({
        title: '7 天试用',
        content: '9.9 元开通绿色通道与休息专区，不含免票次数。到期可抵年卡款。',
        confirmText: '试用',
        confirmColor: '#21c7b1',
        success: (res) => {
          if (res.confirm) this.trial()
        }
      })
    }
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const snap = store.snapshot()
    const sku = memberLib.CARD_SKUS.find((item) => item.skuCode === this.data.current) || memberLib.CARD_SKUS[1]
    const holding = !!(snap.card && snap.card.status === 1 && snap.member.cardStatus === 1)
    this.setData({
      growthValue: snap.member.growthValue,
      unlockName: snap.member.unlockName || '素袍会员',
      holding,
      card: snap.card,
      expireText: snap.card ? store.padDate(snap.card.expireAt) : '',
      trialUsed: !!snap.member.trialUsed,
      payYuan: sku.price / 100,
      quotas: holding ? [
        { label: '景区', value: snap.card.remainScenic },
        { label: '酒店', value: snap.card.remainHotel },
        { label: '演出', value: snap.card.remainShow },
        { label: '租赁', value: snap.card.remainRent }
      ] : []
    })
  },

  pick(e) {
    const current = e.currentTarget.dataset.code
    const sku = memberLib.CARD_SKUS.find((item) => item.skuCode === current)
    this.setData({ current, payYuan: sku.price / 100 })
  },

  buy() {
    const sku = memberLib.CARD_SKUS.find((item) => item.skuCode === this.data.current)
    wx.showModal({
      title: '开通' + sku.name,
      content: '应付 ¥' + (sku.price / 100) + '（模拟微信支付，不产生真实扣款）',
      confirmText: '支付',
      confirmColor: '#21c7b1',
      success: (res) => {
        if (!res.confirm) return
        store.activateCard(sku.skuCode, sku.price)
        wx.showToast({ title: '已开通', icon: 'success' })
        this.refresh()
      }
    })
  },

  trial() {
    if (this.data.trialUsed) {
      wx.showToast({ title: '试用仅限一次', icon: 'none' })
      return
    }
    wx.showModal({
      title: '7 天试用 9.9 元',
      content: '享绿色通道、休息专区。不含免票次数。',
      confirmText: '支付',
      confirmColor: '#21c7b1',
      success: (res) => {
        if (!res.confirm) return
        store.startTrial()
        wx.showToast({ title: '试用已开通', icon: 'success' })
        this.refresh()
      }
    })
  }
})

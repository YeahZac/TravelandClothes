const store = require('../../utils/store')
const memberLib = require('../../utils/member')
const api = require('../../utils/api')

Page({
  data: {
    title: '',
    cover: '',
    place: '',
    type: 'ticket',
    refId: '',
    unitYuan: 0,
    qty: 1,
    day: '',
    minDay: '',
    maxDay: '',
    visitor: '',
    phone: '',
    listYuan: 0,
    payYuan: 0,
    saveYuan: 0,
    hookYuan: 0,
    hookVisible: false
  },

  onLoad(query) {
    api.get('/api/content/service/' + query.id).then((data) => {
      const item = data.item
      if (!item) {
        wx.showToast({ title: '商品不存在', icon: 'none' })
        return
      }
      const today = store.padDate(Date.now() + 86400000)
      const max = store.padDate(Date.now() + 60 * 86400000)
      const snap = store.snapshot()
      this.setData({
        title: item.name,
        cover: item.photo,
        place: item.place,
        type: item.type,
        refId: item.id,
        unitYuan: Number(item.price || 0),
        day: today,
        minDay: today,
        maxDay: max,
        visitor: snap.user.nickName || '',
        phone: snap.user.phone || ''
      })
      this.recompute()
    }).catch(() => wx.showToast({ title: '商品不存在', icon: 'none' }))
  },

  onShow() {
    if (!this.data.refId) return
    this.recompute()
  },

  recompute() {
    const listYuan = this.data.unitYuan * this.data.qty
    const snap = store.snapshot()
    const quote = memberLib.ticketPay(Object.assign({}, snap.member, { card: snap.card }), listYuan, this.data.type)
    const unlockable = snap.member.unlockable >= 1
    this.setData({
      listYuan,
      payYuan: quote.payYuan,
      saveYuan: quote.saveYuan,
      hookYuan: quote.hookYuan,
      hookVisible: !quote.hasCard && listYuan > 0
    })
    if (unlockable && !snap.hooks.unlockPrompted && !quote.hasCard) {
      store.markHook('unlockPrompted')
      wx.showModal({
        title: '已攒够素袍',
        content: '成长值 ' + snap.member.growthValue + '，购年卡即可解锁素袍：绿色通道、休息专区、10 次景区。',
        confirmText: '去开通',
        confirmColor: '#21c7b1',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/card/card' })
        }
      })
    }
  },

  onDay(e) { this.setData({ day: e.detail.value }) },
  onVisitor(e) { this.setData({ visitor: e.detail.value }) },
  onPhone(e) { this.setData({ phone: e.detail.value }) },

  inc() {
    this.setData({ qty: Math.min(4, this.data.qty + 1) })
    this.recompute()
  },

  dec() {
    this.setData({ qty: Math.max(1, this.data.qty - 1) })
    this.recompute()
  },

  goCard() {
    wx.navigateTo({ url: '/pages/card/card' })
  },

  submit() {
    if (!this.data.visitor.trim() || !/^1\d{10}$/.test(this.data.phone)) {
      wx.showToast({ title: '请填写出行人与手机号', icon: 'none' })
      return
    }
    const amount = this.data.listYuan * 100
    const payAmount = this.data.payYuan * 100
    const go = () => {
      const order = store.createOrder({
        type: this.data.type,
        refId: this.data.refId,
        title: this.data.title,
        cover: this.data.cover,
        place: this.data.place,
        day: this.data.day,
        qty: this.data.qty,
        amount,
        payAmount,
        coveredByCard: this.data.saveYuan > 0,
        visitor: this.data.visitor.trim(),
        phone: this.data.phone
      })
      const after = store.payOrder(order.orderNo)
      wx.redirectTo({ url: '/pages/order-detail/order-detail?orderNo=' + order.orderNo + '&paid=1' })
      if (!after.member.trialUsed && after.member.cardStatus !== 1) {
        setTimeout(() => {
          wx.showModal({
            title: '7 天试用 9.9 元',
            content: '享绿色通道、休息专区、自动盖章。不含免票次数。到期可抵年卡款。',
            confirmText: '试用',
            confirmColor: '#21c7b1',
            success: (res) => {
              if (res.confirm) wx.navigateTo({ url: '/pages/card/card?trial=1' })
            }
          })
        }, 600)
      }
    }
    if (payAmount === 0) {
      go()
      return
    }
    wx.showModal({
      title: '确认支付',
      content: '应付 ¥' + this.data.payYuan + '（模拟微信支付，不产生真实扣款）',
      confirmText: '支付',
      confirmColor: '#21c7b1',
      success: (res) => {
        if (res.confirm) go()
      }
    })
  }
})

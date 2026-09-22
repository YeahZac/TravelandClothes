const store = require('../../utils/store')

Page({
  data: {
    order: null,
    paid: false
  },

  onLoad(query) {
    this.orderNo = query.orderNo
    this.setData({ paid: query.paid === '1' })
    this.refresh()
  },

  refresh() {
    this.setData({ order: store.getOrder(this.orderNo) })
  },

  pay() {
    wx.showModal({
      title: '确认支付',
      content: '应付 ¥' + this.data.order.payYuan + '（模拟微信支付）',
      confirmText: '支付',
      confirmColor: '#21c7b1',
      success: (res) => {
        if (!res.confirm) return
        store.payOrder(this.orderNo)
        this.setData({ paid: true })
        this.refresh()
      }
    })
  },

  cancel() {
    store.cancelOrder(this.orderNo)
    this.refresh()
  },

  refund() {
    wx.showModal({
      title: '申请退款',
      content: '退回实付金额。成长值不回退。年卡抵扣次数会退还。',
      confirmText: '退款',
      confirmColor: '#c44757',
      success: (res) => {
        if (!res.confirm) return
        store.refundOrder(this.orderNo)
        this.refresh()
      }
    })
  },

  verify() {
    store.verifyOrder(this.orderNo)
    wx.showToast({ title: '已入园', icon: 'success' })
    this.refresh()
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/home' })
  }
})

const store = require('../../utils/store')

const tabs = [
  { id: 'all', name: '全部' },
  { id: '0', name: '待支付' },
  { id: '1', name: '待使用' },
  { id: '2', name: '已完成' }
]

Page({
  data: {
    tabs,
    current: 'all',
    list: []
  },

  onShow() {
    this.apply(this.data.current)
  },

  apply(current) {
    const orders = store.snapshot().orders || []
    const list = current === 'all'
      ? orders
      : orders.filter((item) => String(item.status) === current)
    this.setData({ current, list })
  },

  filter(e) {
    this.apply(e.currentTarget.dataset.id)
  },

  open(e) {
    wx.navigateTo({ url: '/pages/order-detail/order-detail?orderNo=' + e.currentTarget.dataset.no })
  },

  goSpots() {
    wx.switchTab({ url: '/pages/spots/spots' })
  }
})

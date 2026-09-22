Page({
  data: {
    text: '',
    images: [],
    location: '',
    canSubmit: false,
    types: [
      { id: 'checkin', name: '打卡' },
      { id: 'guide', name: '攻略' },
      { id: 'hanfu', name: '汉服' },
      { id: 'food', name: '美食' }
    ],
    activeType: 'checkin'
  },

  leave() {
    const go = () => wx.switchTab({ url: '/pages/circles/circles' })
    wx.navigateBack({ fail: go })
  },

  cancel() {
    if (this.data.text || this.data.images.length) {
      wx.showModal({
        title: '放弃这次编辑？',
        content: '退出后文字和照片都不会保存。',
        confirmText: '放弃',
        cancelText: '继续写',
        confirmColor: '#c44757',
        success: (res) => {
          if (res.confirm) this.leave()
        }
      })
      return
    }
    this.leave()
  },

  syncSubmit() {
    this.setData({ canSubmit: !!(this.data.text.trim() || this.data.images.length) })
  },

  onInput(e) {
    this.setData({ text: e.detail.value }, () => this.syncSubmit())
  },

  chooseImage() {
    wx.chooseMedia({
      count: 9 - this.data.images.length,
      mediaType: ['image'],
      success: (res) => {
        const imgs = (res.tempFiles || []).map((f) => f.tempFilePath)
        this.setData({ images: this.data.images.concat(imgs).slice(0, 9) }, () => this.syncSubmit())
      }
    })
  },

  previewPicked(e) {
    wx.previewImage({
      current: this.data.images[e.currentTarget.dataset.index],
      urls: this.data.images
    })
  },

  removeImage(e) {
    const images = this.data.images.slice()
    images.splice(e.currentTarget.dataset.index, 1)
    this.setData({ images }, () => this.syncSubmit())
  },

  selectType(e) {
    this.setData({ activeType: e.currentTarget.dataset.id })
  },

  chooseLocation() {
    wx.chooseLocation({
      success: (res) => this.setData({ location: res.name || res.address }),
      fail: () => wx.showToast({ title: '未获取到位置', icon: 'none' })
    })
  },

  submit() {
    if (!this.data.canSubmit) {
      wx.showToast({ title: '先写一句，或加一张图', icon: 'none' })
      return
    }
    wx.showToast({ title: '已发布', icon: 'success' })
    try { require('../../utils/store').addGrowth('post', 10, '打卡动态') } catch (e) {}
    setTimeout(() => this.leave(), 600)
  }
})

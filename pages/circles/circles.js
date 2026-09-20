const share = require('../../utils/share')
const { mapPhotos } = require('../../utils/cdn')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,

  data: {
    tabs: ['关注', '发现', '同袍'],
    activeTab: 1,
    stories: mapPhotos([
      { id: 's1', name: '小袍', avatar: '/images/photo/avatar-01.jpg' },
      { id: 's2', name: '青衫', avatar: '/images/photo/avatar-02.jpg' },
      { id: 's3', name: '月影', avatar: '/images/photo/garment-mamian.jpg' },
      { id: 's4', name: '云溪', avatar: '/images/photo/garment-yuanling.jpg' },
      { id: 's5', name: '长安', avatar: '/images/photo/avatar-01.jpg' },
      { id: 's6', name: '漓江', avatar: '/images/photo/avatar-02.jpg' }
    ], ['avatar']),
    posts: mapPhotos([
      {
        id: 'p1', user: '小袍', avatar: '/images/photo/avatar-01.jpg',
        time: '6小时前', location: '敦煌月牙泉',
        text: '日落时分的月牙泉，汉服与沙海最配。穿的是齐胸襦裙，风起时裙摆如浪。',
        images: ['/images/photo/banner-dunhuang.jpg', '/images/photo/garment-qixiong.jpg', '/images/photo/garment-yuanling.jpg'],
        likes: 328, comments: 56, liked: false
      },
      {
        id: 'p2', user: '青衫', avatar: '/images/photo/avatar-02.jpg',
        time: '昨天', location: '桂林象鼻山',
        text: '竹筏上穿马面裙，漓江的水绿和裙子的墨绿撞色，出片率极高。',
        images: ['/images/photo/banner-guilin.jpg', '/images/photo/garment-ruqun.jpg'],
        likes: 512, comments: 89, liked: true
      },
      {
        id: 'p3', user: '月影', avatar: '/images/photo/garment-mamian.jpg',
        time: '2天前', location: '广州陈家祠',
        text: '陈家祠的灰塑和褙子绝配，岭南建筑+宋制汉服，推荐下午三点光线最好。',
        images: ['/images/photo/banner-guangzhou.jpg', '/images/photo/garment-beizi.jpg'],
        likes: 246, comments: 38, liked: false
      }
    ], ['avatar'])
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.index })
  },

  toggleLike(e) {
    const idx = e.currentTarget.dataset.index
    const posts = this.data.posts
    posts[idx].liked = !posts[idx].liked
    posts[idx].likes += posts[idx].liked ? 1 : -1
    this.setData({ posts })
  },

  goPost() {
    wx.navigateTo({ url: '/pages/post/post' })
  }
})

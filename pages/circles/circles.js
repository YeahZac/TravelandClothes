const share = require('../../utils/share')
const api = require('../../utils/api')

function visiblePosts(posts, activeTab) {
  if (activeTab === 0) return (posts || []).filter((item) => item.followed)
  if (activeTab === 2) return (posts || []).filter((item) => /广州/.test(item.region || item.location || ''))
  return posts || []
}

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,

  data: {
    tabs: ['关注', '发现', '同袍'],
    activeTab: 1,
    stories: [],
    posts: [],
    visiblePosts: []
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
  },

  onLoad() {
    api.get('/api/content/feed').then((data) => {
      const posts = data.posts || []
      this.setData({
        posts,
        stories: data.stories || [],
        visiblePosts: visiblePosts(posts, this.data.activeTab)
      })
    }).catch(() => wx.showToast({ title: '动态加载失败', icon: 'none' }))
  },

  switchTab(e) {
    const activeTab = Number(e.currentTarget.dataset.index)
    this.setData({
      activeTab,
      visiblePosts: visiblePosts(this.data.posts, activeTab)
    })
  },

  goDiscover() {
    this.setData({
      activeTab: 1,
      visiblePosts: visiblePosts(this.data.posts, 1)
    })
  },

  findPost(id) {
    return this.data.posts.findIndex((item) => item.id === id)
  },

  toggleLike(e) {
    const idx = this.findPost(e.currentTarget.dataset.id)
    if (idx < 0) return
    const posts = this.data.posts.slice()
    const item = Object.assign({}, posts[idx])
    item.liked = !item.liked
    item.likes += item.liked ? 1 : -1
    posts[idx] = item
    this.setData({
      posts,
      visiblePosts: visiblePosts(posts, this.data.activeTab)
    })
  },

  openComments(e) {
    const post = this.data.posts.find((item) => item.id === e.currentTarget.dataset.id)
    wx.showModal({
      title: post ? post.user + ' 的动态' : '评论',
      content: '评论暂未开放。可以先把这条分享给朋友，或自己发一条打卡。',
      confirmText: '去发布',
      cancelText: '知道了',
      confirmColor: '#21c7b1',
      success: (res) => {
        if (res.confirm) wx.navigateTo({ url: '/pages/post/post' })
      }
    })
  },

  sharePost() {
    wx.showToast({ title: '点右上角发给朋友', icon: 'none' })
  },

  openStory(e) {
    const item = this.data.stories[e.currentTarget.dataset.index]
    if (!item) return
    wx.showToast({ title: item.name + ' 今天还没更新', icon: 'none' })
  },

  previewImage(e) {
    const post = this.data.posts.find((item) => item.id === e.currentTarget.dataset.id)
    if (!post || !post.images.length) return
    wx.previewImage({
      current: post.images[e.currentTarget.dataset.index],
      urls: post.images
    })
  }
})

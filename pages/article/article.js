const share = require('../../utils/share')
const api = require('../../utils/api')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,
  data: { item: null },
  onLoad(query) {
    api.get('/api/content/article/' + query.id).then((item) => {
      this.setData({ item })
    }).catch(() => {})
  }
})

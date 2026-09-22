const share = require('../../utils/share')
const api = require('../../utils/api')

Page({
  onShareAppMessage: share.forFriend,
  onShareTimeline: share.forTimeline,
  data: {
    questions: [],
    index: 0,
    picked: -1,
    locked: false,
    score: 0,
    done: false
  },

  onLoad() {
    api.get('/api/content/quiz/questions').then((questions) => {
      this.setData({ questions: questions || [] })
    }).catch(() => wx.showToast({ title: '题目加载失败', icon: 'none' }))
  },

  pick(e) {
    if (this.data.locked) return
    const picked = Number(e.currentTarget.dataset.i)
    const current = this.data.questions[this.data.index]
    if (!current) return
    const correct = picked === current.answer
    this.setData({
      picked,
      locked: true,
      score: this.data.score + (correct ? 1 : 0)
    })
  },

  next() {
    if (!this.data.locked) return
    const questions = this.data.questions
    const next = this.data.index + 1
    if (next >= questions.length) {
      getApp().setQuiz({
        score: this.data.score,
        total: questions.length,
        at: Date.now()
      })
      this.setData({ done: true })
      return
    }
    this.setData({
      index: next,
      picked: -1,
      locked: false
    })
  },

  retry() {
    this.setData({
      index: 0,
      picked: -1,
      locked: false,
      score: 0,
      done: false
    })
  }
})

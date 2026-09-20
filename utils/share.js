const { cdn } = require('./cdn')
const DEFAULT_TITLE = '全民优享 · 广州桂林敦煌'
const DEFAULT_IMAGE = cdn('/images/photo/banner-guangzhou.jpg')

const PAGE_SHARE = {
  'pages/home/home': {
    title: '全民优享 · 广州桂林敦煌汉服出行',
    imageUrl: cdn('/images/photo/banner-guangzhou.jpg')
  },
  'pages/services/services': {
    title: '全民优享 · 门票酒店演出',
    imageUrl: cdn('/images/photo/banner-dunhuang.jpg')
  },
  'pages/spots/spots': {
    title: '全民优享 · 三地景区打卡',
    imageUrl: cdn('/images/photo/banner-guilin.jpg')
  },
  'pages/mine/mine': {
    title: '全民优享',
    imageUrl: cdn('/images/photo/banner-guangzhou.jpg')
  },
  'pages/catalog/catalog': {
    title: '全民优享 · 汉服图鉴',
    imageUrl: cdn('/images/photo/banner-guangzhou.jpg')
  },
  'pages/festival/festival': {
    title: '全民优享 · 展览安排',
    imageUrl: cdn('/images/photo/checkin-chen.jpg')
  },
  'pages/garment/garment': {
    title: '全民优享 · 汉服介绍',
    imageUrl: cdn('/images/photo/icon-hanfu.jpg')
  },
  'pages/culture/culture': {
    title: '全民优享 · 汉服文化',
    imageUrl: cdn('/images/photo/icon-hanfu.jpg')
  },
  'pages/article/article': {
    title: '全民优享 · 汉服文化',
    imageUrl: cdn('/images/photo/banner-guangzhou.jpg')
  },
  'pages/event/event': {
    title: '全民优享 · 展览安排',
    imageUrl: cdn('/images/photo/checkin-chen.jpg')
  },
  'pages/guide/guide': {
    title: '全民优享 · 穿衣要点',
    imageUrl: cdn('/images/photo/icon-checkin.jpg')
  },
  'pages/quiz/quiz': {
    title: '全民优享 · 认形制',
    imageUrl: cdn('/images/photo/icon-hanfu.jpg')
  },
  'pages/spot/spot': {
    title: '全民优享 · 景区打卡',
    imageUrl: cdn('/images/photo/banner-guilin.jpg')
  },
  'pages/service/service': {
    title: '全民优享 · 出行服务',
    imageUrl: cdn('/images/photo/banner-dunhuang.jpg')
  }
}

function currentPage() {
  const pages = getCurrentPages()
  return pages[pages.length - 1] || {}
}

function queryString(options) {
  const opts = options || {}
  return Object.keys(opts)
    .filter((key) => opts[key] !== undefined && opts[key] !== '')
    .map((key) => key + '=' + opts[key])
    .join('&')
}

function resolveShare(page) {
  const route = page.route || ''
  const data = page.data || {}
  const custom = data.share || {}
  const preset = PAGE_SHARE[route] || {}
  const item = data.item || {}
  const itemTitle = item.title || item.name
  const title = custom.title || (itemTitle ? itemTitle + ' · 全民优享' : preset.title) || DEFAULT_TITLE
  const imageUrl = custom.imageUrl || item.photo || preset.imageUrl || DEFAULT_IMAGE
  const query = custom.query != null ? custom.query : queryString(page.options)
  const path = custom.path || '/' + route + (query ? '?' + query : '')
  return { title, path, imageUrl, query }
}

function forFriend() {
  const share = resolveShare(currentPage())
  return {
    title: share.title,
    path: share.path,
    imageUrl: share.imageUrl
  }
}

function forTimeline() {
  const share = resolveShare(currentPage())
  return {
    title: share.title,
    query: share.query,
    imageUrl: share.imageUrl
  }
}

function showMenus() {
  wx.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline']
  })
}

module.exports = { forFriend, forTimeline, showMenus }

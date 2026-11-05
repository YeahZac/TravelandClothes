const api = require('./api')
const { cdn } = require('./cdn')
const { decorateDeal, feedTitle, spotSkus, skusForType } = require('./deals')
const { canSell, groupTitle, typeLabel } = require('./commerce')
const config = require('./config')

const CAT_META = [
  { id: 'hot', name: '热门', spot: 'yuequan' },
  { id: 'spots', name: '景区', spot: 'xiangbi' },
  { id: 'hanfu', name: '汉服', garment: 'mamian' },
  { id: 'food', name: '美食', spot: 'lizhiwan' },
  { id: 'show', name: '活动', event: 'opening' },
  { id: 'guide', name: '攻略', spot: 'mogao' }
]

const HIDDEN_CATS = { hotel: 1, ticket: 1 }

const EXTRA_HOME_CATS = [
  { id: 'ticket', name: '入园', icon: '/images/icons/cat-flat-ticket.png' },
  { id: 'hotel', name: '住宿', icon: '/images/icons/cat-flat-hotel.png' }
]

const TITLES = {
  hot: '热门', spots: '景区', hanfu: '汉服', food: '美食',
  hotel: '住宿参考', ticket: '入园', show: '活动', guide: '攻略'
}

function showHiddenHomeCats() {
  return !!config.SHOW_HIDDEN_HOME_CATS
}

function normalizeHomeCategories(list) {
  const scrub = (t) => String(t || '')
    .replace(/门票/g, '入园')
    .replace(/酒店/g, '住宿')
    .replace(/^演出$/, '活动')
  let cats = (list || []).map((c) => Object.assign({}, c, {
    id: c.id || c.cat_code,
    name: scrub(c.name)
  }))
  if (!showHiddenHomeCats()) {
    cats = cats.filter((c) => {
      const id = c.id || ''
      const name = c.name || ''
      return !HIDDEN_CATS[id] && name !== '酒店' && name !== '门票' && name !== '入园' && name !== '住宿'
    })
  } else {
    const have = {}
    cats.forEach((c) => { have[c.id] = 1 })
    EXTRA_HOME_CATS.forEach((extra) => {
      if (!have[extra.id]) cats.push(Object.assign({}, extra))
    })
  }
  return cats
}

function asList(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.list)) return data.list
  return []
}

function code(row) {
  if (!row) return ''
  return row.spot_code || row.garment_code || row.service_code || row.event_code || row.article_code || row.guide_code || row.checkin_code || row.cat_code || String(row.id || '')
}

function photo(row) {
  if (!row) return ''
  return cdn(row.photo || row.cover || row.image || row.icon || '')
}

function parseMaybe(value, fallback) {
  if (Array.isArray(value)) return value
  if (!value) return fallback
  try { return JSON.parse(value) } catch (e) { return fallback }
}

function money(v) {
  if (v === 0 || v === '0') return '0'
  const n = Number(v || 0)
  if (!n) return '0'
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    if (n >= 200) return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2)
  }
  return String(v)
}

function findCode(list, value) {
  return (list || []).find((row) => code(row) === value || String(row.id) === String(value))
}

function safe(path, data) {
  // 单个接口最多卡几秒，避免 Promise.all 被冷启动拖死
  return Promise.race([
    api.get(path, data).catch(() => []),
    new Promise((resolve) => setTimeout(() => resolve([]), 12000))
  ])
}

function loadBundle() {
  return Promise.all([
    safe('/api/content/spot/list'),
    safe('/api/content/banner/list'),
    safe('/api/content/checkin/list'),
    safe('/api/content/garment/list'),
    safe('/api/content/service/list'),
    safe('/api/content/event/list'),
    safe('/api/content/article/list')
  ]).then(([spots, banners, checkins, garments, services, events, articles]) => ({
    spots: asList(spots),
    banners: asList(banners),
    checkins: asList(checkins),
    garments: asList(garments),
    services: asList(services),
    events: asList(events),
    articles: asList(articles)
  }))
}

function assembleHome(bundle) {
  const { spots, banners, checkins, garments, services, events, articles } = bundle
  const categories = CAT_META.map((c) => {
    let icon = ''
    if (c.garment) icon = photo(findCode(garments, c.garment) || garments[0])
    else if (c.event) icon = photo(findCode(events, c.event) || events[0])
    else if (c.type) icon = photo(services.find((s) => s.type === c.type) || spots[0])
    else icon = photo(findCode(spots, c.spot) || spots[0])
    if (c.id === 'guide' && !icon) icon = photo(articles[0])
    return { id: c.id, name: c.name, icon: icon }
  })

  const mappedBanners = banners.map((b, i) => {
    const name = b.title || b.name || ''
    let spotId = ''
    const m = String(b.link || '').match(/id=([^&]+)/)
    if (m) spotId = m[1]
    else if (/广州|陈家/.test(name)) spotId = 'chen'
    else if (/桂林|漓江|象鼻/.test(name)) spotId = 'xiangbi'
    else if (/敦煌|月牙|莫高/.test(name)) spotId = 'yuequan'
    return {
      id: 'b' + (b.id || i),
      name,
      photo: photo(b),
      meta: '广州 · 桂林 · 敦煌',
      link: b.link,
      spotId
    }
  })

  const rankCodes = ['yuequan', 'xiangbi', 'chen']
  const rankings = rankCodes.map((id, i) => {
    const s = findCode(spots, id) || spots[i]
    if (!s) return null
    return {
      rank: i + 1,
      name: s.name,
      stat: s.level || s.city || '',
      photo: photo(s),
      spotId: code(s)
    }
  }).filter(Boolean)

  const feed = checkins.map((c, i) => {
    const hit = spots.find((s) => s.id === c.spot_id || String(s.id) === String(c.spot_id))
    const authors = [
      { user: '西关阿柠', avatar: 'avatar-01.jpg' },
      { user: '漓江小满', avatar: 'avatar-02.jpg' },
      { user: '沙洲晚风', avatar: 'garment-ruqun.jpg' },
      { user: '祠堂阿棠', avatar: 'garment-mamian.jpg' },
      { user: '月牙泉客', avatar: 'garment-qixiong.jpg' },
      { user: '余荫慢走', avatar: 'garment-beizi.jpg' }
    ]
    const author = authors[i % authors.length]
    return {
      id: 'c' + code(c),
      type: 'checkin',
      checkin_code: c.checkin_code || code(c),
      photo: photo(c),
      title: feedTitle(c),
      tip: c.tip,
      user: author.user,
      avatar: author.avatar,
      likes: 86 + ((i * 47) % 420),
      spotId: c.spot_code || (hit ? code(hit) : ''),
      region: (hit && (hit.region || hit.city)) || c.region || ''
    }
  })

  return {
    categories: normalizeHomeCategories(categories),
    banners: mappedBanners,
    rankings,
    feed,
    tabs: ['精选', '周边', '国内', '海外']
  }
}

function assembleChannel(code, bundle) {
  const title = TITLES[code] || '列表'
  const { spots, garments, services, events, articles, banners } = bundle
  const hero = photo(banners[0]) || photo(spots[0])
  let chips = []
  let layout = 'list'
  let items = []

  if (code === 'hot' || code === 'spots') {
    layout = 'deal'
    chips = ['全部', '广州', '桂林', '敦煌']
    const source = code === 'hot'
      ? ['yuequan', 'xiangbi', 'chen', 'mogao', 'yuyin', 'lizhiwan'].map((id) => findCode(spots, id)).filter(Boolean)
      : spots
    const list = source.length ? source : spots
    const ranks = {
      yuequan: '汉服出行榜 · 敦煌第 1 名',
      xiangbi: '最热打卡榜 · 桂林第 1 名',
      chen: '砖雕取景榜 · 广州第 1 名',
      lizhiwan: '夜游灯会榜 · 广州第 2 名',
      mogao: '形制对照榜 · 敦煌第 2 名',
      yangshuo: '换装体验榜 · 阳朔第 1 名',
      yuyin: '番禺园林榜 · 第 2 名'
    }
    items = list.map((s) => {
      const ticket = services.find((row) => (row.type === 'ticket' || row.type === 'free') && (row.spot_id === s.id || row.spotId === code(s)))
      const priceFen = ticket ? (Number(ticket.price) >= 80 ? Number(ticket.price) : Math.round(Number(ticket.price || 0) * 100)) : 0
      return decorateDeal({
        id: code(s),
        name: s.name,
        photo: photo(s),
        city: s.city,
        region: s.region,
        level: s.level,
        place: (s.city || '') + (s.region && s.region !== s.city ? ' · ' + s.region : ''),
        path: '/pages/spot/spot?id=' + code(s),
        skus: spotSkus(s, ticket ? { price: priceFen } : null),
        rankLabel: ranks[code(s)] || ''
      }, { priceFen: priceFen, unit: '起' })
    })
  } else if (code === 'hanfu') {
    layout = 'photo'
    chips = ['全部', '汉', '唐', '宋', '明']
    items = garments.map((g) => ({
      id: code(g),
      name: g.name,
      photo: photo(g),
      meta: (g.era || '') + ' · 形制介绍',
      place: g.era,
      type: 'garment',
      path: '/pages/garment/garment?id=' + code(g)
    }))
  } else if (code === 'guide') {
    layout = 'photo'
    items = articles.map((a) => ({
      id: a.article_code || a.id,
      name: a.title,
      photo: photo(a) || photo(spots[0]),
      meta: (a.mark || '') + ' · 文化',
      path: '/pages/article/article?id=' + (a.article_code || a.id)
    }))
  } else if (code === 'show') {
    layout = 'photo'
    chips = ['全部', '广州', '桂林', '敦煌']
    items = events.map((e) => ({
      id: code(e),
      name: e.title,
      photo: photo(e),
      meta: ((e.day || '') + ' · ' + (e.place || '')).replace(/^ · | · $/g, '') || '活动介绍',
      place: e.place,
      path: '/pages/event/event?id=' + code(e)
    }))
    if (!items.length) {
      items = services.filter((s) => s.type === 'show').map((s) => ({
        id: code(s),
        name: s.name,
        photo: photo(s) || photo(findCode(spots, s.spot_id) || spots[0]),
        meta: (s.place || '') + ' · 仅介绍',
        place: s.place,
        path: '/pages/service/service?id=' + code(s)
      }))
    }
  } else if (code === 'food' || code === 'hotel') {
    layout = 'photo'
    chips = ['全部', '广州', '桂林', '敦煌']
    const typ = code === 'hotel' ? 'hotel' : 'food'
    items = services.filter((s) => s.type === typ).map((s) => ({
      id: code(s),
      name: s.name,
      photo: photo(s) || photo(findCode(spots, s.spot_id) || spots[0]),
      meta: (s.place || '') + ' · ' + typeLabel(typ),
      place: s.place,
      path: '/pages/service/service?id=' + code(s)
    }))
  } else {
    layout = 'deal'
    chips = ['全部', '广州', '桂林', '敦煌']
    let rows = services
    if (code === 'ticket') rows = services.filter((s) => canSell(s.type))
    else rows = services.filter((s) => s.type === code && canSell(s.type))
    items = rows.map((s) => {
      const priceFen = Number(s.price) >= 80 ? Number(s.price) : Math.round(Number(s.price || 0) * 100)
      return decorateDeal({
        id: code(s),
        name: s.name,
        photo: photo(s) || photo(findCode(spots, s.spot_id) || spots[0]),
        place: s.place,
        day: s.day,
        type: s.type,
        path: '/pages/service/service?id=' + code(s),
        skus: skusForType(s.type, code(s), priceFen)
      }, { priceFen: priceFen, unit: '起', notes: s.notes })
    })
  }

  return {
    title,
    hero,
    heroName: title,
    heroMeta: '广州 · 桂林 · 敦煌',
    chips,
    layout,
    items
  }
}

function scrubLabel(text) {
  return String(text || '')
    .replace(/门票/g, '入园')
    .replace(/酒店/g, '住宿')
    .replace(/^演出$/, '活动')
}

const HOME_CACHE_KEY = 'home_cache_v2'

function shellHome() {
  return {
    categories: normalizeHomeCategories(CAT_META.map((c) => ({ id: c.id, name: c.name, icon: '' }))),
    banners: [],
    rankings: [],
    feed: [],
    tabs: ['精选', '周边', '国内', '海外']
  }
}

function readHomeCache() {
  try {
    const raw = wx.getStorageSync(HOME_CACHE_KEY)
    if (raw && (raw.categories || []).length) return raw
  } catch (e) {}
  return null
}

function writeHomeCache(data) {
  try {
    if (data && (data.categories || []).length) {
      wx.setStorageSync(HOME_CACHE_KEY, {
        categories: data.categories,
        banners: data.banners || [],
        rankings: data.rankings || [],
        feed: data.feed || [],
        tabs: data.tabs || ['精选', '周边', '国内', '海外'],
        cachedAt: Date.now()
      })
    }
  } catch (e) {}
}

function fetchHome() {
  return api.get('/api/content/home').then((data) => {
    const hasBody = data && (
      (data.banners || []).length ||
      (data.rankings || []).length ||
      (data.feed || []).length
    )
    if (hasBody) {
      data.categories = normalizeHomeCategories(data.categories || [])
      writeHomeCache(data)
      return data
    }
    // 仅有分类壳（DB 挂了时的 FALLBACK）不算成功，走缓存/拼装
    throw new Error('empty home')
  }).catch(() => {
    const cached = readHomeCache()
    if (cached && ((cached.banners || []).length || (cached.feed || []).length)) return cached
    return loadBundle()
      .then(assembleHome)
      .then((data) => {
        if (!(data.banners || []).length && !(data.feed || []).length) {
          return cached || shellHome()
        }
        writeHomeCache(data)
        return data
      })
      .catch(() => cached || shellHome())
  })
}

function fetchChannel(code) {
  return api.get('/api/content/channel/' + code).then((data) => {
    if (data && data.title && (data.items || []).length) return data
    throw new Error('empty channel')
  }).catch(() => loadBundle().then((bundle) => assembleChannel(code, bundle)))
}

function adaptSpot(data) {
  if (!data) return null
  if (data.item) {
    if (Array.isArray(data.groups)) {
      data.groups = data.groups.map((g) => Object.assign({}, g, {
        title: groupTitle(g.type) || g.title,
        list: (g.list || []).map((s) => Object.assign({}, s, {
          sellable: canSell(s.type),
          priceLabel: canSell(s.type) ? undefined : '参考'
        }))
      }))
    }
    return data
  }
  const services = data.services || []
  const groupsMap = {}
  services.forEach((s) => {
    const type = s.type || 'other'
    if (!groupsMap[type]) groupsMap[type] = { type, title: groupTitle(type), list: [] }
    groupsMap[type].list.push(Object.assign({}, s, {
      id: code(s),
      photo: photo(s),
      price: money(s.price),
      sellable: canSell(type)
    }))
  })
  const ticket = services.find((s) => canSell(s.type))
  return {
    item: {
      id: code(data),
      name: data.name,
      photo: photo(data),
      city: data.city,
      open: data.open_time || data.open,
      stay: data.stay,
      intro: data.intro,
      hanfu: data.hanfu_tip || data.hanfu
    },
    related: (data.events || []).map((e) => Object.assign({}, e, { id: code(e), photo: photo(e) })),
    groups: Object.values(groupsMap),
    checkins: data.checkins || [],
    wears: (data.garments || data.wears || []).map((g) => Object.assign({}, g, { id: code(g), photo: photo(g) })),
    ticket: ticket ? Object.assign({}, ticket, { id: code(ticket), photo: photo(ticket), price: money(ticket.price) }) : null
  }
}

function adaptService(data) {
  if (!data) return null
  const item = data.item || data
  const spot = data.spot || null
  const type = item.type || ''
  return {
    item: Object.assign({}, item, {
      id: code(item),
      photo: photo(item),
      price: money(item.price),
      notes: item.notes || [],
      sellable: canSell(type)
    }),
    spot: spot ? Object.assign({}, spot, { id: code(spot), photo: photo(spot) }) : null,
    typeName: data.typeName || typeLabel(type) || '介绍'
  }
}

function adaptGarment(data) {
  if (!data) return null
  const item = Object.assign({}, data, {
    id: code(data),
    photo: photo(data),
    tags: parseMaybe(data.tags, []),
  })
  return {
    item,
    related: data.related || data.events || [],
    spots: (data.spots || []).map((s) => Object.assign({}, s, { id: code(s), photo: photo(s) }))
  }
}

module.exports = { fetchHome, fetchChannel, asList, code, photo, money, loadBundle, adaptSpot, adaptService, adaptGarment, shellHome, readHomeCache }

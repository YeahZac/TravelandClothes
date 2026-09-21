const express = require('express')
const router = express.Router()
const db = require('../config/database')
const { success, fail } = require('../utils/response')
const { mapRows, resolveUrl, yuan, parseJson } = require('../utils/media')
const { decorateDeal, feedTitle, spotSkus, rentSkus } = require('../utils/deals')

const TYPE_NAMES = {
  ticket: '门票', free: '免费通行', hotel: '酒店', car: '租车',
  show: '演出', rent: '汉服租赁', float: '花车', shop: '文创', food: '美食'
}

function normalizeSpot(spot, ticket) {
  const price = ticket ? yuan(ticket.price) : '0'
  return {
    id: spot.spot_code || String(spot.id),
    name: spot.name,
    city: spot.city,
    region: spot.region,
    level: spot.level,
    photo: spot.photo,
    open: spot.open_time,
    stay: spot.stay,
    intro: spot.intro,
    hanfu: spot.hanfu_tip,
    ticketId: ticket ? (ticket.service_code || ticket.id) : '',
    ticketPrice: Number(price),
    sold: ticket && Number(ticket.price) === 0 ? '免费' : (ticket ? '门市价' : ''),
    price: price
  }
}

function normalizeService(row) {
  const price = yuan(row.price)
  return {
    id: row.service_code || String(row.id),
    type: row.type,
    name: row.name,
    spotId: row.spot_id,
    price: price,
    day: row.day,
    place: row.place,
    desc: row.desc,
    photo: row.photo || row.cover,
    cover: row.cover,
    notes: parseJson(row.notes, []),
    open: row.day
  }
}

function normalizeGarment(row) {
  return Object.assign({}, row, {
    id: row.garment_code || String(row.id),
    tags: parseJson(row.tags, []),
    era: row.era,
    occasion: row.occasion
  })
}

function normalizeEvent(row) {
  return Object.assign({}, row, {
    id: row.event_code || String(row.id)
  })
}

function spotFromBanner(row) {
  const blob = String(row.title || '') + ' ' + String(row.link || '')
  if (/id=/.test(row.link || '')) {
    const m = String(row.link).match(/id=([^&]+)/)
    if (m) return m[1]
  }
  if (/陈家|广州/.test(blob)) return 'chen'
  if (/桂林|漓江|象鼻/.test(blob)) return 'xiangbi'
  if (/敦煌|月牙|莫高/.test(blob)) return 'yuequan'
  return ''
}

async function servicePhoto(row) {
  return resolveUrl(row.cover || row.spot_photo || row.photo)
}

async function ticketsBySpotIds(ids) {
  if (!ids.length) return {}
  const [rows] = await db.query(
    `SELECT * FROM services WHERE status = 1 AND type IN ('ticket','free') AND spot_id IN (${ids.map(() => '?').join(',')})`,
    ids
  )
  const map = {}
  rows.forEach((row) => {
    if (!map[row.spot_id]) map[row.spot_id] = row
  })
  return map
}

const FALLBACK_CATS = [
  { cat_code: 'hot', name: '热门', icon: '/images/photo/cat-hot.png', hero: '/images/photo/banner-dunhuang.jpg', page_type: 'hot' },
  { cat_code: 'spots', name: '景区', icon: '/images/photo/cat-spots.png', hero: '/images/photo/banner-guilin.jpg', page_type: 'spots' },
  { cat_code: 'hanfu', name: '汉服', icon: '/images/photo/cat-hanfu.png', hero: '/images/photo/banner-guangzhou.jpg', page_type: 'hanfu' },
  { cat_code: 'food', name: '美食', icon: '/images/photo/cat-food.png', hero: '/images/photo/spot-lizhiwan.jpg', page_type: 'food' },
  { cat_code: 'hotel', name: '酒店', icon: '/images/photo/cat-hotel.png', hero: '/images/photo/hotel-gz.jpg', page_type: 'hotel' },
  { cat_code: 'ticket', name: '门票', icon: '/images/photo/cat-ticket.png', hero: '/images/photo/spot-yuequan.jpg', page_type: 'ticket' },
  { cat_code: 'show', name: '演出', icon: '/images/photo/cat-show.png', hero: '/images/photo/event-opening.jpg', page_type: 'show' },
  { cat_code: 'guide', name: '攻略', icon: '/images/photo/cat-guide.png', hero: '/images/photo/spot-mogao.jpg', page_type: 'guide' }
]

router.get('/home', async (req, res) => {
  try {
    let cats = []
    try {
      const [rows] = await db.query('SELECT * FROM home_cats WHERE status = 1 ORDER BY sort_order')
      cats = rows
    } catch (e) {}
    if (!cats.length) cats = FALLBACK_CATS
    let banners = []
    try {
      const [rows] = await db.query('SELECT * FROM banners WHERE status = 1 ORDER BY sort_order')
      banners = rows
    } catch (e) {}
    let ranks = []
    try {
      const [rows] = await db.query(
        `SELECT r.rank, r.label AS stat, s.spot_code AS spotId, s.name, s.photo
         FROM rankings r JOIN spots s ON r.spot_id = s.id ORDER BY r.rank`
      )
      ranks = rows
    } catch (e) {}
    let feed = []
    try {
      const [posts] = await db.query(
        `SELECT p.*, u.nickname, u.avatar_url FROM posts p
         JOIN members m ON p.member_id = m.id JOIN users u ON m.user_id = u.id
         WHERE p.status = 1 ORDER BY p.created_at DESC LIMIT 12`
      )
      feed = await Promise.all((posts || []).map(async (p) => {
        let images = p.images
        try { if (typeof images === 'string') images = JSON.parse(images) } catch (e) { images = [] }
        const photo = (images && images[0]) || ''
        return {
          id: 'p' + p.id,
          type: p.type || 'checkin',
          photo: await resolveUrl(photo),
          title: feedTitle({ content: p.content, name: p.location, id: 'p' + p.id }),
          user: p.nickname || '同袍',
          avatar: await resolveUrl(p.avatar_url || '/images/photo/avatar-01.jpg'),
          likes: p.likes || 0,
          spotId: p.scene_id || ''
        }
      }))
    } catch (e) {}
    if (!feed.length) {
      try {
        const [checkins] = await db.query(
          `SELECT c.*, s.spot_code, s.region, s.city
           FROM checkin_spots c LEFT JOIN spots s ON c.spot_id = s.id
           WHERE c.status = 1 ORDER BY c.sort_order LIMIT 12`
        )
        feed = await Promise.all((checkins || []).map(async (c, i) => ({
          id: 'c' + c.id,
          type: 'checkin',
          photo: await resolveUrl(c.photo),
          title: feedTitle(c),
          user: i % 2 ? '旅行家' : '同袍达人',
          avatar: await resolveUrl(i % 2 ? '/images/photo/avatar-02.jpg' : '/images/photo/avatar-01.jpg'),
          likes: 128 + i * 37,
          spotId: c.spot_code || '',
          region: c.region || c.city || ''
        })))
      } catch (e) {}
    }
    const catRows = await mapRows(cats, ['icon', 'hero'])
    success(res, {
      categories: catRows.map((c) => ({
        id: c.cat_code, name: c.name, icon: c.icon
      })),
      banners: (await mapRows(banners, ['image'])).map((b) => ({
        id: 'b' + b.id,
        name: b.title,
        photo: b.image,
        meta: '广州 · 桂林 · 敦煌',
        link: b.link,
        spotId: spotFromBanner(b)
      })),
      rankings: await mapRows(ranks),
      feed,
      tabs: ['精选', '周边', '国内', '海外']
    })
  } catch (e) {
    console.error(e)
    fail(res, '首页加载失败: ' + e.message)
  }
})

router.get('/channel/:code', async (req, res) => {
  try {
    const code = req.params.code
    const [[cat]] = await db.query('SELECT * FROM home_cats WHERE cat_code = ?', [code]).catch(() => [[null]])
    const title = (cat && cat.name) || '列表'
    const hero = await resolveUrl((cat && cat.hero) || '/images/photo/banner-guangzhou.jpg')
    const pageType = (cat && cat.page_type) || code
    let chips = []
    let items = []
    let layout = 'list'

    const RANK_LABELS = {
      yuequan: '汉服出行榜 · 敦煌第 1 名',
      xiangbi: '最热打卡榜 · 桂林第 1 名',
      chen: '砖雕取景榜 · 广州第 1 名',
      lizhiwan: '夜游灯会榜 · 广州第 2 名',
      mogao: '形制对照榜 · 敦煌第 2 名',
      yangshuo: '换装体验榜 · 阳朔第 1 名'
    }

    if (pageType === 'hot' || pageType === 'spots') {
      layout = 'deal'
      chips = ['全部', '广州', '桂林', '敦煌']
      const [spots] = await db.query('SELECT * FROM spots WHERE status = 1 ORDER BY sort_order')
      const tickets = await ticketsBySpotIds(spots.map((s) => s.id))
      let list = spots
      if (pageType === 'hot') {
        const [ranks] = await db.query('SELECT spot_id FROM rankings ORDER BY rank').catch(() => [[]])
        const ids = (ranks || []).map((r) => r.spot_id)
        list = spots.filter((s) => ids.indexOf(s.id) !== -1)
        if (!list.length) list = spots.slice(0, 8)
      }
      items = await Promise.all(list.map(async (s) => {
        const ticket = tickets[s.id]
        const n = normalizeSpot(s, ticket)
        n.photo = await resolveUrl(s.photo)
        n.place = (s.city || '') + (s.region && s.region !== s.city ? ' · ' + s.region : '')
        n.path = '/pages/spot/spot?id=' + n.id
        n.skus = spotSkus(s, ticket)
        n.rankLabel = RANK_LABELS[n.id] || ''
        return decorateDeal(n, {
          priceFen: ticket ? Number(ticket.price || 0) : 0,
          priceLabel: ticket && Number(ticket.price) ? undefined : '免费',
          unit: '起',
          notes: ticket && ticket.notes
        })
      }))
    } else if (pageType === 'hanfu') {
      layout = 'deal'
      chips = ['全部', '汉', '唐', '宋', '明', '租赁']
      const [rows] = await db.query('SELECT * FROM garments WHERE status = 1 ORDER BY sort_order')
      const [rents] = await db.query(`SELECT * FROM services WHERE status = 1 AND type = 'rent' ORDER BY sort_order`)
      const garmentItems = await Promise.all(rows.map(async (g) => {
        const n = normalizeGarment(g)
        n.photo = await resolveUrl(g.photo)
        n.place = n.era
        n.type = 'garment'
        n.path = '/pages/garment/garment?id=' + n.id
        n.skus = rentSkus('rt-gz', 16800)
        n.rankLabel = (n.occasion || '出行') + ' · 可租可拍'
        return decorateDeal(n, { priceFen: 16800, unit: '起', priceLabel: undefined })
      }))
      const rentItems = await Promise.all((rents || []).map(async (row) => {
        const n = normalizeService(row)
        n.photo = await servicePhoto(row)
        n.type = 'rent'
        n.path = '/pages/service/service?id=' + n.id
        n.skus = rentSkus(n.id, Number(row.price || 0))
        n.rankLabel = '汉服租赁 · ' + (n.place || '')
        return decorateDeal(n, { priceFen: Number(row.price || 0), unit: '起', notes: row.notes })
      }))
      items = garmentItems.concat(rentItems)
    } else if (pageType === 'guide') {
      layout = 'photo'
      let rows = []
      try {
        const [list] = await db.query('SELECT * FROM travel_guides WHERE status = 1 ORDER BY sort_order')
        rows = list
      } catch (e) {}
      if (rows.length) {
        items = await Promise.all(rows.map(async (g) => ({
          id: g.guide_code,
          name: g.title,
          photo: await resolveUrl(g.photo),
          meta: g.place + ' · ' + g.summary,
          place: g.place,
          summary: g.summary,
          path: '/pages/article/article?id=' + g.guide_code
        })))
      } else {
        const [arts] = await db.query('SELECT * FROM articles WHERE status = 1 ORDER BY sort_order')
        items = await Promise.all((arts || []).map(async (a) => ({
          id: a.article_code || String(a.id),
          name: a.title,
          photo: await resolveUrl(a.photo || '/images/photo/spot-mogao.jpg'),
          meta: a.mark || '攻略',
          path: '/pages/article/article?id=' + (a.article_code || a.id)
        })))
      }
    } else {
      layout = 'deal'
      const type = pageType === 'ticket' ? null : pageType
      let sql = 'SELECT s.*, sp.photo AS spot_photo, sp.city, sp.region, sp.level FROM services s LEFT JOIN spots sp ON s.spot_id = sp.id WHERE s.status = 1'
      const params = []
      if (pageType === 'ticket') sql += ' AND s.type IN ("ticket","free")'
      else if (type) { sql += ' AND s.type = ?'; params.push(type) }
      sql += ' ORDER BY s.sort_order'
      const [rows] = await db.query(sql, params)
      const units = { rent: '起', hotel: '起', food: '起', ticket: '起', show: '起', car: '起' }
      items = await Promise.all(rows.map(async (row) => {
        const n = normalizeService(row)
        n.photo = await servicePhoto(row)
        n.place = n.place || [row.city, row.region].filter(Boolean).join(' · ')
        n.level = row.level || TYPE_NAMES[row.type] || ''
        n.path = '/pages/service/service?id=' + n.id
        if (row.type === 'rent') n.skus = rentSkus(n.id, Number(row.price || 0))
        else if (row.type === 'ticket' || row.type === 'free') {
          n.skus = spotSkus({ spot_code: n.id }, row)
        }
        n.rankLabel = RANK_LABELS[n.spotId] || ((TYPE_NAMES[row.type] || '') + (n.place ? ' · ' + n.place : ''))
        return decorateDeal(n, {
          priceFen: Number(row.price || 0),
          unit: units[row.type] || '起',
          notes: row.notes
        })
      }))
    }

    success(res, {
      title,
      hero,
      heroName: title,
      heroMeta: '广州 · 桂林 · 敦煌',
      chips,
      layout,
      items
    })
  } catch (e) {
    console.error(e)
    fail(res, '列表加载失败: ' + e.message)
  }
})

router.get('/spot/list', async (req, res) => {
  try {
    const { city } = req.query
    let sql = 'SELECT * FROM spots WHERE status = 1'
    const params = []
    if (city && city !== '全部') { sql += ' AND (city = ? OR region = ?)'; params.push(city, city) }
    sql += ' ORDER BY sort_order'
    const [rows] = await db.query(sql, params)
    const tickets = await ticketsBySpotIds(rows.map((s) => s.id))
    const list = await Promise.all(rows.map(async (s) => {
      const n = normalizeSpot(s, tickets[s.id])
      n.photo = await resolveUrl(s.photo)
      return n
    }))
    success(res, list)
  } catch (e) { fail(res, '查询失败') }
})

router.get('/spot/:id', async (req, res) => {
  try {
    const [[spot]] = await db.query('SELECT * FROM spots WHERE id = ? OR spot_code = ?', [req.params.id, req.params.id])
    if (!spot) return fail(res, '景区不存在')
    const [events] = await db.query('SELECT * FROM events WHERE spot_id = ? AND status = 1', [spot.id])
    const [services] = await db.query(
      `SELECT s.*, sp.photo AS spot_photo FROM services s LEFT JOIN spots sp ON s.spot_id = sp.id
       WHERE s.status = 1 AND s.spot_id = ? ORDER BY s.sort_order`,
      [spot.id]
    )
    const [checkins] = await db.query('SELECT * FROM checkin_spots WHERE spot_id = ? AND status = 1', [spot.id])
    const [garments] = await db.query('SELECT g.* FROM garments g JOIN garment_spots gs ON g.id = gs.garment_id WHERE gs.spot_id = ? AND g.status = 1', [spot.id])
    const ticket = (services || []).find((s) => s.type === 'ticket' || s.type === 'free') || null
    const groupsMap = {}
    for (const s of services || []) {
      if (!groupsMap[s.type]) groupsMap[s.type] = { type: s.type, title: TYPE_NAMES[s.type] || s.type, list: [] }
      const item = normalizeService(s)
      item.photo = await servicePhoto(s)
      groupsMap[s.type].list.push(item)
    }
    const item = normalizeSpot(spot, ticket)
    item.photo = await resolveUrl(spot.photo)
    success(res, {
      item,
      related: (await mapRows(events)).map(normalizeEvent),
      groups: Object.values(groupsMap),
      checkins: await mapRows(checkins),
      wears: (await mapRows(garments)).map(normalizeGarment),
      ticket: ticket ? Object.assign(normalizeService(ticket), { photo: await servicePhoto(ticket) }) : null
    })
  } catch (e) {
    console.error(e)
    fail(res, '查询失败')
  }
})

router.get('/event/list', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM events WHERE status = 1 ORDER BY sort_order')
    success(res, (await mapRows(rows)).map(normalizeEvent))
  } catch (e) { fail(res, '查询失败') }
})

router.get('/event/:id', async (req, res) => {
  try {
    const [[event]] = await db.query('SELECT * FROM events WHERE id = ? OR event_code = ?', [req.params.id, req.params.id])
    if (!event) return fail(res, '活动不存在')
    const [[spot]] = await db.query('SELECT * FROM spots WHERE id = ?', [event.spot_id])
    const [[garment]] = await db.query('SELECT * FROM garments WHERE id = ?', [event.garment_id])
    let [services] = await db.query(
      `SELECT s.*, sp.photo AS spot_photo FROM services s
       JOIN event_services es ON s.id = es.service_id
       LEFT JOIN spots sp ON s.spot_id = sp.id
       WHERE es.event_id = ? AND s.status = 1`,
      [event.id]
    )
    if (!services.length && event.spot_id) {
      const [fallback] = await db.query(
        `SELECT s.*, sp.photo AS spot_photo FROM services s LEFT JOIN spots sp ON s.spot_id = sp.id
         WHERE s.status = 1 AND s.spot_id = ? ORDER BY s.sort_order LIMIT 4`,
        [event.spot_id]
      )
      services = fallback
    }
    const mappedServices = await Promise.all((services || []).map(async (row) => {
      const n = normalizeService(row)
      n.photo = await servicePhoto(row)
      return n
    }))
    success(res, {
      item: Object.assign(normalizeEvent(event), { photo: await resolveUrl(event.photo) }),
      spot: spot ? Object.assign(normalizeSpot(spot), { photo: await resolveUrl(spot.photo) }) : null,
      garment: garment ? Object.assign(normalizeGarment(garment), { photo: await resolveUrl(garment.photo) }) : null,
      services: mappedServices
    })
  } catch (e) { fail(res, '查询失败') }
})

router.get('/service/list', async (req, res) => {
  try {
    const { type, spotId } = req.query
    let sql = 'SELECT s.*, sp.photo AS spot_photo FROM services s LEFT JOIN spots sp ON s.spot_id = sp.id WHERE s.status = 1'
    const params = []
    if (type && type !== 'all') { sql += ' AND s.type = ?'; params.push(type) }
    if (spotId) { sql += ' AND s.spot_id = ?'; params.push(spotId) }
    sql += ' ORDER BY s.sort_order'
    const [rows] = await db.query(sql, params)
    const mapped = await Promise.all(rows.map(async (row) => {
      const next = normalizeService(row)
      next.photo = await servicePhoto(row)
      return next
    }))
    success(res, {
      list: mapped,
      types: [{ id: 'all', name: '全部' }].concat(Object.keys(TYPE_NAMES).map((id) => ({ id, name: TYPE_NAMES[id] })))
    })
  } catch (e) { fail(res, '查询失败') }
})

router.get('/service/:id', async (req, res) => {
  try {
    const [[service]] = await db.query(
      `SELECT s.*, sp.photo AS spot_photo FROM services s LEFT JOIN spots sp ON s.spot_id = sp.id
       WHERE s.id = ? OR s.service_code = ?`,
      [req.params.id, req.params.id]
    )
    if (!service) return fail(res, '服务不存在')
    const [[spot]] = await db.query('SELECT * FROM spots WHERE id = ?', [service.spot_id])
    const item = normalizeService(service)
    item.photo = await servicePhoto(service)
    item.notes = item.notes || []
    success(res, {
      item,
      spot: spot ? Object.assign(normalizeSpot(spot), { photo: await resolveUrl(spot.photo) }) : null,
      typeName: TYPE_NAMES[service.type] || '服务'
    })
  } catch (e) { fail(res, '查询失败') }
})

router.get('/garment/list', async (req, res) => {
  try {
    const { era } = req.query
    let sql = 'SELECT * FROM garments WHERE status = 1'
    const params = []
    if (era && era !== '全部') { sql += ' AND era LIKE ?'; params.push('%' + era + '%') }
    sql += ' ORDER BY sort_order'
    const [rows] = await db.query(sql, params)
    success(res, (await mapRows(rows)).map(normalizeGarment))
  } catch (e) { fail(res, '查询失败') }
})

router.get('/garment/:id', async (req, res) => {
  try {
    const [[garment]] = await db.query('SELECT * FROM garments WHERE id = ? OR garment_code = ?', [req.params.id, req.params.id])
    if (!garment) return fail(res, '形制不存在')
    const [spots] = await db.query('SELECT s.* FROM spots s JOIN garment_spots gs ON s.id = gs.spot_id WHERE gs.garment_id = ? AND s.status = 1', [garment.id])
    const [events] = await db.query('SELECT * FROM events WHERE garment_id = ? AND status = 1', [garment.id])
    success(res, Object.assign(normalizeGarment(garment), {
      photo: await resolveUrl(garment.photo),
      spots: await Promise.all((spots || []).map(async (s) => Object.assign(normalizeSpot(s), { photo: await resolveUrl(s.photo) }))),
      events: (await mapRows(events)).map(normalizeEvent),
      related: (await mapRows(events)).map(normalizeEvent)
    }))
  } catch (e) { fail(res, '查询失败') }
})

router.get('/article/list', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM articles WHERE status = 1 ORDER BY sort_order')
    success(res, rows.map((row) => ({
      id: row.article_code || String(row.id),
      title: row.title,
      tone: row.tone,
      mark: row.mark,
      lines: parseJson(row.summary_lines, []),
      body: parseJson(row.body, [])
    })))
  } catch (e) { fail(res, '查询失败') }
})

router.get('/article/:id', async (req, res) => {
  try {
    let [[row]] = await db.query('SELECT * FROM articles WHERE id = ? OR article_code = ?', [req.params.id, req.params.id])
    if (!row) {
      const [[guide]] = await db.query('SELECT * FROM travel_guides WHERE guide_code = ? OR id = ?', [req.params.id, req.params.id])
      if (!guide) return fail(res, '文章不存在')
      success(res, {
        id: guide.guide_code,
        title: guide.title,
        photo: await resolveUrl(guide.photo),
        tone: 'mint',
        mark: '攻',
        lines: [guide.place, guide.summary].filter(Boolean),
        body: guide.body ? [guide.body] : []
      })
      return
    }
    success(res, {
      id: row.article_code || String(row.id),
      title: row.title,
      tone: row.tone,
      mark: row.mark,
      lines: parseJson(row.summary_lines, []),
      body: parseJson(row.body, [])
    })
  } catch (e) { fail(res, '查询失败') }
})

router.get('/checkin/list', async (req, res) => {
  try {
    const { spotId } = req.query
    let sql = `SELECT c.*, s.spot_code FROM checkin_spots c LEFT JOIN spots s ON c.spot_id = s.id WHERE c.status = 1`
    const params = []
    if (spotId) { sql += ' AND (c.spot_id = ? OR s.spot_code = ?)'; params.push(spotId, spotId) }
    sql += ' ORDER BY c.sort_order'
    const [rows] = await db.query(sql, params)
    const mapped = await Promise.all((rows || []).map(async (row) => {
      const next = Object.assign({}, row, {
        spotId: row.spot_code || row.spot_id,
        photo: await resolveUrl(row.photo)
      })
      return next
    }))
    success(res, mapped)
  } catch (e) { fail(res, '查询失败') }
})

router.get('/guide/list', async (req, res) => {
  try {
    const [guides] = await db.query('SELECT * FROM guides ORDER BY sort_order')
    const [taboos] = await db.query('SELECT * FROM taboos ORDER BY sort_order')
    success(res, { guides, taboos })
  } catch (e) { fail(res, '查询失败') }
})

router.get('/quiz/questions', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM quiz_questions WHERE status = 1 ORDER BY sort_order')
    success(res, rows.map((row) => ({
      q: row.question,
      options: parseJson(row.options, []),
      answer: row.answer,
      explain: row.explain
    })))
  } catch (e) { fail(res, '查询失败') }
})

router.post('/quiz/submit', async (req, res) => {
  try {
    const { userId, score, total } = req.body
    const [[member]] = await db.query('SELECT id FROM members WHERE user_id = ?', [userId])
    if (member) {
      await db.query('INSERT INTO quiz_records (member_id, score, total) VALUES (?, ?, ?)', [member.id, score, total])
    }
    success(res, null, '提交成功')
  } catch (e) { fail(res, '提交失败') }
})

router.get('/banner/list', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM banners WHERE status = 1 ORDER BY sort_order')
    success(res, await mapRows(rows, ['image']))
  } catch (e) { fail(res, '查询失败') }
})

router.get('/feed', async (req, res) => {
  try {
    const [posts] = await db.query(
      `SELECT p.*, u.nickname, u.avatar_url FROM posts p
       JOIN members m ON p.member_id = m.id JOIN users u ON m.user_id = u.id
       WHERE p.status = 1 ORDER BY p.created_at DESC LIMIT 30`
    )
    const mapped = await Promise.all((posts || []).map(async (p) => {
      const images = parseJson(p.images, [])
      const resolved = await Promise.all((images || []).map((src) => resolveUrl(src)))
      return {
        id: String(p.id),
        user: p.nickname || '同袍',
        avatar: await resolveUrl(p.avatar_url || '/images/photo/avatar-01.jpg'),
        time: p.created_at ? String(p.created_at).slice(0, 16) : '',
        location: p.location || '',
        text: p.content || '',
        images: resolved,
        likes: p.likes || 0,
        comments: p.comments || 0,
        liked: false,
        region: p.location || ''
      }
    }))
    const stories = mapped.slice(0, 8).map((p) => ({ id: 's' + p.id, name: p.user, avatar: p.avatar }))
    success(res, { posts: mapped, stories })
  } catch (e) {
    fail(res, '动态加载失败')
  }
})

router.get('/category/list', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM home_cats WHERE status = 1 ORDER BY sort_order')
    success(res, await mapRows(rows, ['icon', 'hero']))
  } catch (e) { fail(res, '查询失败') }
})

router.get('/inbox', async (req, res) => {
  try {
    const [convs] = await db.query('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 20')
    const [notes] = await db.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20')
    const kindMap = {
      like: { kind: 'comment', mark: '赞', color: '#21c7b1' },
      comment: { kind: 'comment', mark: '评', color: '#21c7b1' },
      fan: { kind: 'fans', mark: '粉', color: '#d9893b' },
      at: { kind: 'at', mark: '@', color: '#5b9ef0' },
      system: { kind: 'at', mark: '系', color: '#5b9ef0' },
      order: { kind: 'comment', mark: '单', color: '#21c7b1' },
      benefit: { kind: 'comment', mark: '卡', color: '#21c7b1' }
    }
    const chats = await Promise.all((convs || []).map(async (c) => ({
      id: String(c.id),
      name: c.target_name,
      avatar: await resolveUrl(c.target_avatar || '/images/photo/avatar-01.jpg'),
      last: c.last_message,
      time: c.updated_at ? String(c.updated_at).slice(5, 16) : '',
      unread: c.unread || 0
    })))
    const notices = (notes || []).map((n) => {
      const meta = kindMap[n.type] || kindMap.system
      return {
        id: String(n.id),
        kind: meta.kind,
        title: n.title,
        text: n.content,
        time: n.created_at ? String(n.created_at).slice(5, 16) : '',
        mark: meta.mark,
        color: meta.color
      }
    })
    success(res, { chats, notices })
  } catch (e) { fail(res, '消息加载失败') }
})

module.exports = router

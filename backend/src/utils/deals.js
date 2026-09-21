function stamp(id) {
  let n = 2166136261
  const s = String(id || '')
  for (let i = 0; i < s.length; i++) n = Math.imul(n ^ s.charCodeAt(i), 16777619)
  return n >>> 0
}

function yuanFen(fen) {
  const n = Number(fen || 0)
  if (!n) return '0'
  if (n % 100 === 0) return String(n / 100)
  return (n / 100).toFixed(1)
}

function parseNotes(raw) {
  if (Array.isArray(raw)) return { tags: raw }
  if (raw && typeof raw === 'object') return raw
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    if (Array.isArray(v)) return { tags: v }
    return v || {}
  } catch (e) {
    return {}
  }
}

const CROWDS = ['客流适中', '今日舒适', '建议错峰']
const TAG_SETS = [
  ['随时随用', '可订明日', '随时退'],
  ['今日可用', '过期退', '可订明日'],
  ['汉服友好', '随时退', '可订明日']
]

function soldText(h, priceFen) {
  if (!Number(priceFen)) return '免费通行'
  const n = 120 + (h % 24000)
  if (n >= 10000) return Math.round(n / 1000) / 10 + '万+'
  return String(n)
}

function decorateDeal(item, opts) {
  const next = Object.assign({}, item)
  const id = next.id || next.name || 'x'
  const h = stamp(id)
  const notes = parseNotes(opts && opts.notes)
  const priceFen = Number((opts && opts.priceFen) != null ? opts.priceFen : (Number(next.price) >= 50 ? Number(next.price) : Number(next.price) * 100)) || 0
  const originFen = Number(notes.originFen) || (priceFen ? Math.round(priceFen * (1.16 + (h % 28) / 100)) : 0)
  const price = notes.price || (priceFen ? yuanFen(priceFen) : '0')
  const origin = notes.origin || (originFen ? yuanFen(originFen) : '')
  const off = originFen && priceFen ? Math.max(0, Math.round((originFen - priceFen) / 100)) : 0
  const unit = (opts && opts.unit) || (price === '0' ? '' : '起')
  next.badge = notes.badge || (price === '0' ? '免费' : '价保')
  next.score = notes.score || (3.9 + (h % 10) / 10).toFixed(1)
  next.reviews = notes.reviews || (260 + (h % 8600))
  next.crowd = notes.crowd || CROWDS[h % CROWDS.length]
  next.place = next.place || next.city || next.region || ''
  next.tags = notes.tags && notes.tags.length ? notes.tags : TAG_SETS[h % TAG_SETS.length]
  next.rankLabel = notes.rankLabel || next.rankLabel || ''
  next.skus = notes.skus || next.skus || []
  next.price = price
  next.origin = origin
  next.off = notes.off || (off ? String(off) : '')
  next.sold = notes.sold || soldText(h, priceFen)
  next.unit = unit
  next.priceLabel = (opts && opts.priceLabel) || (price === '0' ? '免费' : ('¥' + price + (unit ? unit : '')))
  if (!next.meta) {
    next.meta = next.place + (price === '0' ? '' : (' · ¥' + price + unit))
  }
  return next
}

const FEED_TITLES = {
  'ck-chen': '陈家祠砖雕前把马面裙门摆正，避开午后导游团。灰塑吃侧面光，交领不要被补光灯打翻白。',
  'ck-lizhiwan': '荔枝湾石桥先提摆再上台阶，骑楼廊道袖不要横扫行人。夜灯起来之后，明制交领最稳。',
  'ck-xiangbi': '象鼻山水月洞外倒影只要三分钟窗口。江风大，披帛别在腰后，襦裙短摆比齐胸安全。',
  'ck-yuequan': '月牙泉日落档十六点前入园。沙地改平底鞋，宽摆会灌沙，圆领袍比曳地裙好走。',
  'ck-yuyin': '余荫山房曲廊适合慢走，褙子过膝但不拖地。窄桥提摆，不要为了构图挡别人过廊。',
  'ck-baiyun': '白云山把汉服放在园林之后的轻徒步。山路不建议曳地裙，改短褙子或直裰，索道分区另看。',
  'ck-yangshuo': '阳朔西街石板路注意裙门。换装点就在街区，褙子开衩好走路，夜色里不要抢灯会机位。',
  'ck-shazhou': '沙州夜市香囊摊位轮换很快。褙子市集好活动，沙地鞋底先拍干净再进铺，别用宽摆扫货架。'
}

function feedTitle(row) {
  const code = row.checkin_code || row.id || ''
  if (FEED_TITLES[code]) return FEED_TITLES[code]
  const tip = row.tip || row.content || ''
  const name = row.name || row.title || ''
  if (tip && tip.length > 16) return tip
  if (name && tip) return name + '。' + tip
  return name || '同袍打卡'
}

function skuLine(name, priceFen, originFen) {
  return { name: name, price: yuanFen(priceFen), origin: originFen ? yuanFen(originFen) : '' }
}

function spotSkus(spot, ticket) {
  const id = (spot && (spot.spot_code || spot.id)) || ''
  const priceFen = ticket ? Number(ticket.price || 0) : 0
  if (!priceFen) {
    return [skuLine('[岸线]免费通行', 0)]
  }
  const h = stamp(id)
  const origin = Math.round(priceFen * 1.22)
  const second = Math.round(priceFen * (0.55 + (h % 15) / 100))
  const names = {
    chen: ['[成人票]全天票', '[学生票]半价'],
    yuequan: ['[成人票]沙山+月牙泉', '[日落场]16:00 前入园'],
    xiangbi: ['[成人票]象山园区', '[联票]象山+漓江精简'],
    mogao: ['[预约票]数字中心+指定窟', '[讲解]加时不入窟'],
    default: ['[成人票]全天票', '[优惠票]错峰场']
  }
  const pair = names[id] || names.default
  return [skuLine(pair[0], priceFen, origin), skuLine(pair[1], second, Math.round(second * 1.3))]
}

function rentSkus(code, priceFen) {
  const origin = Math.round((priceFen || 16800) * 1.2)
  const map = {
    'rt-gz': [skuLine('襦裙 / 褙子日租', 16800, 19800), skuLine('马面精拍套（含头饰）', 22800, 26800)],
    'rt-gl': [skuLine('襦裙江边日租', 18800, 22800), skuLine('圆领袍航拍套', 26800, 31800)],
    'rt-dh': [skuLine('短摆沙地日租', 19800, 23800), skuLine('日落档圆领袍套', 25800, 30800)]
  }
  return map[code] || [skuLine('汉服日租', priceFen || 16800, origin), skuLine('情侣双人套', 29800, 35800)]
}

module.exports = {
  stamp,
  yuanFen,
  parseNotes,
  decorateDeal,
  feedTitle,
  spotSkus,
  rentSkus,
  FEED_TITLES
}

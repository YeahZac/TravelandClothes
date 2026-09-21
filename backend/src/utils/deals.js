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

function priceFenOf(item, fallback) {
  if (item && item.priceFen != null && item.priceFen !== '') {
    const n = Number(item.priceFen)
    if (!Number.isNaN(n)) return n
  }
  const n = Number(item && item.price)
  if (!n) return fallback || 0
  return n >= 80 ? n : Math.round(n * 100)
}

const CROWDS = ['客流适中', '今日舒适', '建议错峰', '今日人少']
const TAG_SETS = [
  ['随时随用', '可订明日', '随时退'],
  ['今日可用', '过期退', '可订明日'],
  ['汉服友好', '随时退', '可订明日'],
  ['可订今日', '随时退', '出票快']
]

function soldText(h, priceFen) {
  if (!Number(priceFen)) return '免费通行'
  const n = 120 + (h % 24000)
  if (n >= 10000) return Math.round(n / 1000) / 10 + '万+'
  return String(n)
}

function guessKind(item, opts) {
  if (opts && opts.kind) return opts.kind
  const type = (item && item.type) || ''
  if (type === 'rent' || type === 'garment') return '租赁'
  if (type === 'hotel') return '客房'
  if (type === 'food') return '人均'
  if (type === 'show') return '票价'
  if (type === 'free') return '通行'
  return '门票'
}

function decorateDeal(item, opts) {
  const next = Object.assign({}, item)
  const id = next.id || next.name || 'x'
  const h = stamp(id)
  const notes = parseNotes(opts && opts.notes)
  let priceFen = 0
  if (opts && opts.priceFen != null) priceFen = Number(opts.priceFen) || 0
  else priceFen = priceFenOf(next, 0)
  const originFen = Number(notes.originFen) || (priceFen ? Math.round(priceFen * (1.16 + (h % 28) / 100)) : 0)
  const price = notes.price || (priceFen ? yuanFen(priceFen) : '0')
  const origin = notes.origin || (originFen ? yuanFen(originFen) : '')
  const off = originFen && priceFen ? Math.max(0, Math.round((originFen - priceFen) / 100)) : 0
  const unit = (opts && opts.unit) || (price === '0' ? '' : '起')
  next.badge = notes.badge || (price === '0' ? '免费' : '买贵赔')
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
  next.kind = notes.kind || guessKind(next, opts)
  next.priceLabel = (opts && opts.priceLabel) || (price === '0' ? '免费' : ('¥' + price + (unit ? unit : '')))
  if (!next.meta) next.meta = (next.place || '') + (price === '0' ? '' : (' · ¥' + price + unit))
  return next
}

const FEED_TITLES = {
  'ck-chen': '陈家祠砖雕前把马面裙门摆正，避开午后导游团。灰塑吃侧面光，交领不要被补光灯打翻白。祠堂平地最好走，上台阶先提摆。门票十元随到随进，语音导览另计，汉服日租可在换装区取还。',
  'ck-lizhiwan': '荔枝湾石桥先提摆再上台阶，骑楼廊道袖不要横扫行人。夜灯起来之后明制交领最稳，灯会机位别站在桥心。岸线免费，游船四十八起，西关汉服日租可当天取还。',
  'ck-xiangbi': '象鼻山水月洞外倒影只要三分钟窗口。江风大，披帛别在腰后，襦裙短摆比齐胸安全。岸边湿石小心裙门。园区票七十五可订明日，漓江航线不要和门票绑死。',
  'ck-yuequan': '月牙泉日落档十六点前入园。沙地改平底鞋，宽摆会灌沙，圆领袍比曳地裙好走。骆驼项目另计，先拍泉再上沙。门票一百一十，日落汉服套建议提前取衣。',
  'ck-yuyin': '余荫山房曲廊适合慢走，褙子过膝但不拖地。窄桥提摆，不要为了构图挡别人过廊。池石吃侧面光，人少时再拍。番禺园林门票十八，半日租九十八够用。',
  'ck-baiyun': '白云山把汉服放在园林之后的轻徒步。山路不建议曳地裙，改短褙子或直裰，索道分区另看，出园再整理裙门。大门五元，索道不要和园票捆在一起买。',
  'ck-yangshuo': '阳朔西街石板路注意裙门。换装点就在街区，褙子开衩好走路，夜色里不要抢灯会机位，先让路再取景。西街免费逛，遇龙河竹筏和啤酒鱼分开算。',
  'ck-shazhou': '沙州夜市香囊摊位轮换很快。褙子市集好活动，沙地鞋底先拍干净再进铺，别用宽摆扫货架。夜市免费逛，黄面和烤羊肉是夜市时段，别空腹进沙山。',
  'ck-lihe': '漓江竹筏上短摆最稳，船晃时裙门按住。两岸峰丛不要探身，圆领袍比齐胸安全，班次以当日公示为准。航线票两百一十起，船上汉服套餐不要混成一张票。',
  'ck-liangjiang': '两江四湖夜航灯密人多，马面居中先提摆。日月双塔吃对岸倒影，不要站在舱门挡上下客。夜航参考价两百一十，日场环城水系可分开买，汉服建议岸上先整理。',
  'ck-mogao': '莫高窟先数字中心再指定窟。窟内禁止拍照，深衣对照壁画衣纹，袖垂腰稳。讲解加时不入窟。预约票含数字中心，形制对照放在出窟之后，不要在窟口排队化妆。',
  'ck-yangguan': '阳关戈壁风大先束带。圆领袍仪仗感强，烽燧前不要曳地。博物馆闭馆前留四十分钟。遗址票五十，联票把馆也算进去更省一次排队。',
  'ck-yongqing': '永庆坊骑楼荫里适合褙子慢走。石板路提摆，别在骑楼柱前挡路拍照。早茶前后人少，傍晚灯亮再拍交领。街区免费逛，陈家祠门票可顺路买。',
  'ck-shameen': '沙面榕树荫下圆领袍最稳，江风比祠堂大，披帛要别牢。欧陆外墙吃侧面光，不要站在车道中央构图。岸线免费，租车转场比走路省裙摆。',
  'ck-ludi': '芦笛岩洞内不打闪光，短褙子比曳地裙好走。洞外喀斯特再补一张全身。门票六十五可订明日，和象鼻山不要强行联票。'
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
  if (!priceFen) return [skuLine('[岸线]免费通行', 0), skuLine('[讲解]预约导览', 2900, 3900)]
  const origin = Math.round(priceFen * 1.22)
  const second = Math.max(100, Math.round(priceFen * 0.62))
  const names = {
    chen: ['[成人票]全天票', '[学生票]半价'],
    yuyin: ['[成人票]园林全天', '[联票]园林+讲解'],
    baiyun: ['[成人票]大门入园', '[索道]上下另计'],
    lizhiwan: ['[游船票]荔枝湾夜航', '[岸线]免费通行'],
    yuequan: ['[成人票]沙山+月牙泉', '[日落场]16:00 前入园'],
    xiangbi: ['[成人票]象山园区', '[联票]象山+漓江精简'],
    lihe: ['[航线票]桂林—阳朔', '[竹筏]短线另计'],
    liangjiang: ['[夜航]两江四湖', '[日场]环城水系'],
    yangshuo: ['[遇龙河]竹筏', '[西街]免费通行'],
    mogao: ['[预约票]数字中心+指定窟', '[讲解]加时不入窟'],
    yangguan: ['[成人票]遗址区', '[博物馆]联票'],
    shazhou: ['[夜市]免费通行', '[文创]摊位另计'],
    yongqing: ['[街区]免费通行', '[讲解]骑楼导览'],
    shameen: ['[岸线]免费通行', '[租车]转场短驳'],
    ludi: ['[成人票]溶洞全天', '[联票]芦笛+象山'],
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
    'rt-dh': [skuLine('短摆沙地日租', 19800, 23800), skuLine('日落档圆领袍套', 25800, 30800)],
    'rt-gz-half': [skuLine('半日襦裙 / 褙子', 9800, 12800), skuLine('头饰加购', 3900, 4900)],
    'rt-gz-couple': [skuLine('情侣双人日租', 29800, 35800), skuLine('妆造双人加购', 16800, 19800)],
    'rt-gz-mamian': [skuLine('马面+交领+头饰', 22800, 26800), skuLine('妆造单人加购', 8800, 10800)],
    'rt-gl-half': [skuLine('江边短摆半日', 10800, 13800), skuLine('披帛别针加购', 1900, 2900)],
    'rt-gl-boat': [skuLine('船上短摆+圆领袍', 26800, 31800), skuLine('不含船票', 0)],
    'rt-dh-sunset': [skuLine('日落档圆领 / 短摆', 25800, 30800), skuLine('平底鞋押金可退', 5000, 5000)],
    'rt-dh-couple': [skuLine('双人圆领或褙子', 31800, 36800), skuLine('妆造双人加购', 18800, 22800)]
  }
  return map[code] || [skuLine('汉服日租', priceFen || 16800, origin), skuLine('情侣双人套', 29800, 35800)]
}

function hotelSkus(priceFen) {
  const base = priceFen || 32800
  return [skuLine('[大床房]含早', base, Math.round(base * 1.18)), skuLine('[双床房]含早', Math.round(base * 1.08), Math.round(base * 1.28))]
}

function foodSkus(priceFen) {
  const base = priceFen || 6800
  return [skuLine('[双人]参考套餐', base, Math.round(base * 1.2)), skuLine('[包厢]需提前', Math.round(base * 1.6), Math.round(base * 1.9))]
}

function showSkus(priceFen) {
  if (!priceFen) {
    return [skuLine('[通票]预约观演席', 0), skuLine('[优选座]前排加购', 12800, 16800)]
  }
  const origin = Math.round(priceFen * 1.28)
  return [skuLine('[成人票]当场次', priceFen, origin), skuLine('[套票]含讲解', Math.round(priceFen * 1.35), Math.round(priceFen * 1.6))]
}

function carSkus(priceFen) {
  const base = priceFen || 15000
  return [skuLine('[日租]含基础险', base, Math.round(base * 1.2)), skuLine('[半日]市区短驳', Math.round(base * 0.62), Math.round(base * 0.78))]
}

function skusForType(type, id, priceFen) {
  if (type === 'rent' || type === 'garment') return rentSkus(id, priceFen)
  if (type === 'hotel') return hotelSkus(priceFen)
  if (type === 'food') return foodSkus(priceFen)
  if (type === 'show') return showSkus(priceFen)
  if (type === 'car') return carSkus(priceFen)
  if (type === 'ticket' || type === 'free') return spotSkus({ spot_code: id }, { price: priceFen })
  return priceFen ? [skuLine('[成人]当日可用', priceFen, Math.round(priceFen * 1.2))] : []
}

module.exports = {
  stamp,
  yuanFen,
  parseNotes,
  priceFenOf,
  decorateDeal,
  feedTitle,
  spotSkus,
  rentSkus,
  hotelSkus,
  foodSkus,
  showSkus,
  carSkus,
  skusForType,
  FEED_TITLES
}

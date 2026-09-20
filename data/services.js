const { getSpot } = require('./spots')
const { cdn } = require('../utils/cdn')

const typeNames = {
  ticket: '门票',
  free: '免费门票',
  hotel: '酒店',
  car: '租车',
  show: '演出',
  rent: '汉服租赁',
  float: '花车',
  shop: '文创'
}

const typeMeta = {
  ticket: { mark: '票', tone: 'coral', typePhoto: cdn('/images/photo/icon-ticket.jpg') },
  free: { mark: '免', tone: 'mint', typePhoto: cdn('/images/photo/icon-free.jpg') },
  hotel: { mark: '宿', tone: 'peach', typePhoto: cdn('/images/photo/icon-hotel.jpg') },
  car: { mark: '车', tone: 'mint', typePhoto: cdn('/images/photo/icon-car.jpg') },
  show: { mark: '演', tone: 'lilac', typePhoto: cdn('/images/photo/icon-show.jpg') },
  rent: { mark: '服', tone: 'lilac', typePhoto: cdn('/images/photo/icon-hanfu.jpg') },
  float: { mark: '花', tone: 'lilac', typePhoto: cdn('/images/photo/icon-show.jpg') },
  shop: { mark: '文', tone: 'coral', typePhoto: cdn('/images/photo/icon-ticket.jpg') }
}

const services = [
  { id: 'tk-yuyin', type: 'ticket', name: '余荫山房门票', spotId: 'yuyin', price: '18', day: '待定', place: '广州 · 番禺', desc: '当日入园。预约通道本版只展示。', notes: ['参考价', '支付暂未开通'] },
  { id: 'tk-chen', type: 'ticket', name: '陈家祠门票', spotId: 'chen', price: '10', day: '待定', place: '广州 · 荔湾', desc: '含主体建筑参观。语音导览另计。', notes: ['当日有效', '支付暂未开通'] },
  { id: 'tk-baiyun', type: 'ticket', name: '白云山门票', spotId: 'baiyun', price: '5', day: '待定', place: '广州 · 白云', desc: '大门入园。索道等区域另计。', notes: ['参考价', '支付暂未开通'] },
  { id: 'tk-xiangbi', type: 'ticket', name: '象鼻山门票', spotId: 'xiangbi', price: '40', day: '待定', place: '桂林', desc: '含象山园区。漓江游船另计。', notes: ['参考价', '支付暂未开通'] },
  { id: 'tk-lihe', type: 'ticket', name: '漓江航线票', spotId: 'lihe', price: '210', day: '待定', place: '桂林 · 阳朔', desc: '班次待定。竹筏与游船分开计价。', notes: ['参考价', '支付暂未开通'] },
  { id: 'tk-liangjiang', type: 'ticket', name: '两江四湖夜游', spotId: 'liangjiang', price: '210', day: '待定', place: '桂林', desc: '环城水系夜航。日月双塔以当日公示为准。', notes: ['参考价', '支付暂未开通'] },
  { id: 'tk-mogao', type: 'ticket', name: '莫高窟参观票', spotId: 'mogao', price: '238', day: '待定', place: '敦煌', desc: '含数字展示中心与指定洞窟。窟内禁止拍照。', notes: ['需预约时段', '支付暂未开通'] },
  { id: 'tk-yuequan', type: 'ticket', name: '鸣沙山月牙泉门票', spotId: 'yuequan', price: '110', day: '待定', place: '敦煌', desc: '含沙山与月牙泉核心区。骆驼等项目另计。', notes: ['参考价', '支付暂未开通'] },
  { id: 'tk-yangguan', type: 'ticket', name: '阳关门票', spotId: 'yangguan', price: '50', day: '待定', place: '敦煌', desc: '含遗址区参观。', notes: ['参考价', '支付暂未开通'] },

  { id: 'fr-lizhiwan', type: 'free', name: '荔枝湾岸线免费通行', spotId: 'lizhiwan', price: '0', day: '待定', place: '广州 · 荔湾', desc: '部分岸线与骑楼可逛。游船另计。', notes: ['岸线免费', '游船另购'] },
  { id: 'fr-yangshuo', type: 'free', name: '阳朔西街免费通行', spotId: 'yangshuo', price: '0', day: '待定', place: '桂林 · 阳朔', desc: '街区可逛。遇龙河、漓江航线另计。', notes: ['街区免费', '景点另计'] },
  { id: 'fr-shazhou', type: 'free', name: '沙州夜市免费通行', spotId: 'shazhou', price: '0', day: '待定', place: '敦煌', desc: '街巷可逛。摊位消费另计。', notes: ['街区免费'] },

  { id: 'rt-gz', type: 'rent', name: '广州汉服日租', spotId: 'yuyin', cover: '/images/photo/checkin-chen.jpg', price: '168', day: '待定', place: '余荫山房 / 陈家祠', desc: '襦裙、褙子、马面可租。取还在换装区。', notes: ['参考价', '支付暂未开通'] },
  { id: 'rt-gl', type: 'rent', name: '桂林汉服日租', spotId: 'xiangbi', cover: '/images/photo/checkin-xiangbi.jpg', price: '188', day: '待定', place: '象鼻山 / 阳朔', desc: '襦裙、圆领袍适合江边与西街。风大披帛另配。', notes: ['参考价', '支付暂未开通'] },
  { id: 'rt-dh', type: 'rent', name: '敦煌汉服日租', spotId: 'yuequan', cover: '/images/photo/checkin-yuequan.jpg', price: '198', day: '待定', place: '月牙泉 / 沙州', desc: '沙地改短摆或圆领袍。日落档需提前取衣。', notes: ['参考价', '支付暂未开通'] },

  { id: 'sh-garden', type: 'show', name: '园林雅集观演', spotId: 'yuyin', price: '0', day: '待定', place: '余荫山房 · 主舞台', desc: '持当日园票可预约观演席。本版只展示。', notes: ['通票预约席', '支付暂未开通'] },
  { id: 'sh-night', type: 'show', name: '荔枝湾夜游', spotId: 'lizhiwan', price: '39', day: '待定', place: '广州 · 荔湾', desc: '夜场岸线与少量航线。摊位消费另计。', notes: ['参考价', '支付暂未开通'] },
  { id: 'sh-boat', type: 'show', name: '漓江 / 两江夜航', spotId: 'lihe', price: '80', day: '待定', place: '桂林', desc: '日航与夜航班次待定。不与门票强制捆绑。', notes: ['参考价', '支付暂未开通'] },
  { id: 'sh-yue', type: 'show', name: '敦煌乐舞', spotId: 'mogao', price: '128', day: '待定', place: '敦煌', desc: '主题展演。与莫高窟参观可连看，场次待定。', notes: ['参考价', '支付暂未开通'] },

  { id: 'ht-gz', type: 'hotel', name: '西关园林客栈', spotId: 'yuyin', price: '328', day: '待定', place: '广州 · 荔湾 / 番禺', desc: '近陈家祠、荔枝湾一线。本版只展示房型。', notes: ['大床 / 双床', '支付暂未开通'] },
  { id: 'ht-gl', type: 'hotel', name: '漓江景客栈', spotId: 'xiangbi', price: '398', day: '待定', place: '桂林 / 阳朔', desc: '可择市区近象山，或阳朔近西街。不含航线票。', notes: ['参考价', '支付暂未开通'] },
  { id: 'ht-dh', type: 'hotel', name: '沙州客栈', spotId: 'shazhou', price: '360', day: '待定', place: '敦煌', desc: '近夜市。去月牙泉、莫高窟需包车或班线。', notes: ['参考价', '支付暂未开通'] },

  { id: 'cr-gz', type: 'car', name: '广州一日包车', spotId: 'yuyin', price: '480', day: '待定', place: '广州', desc: '余荫山房、陈家祠、白云山、荔枝湾可串。不含门票。司机不进园。', notes: ['7 座参考', '支付暂未开通'] },
  { id: 'cr-gl', type: 'car', name: '桂林阳朔包车', spotId: 'xiangbi', price: '520', day: '待定', place: '桂林', desc: '象鼻山、两江四湖、阳朔可串。漓江航线不含在车费内。', notes: ['参考价', '支付暂未开通'] },
  { id: 'cr-dh', type: 'car', name: '敦煌环线包车', spotId: 'yuequan', price: '560', day: '待定', place: '敦煌', desc: '莫高窟、月牙泉、阳关可串。不含门票。', notes: ['参考价', '支付暂未开通'] },

  { id: 'fl-open', type: 'float', name: '开幕巡游花车', spotId: 'baiyun', price: '0', day: '待定', place: '广州文化公园', desc: '沿途观看免费。上车体验与巡游报名未开通。', notes: ['路边观看无需购票', '登车体验暂未开放'] },
  { id: 'sp-fan', type: 'shop', name: '岭南折扇', spotId: 'chen', price: '39', day: '待定', place: '陈家祠文创摊', desc: '折扇、书签、香囊。只展示，不收款。', notes: ['参考价', '支付暂未开通'] },
  { id: 'sp-pouch', type: 'shop', name: '敦煌香囊', spotId: 'shazhou', price: '29', day: '待定', place: '沙州夜市', desc: '香囊与明信片。邮寄与现场领取通道都未开。', notes: ['参考价', '支付暂未开通'] }
].map((item) => {
  const meta = typeMeta[item.type] || {}
  const spot = getSpot(item.spotId)
  return Object.assign({}, item, meta, {
    photo: item.cover || (spot && spot.photo) || meta.typePhoto
  })
})

const typeOrder = ['ticket', 'free', 'rent', 'hotel', 'car', 'show', 'float', 'shop']

function getService(id) {
  return services.find((item) => item.id === id)
}

function listServices(type) {
  if (!type || type === 'all') return services
  return services.filter((item) => item.type === type)
}

function servicesForSpot(spotId) {
  return services.filter((item) => item.spotId === spotId)
}

function groupedForSpot(spotId) {
  const list = servicesForSpot(spotId)
  return typeOrder
    .map((type) => ({
      type,
      title: typeNames[type],
      list: list.filter((item) => item.type === type)
    }))
    .filter((group) => group.list.length)
}

module.exports = {
  services,
  typeNames,
  typeOrder,
  getService,
  listServices,
  servicesForSpot,
  groupedForSpot
}

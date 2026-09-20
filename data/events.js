const { mapPhotos } = require('../utils/cdn')
const events = mapPhotos([
  { id: 'opening', title: '开幕巡游', day: '待定', place: '广州文化公园', spotId: 'baiyun', tone: 'lilac', mark: '巡', photo: '/images/photo/banner-guangzhou.jpg', garmentId: 'yuanling', desc: '花车与仪仗沿园路行进。路边观看无需购票，登车报名暂未开放。', serviceIds: ['fl-open', 'sh-garden'] },
  { id: 'exhibit', title: '形制展览', day: '待定', place: '余荫山房 / 月牙泉外场', spotId: 'yuyin', tone: 'mint', mark: '展', photo: '/images/photo/spot-yuyin.jpg', garmentId: 'beizi', desc: '曲裾、襦裙、褙子、马面分区陈列。广州园林与敦煌沙海对照展出。', serviceIds: ['tk-yuyin'] },
  { id: 'market', title: '汉服市集', day: '待定', place: '陈家祠 / 阳朔西街 / 沙州夜市', spotId: 'chen', tone: 'peach', mark: '市', photo: '/images/photo/checkin-chen.jpg', garmentId: 'beizi', desc: '三地摊位轮换：岭南文创、桂林手作、敦煌香囊。本版不收款。', serviceIds: ['sp-fan', 'tk-chen'] },
  { id: 'talk', title: '深衣讲座', day: '待定', place: '莫高窟数字展示中心', spotId: 'mogao', tone: 'peach', mark: '讲', photo: '/images/photo/spot-mogao.jpg', garmentId: 'shenyi', desc: '认交领、续衽，并对照壁画衣纹。窟内仍禁止拍照。', serviceIds: ['tk-mogao'] },
  { id: 'night', title: '灯会夜行', day: '待定', place: '荔枝湾 / 两江四湖', spotId: 'liangjiang', tone: 'coral', mark: '灯', photo: '/images/photo/spot-liangjiang.jpg', garmentId: 'mamian', desc: '广州水乡与桂林日月双塔轮值。灯密人多，马面居中。', serviceIds: ['sh-night', 'tk-liangjiang'] },
  { id: 'workshop', title: '换装体验', day: '待定', place: '余荫山房 / 阳朔西街', spotId: 'yangshuo', tone: 'coral', mark: '换', photo: '/images/photo/checkin-xiangbi.jpg', garmentId: 'qixiong', desc: '广州园林与桂林西街都可取还。租赁与打卡机位同看。预约未开通。', serviceIds: ['rt-gl', 'tk-yuyin'] },
  { id: 'boat', title: '漓江汉服航线', day: '待定', place: '漓江', spotId: 'lihe', tone: 'mint', mark: '航', photo: '/images/photo/banner-guilin.jpg', garmentId: 'ruqun', desc: '竹筏与游船班次待定。船上宜短摆，不宜宽齐胸。', serviceIds: ['tk-lihe', 'sh-boat'] }
])

function getEvent(id) {
  return events.find((item) => item.id === id)
}

module.exports = { events, getEvent }

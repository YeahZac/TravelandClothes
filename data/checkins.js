const { mapPhotos } = require('../utils/cdn')
const checkins = mapPhotos([
  { id: 'ck-chen', name: '陈家祠砖雕', spotId: 'chen', garment: '马面 / 褙子', photo: '/images/photo/checkin-chen.jpg', tip: '砖雕前马面居中，避开高峰人流。' },
  { id: 'ck-lizhiwan', name: '荔枝湾石桥', spotId: 'lizhiwan', garment: '明制交领', photo: '/images/photo/checkin-lizhiwan.jpg', tip: '石桥先提摆，骑楼廊道袖不要横扫。' },
  { id: 'ck-xiangbi', name: '象鼻山倒影', spotId: 'xiangbi', garment: '襦裙 / 圆领袍', photo: '/images/photo/checkin-xiangbi.jpg', tip: '江风大，披帛要别牢。水边台阶先提摆。' },
  { id: 'ck-yuequan', name: '月牙泉日落', spotId: 'yuequan', garment: '襦裙 / 圆领袍', photo: '/images/photo/checkin-yuequan.jpg', tip: '沙地改平底鞋，宽摆易灌沙。' }
])

function listCheckins(spotId) {
  if (!spotId) return checkins
  return checkins.filter((item) => item.spotId === spotId)
}

function getCheckin(id) {
  return checkins.find((item) => item.id === id)
}

module.exports = { checkins, listCheckins, getCheckin }

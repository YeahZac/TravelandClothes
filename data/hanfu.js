const { mapPhotos } = require('../utils/cdn')
const garments = mapPhotos([
  { id: 'quju', name: '曲裾', aka: '绕襟深衣', era: '战国 · 西汉', occasion: '典礼', tone: 'lilac', mark: '曲', photo: '/images/photo/garment-quju.jpg', tags: ['交领右衽', '绕襟', '深衣'], intro: '衣裳连属，绕襟数层。典礼感强，步幅要小，适合陈家祠平地，不适合沙山。', spotIds: ['chen', 'mogao'] },
  { id: 'shenyi', name: '深衣', aka: '衣裳连属', era: '先秦至汉', occasion: '讲学', tone: 'mint', mark: '深', photo: '/images/photo/garment-shenyi.jpg', tags: ['十二幅裳', '续衽', '连属'], intro: '上衣下裳缝为一体。讲学、对照莫高壁画衣纹常用。袖垂、腰稳。', spotIds: ['mogao', 'yangguan'] },
  { id: 'ruqun', name: '襦裙', aka: '上襦下裙', era: '汉 · 唐', occasion: '出行', tone: 'coral', mark: '襦', photo: '/images/photo/garment-ruqun.jpg', tags: ['上襦', '下裙', '两件套'], intro: '最常见的两件套。荔枝湾、漓江岸都好走。裙长以不踩裙门为准。', spotIds: ['lizhiwan', 'xiangbi'] },
  { id: 'qixiong', name: '齐胸襦裙', aka: '唐制齐胸', era: '盛唐', occasion: '宴乐', tone: 'peach', mark: '齐', photo: '/images/photo/garment-qixiong.jpg', tags: ['裙腰齐胸', '披帛', '宽摆'], intro: '裙腰近胸，披帛易被风带走。适合两江四湖夜色，不适合月牙泉沙地。', spotIds: ['liangjiang', 'yuyin'] },
  { id: 'beizi', name: '褙子', aka: '宋制对襟', era: '宋', occasion: '市集', tone: 'mint', mark: '褙', photo: '/images/photo/garment-beizi.jpg', tags: ['直领对襟', '开衩', '过膝'], intro: '对襟开衩，市集里好活动。陈家祠、阳朔西街、沙州夜市都常见。', spotIds: ['chen', 'yangshuo'] },
  { id: 'mamian', name: '马面裙', aka: '明制马面', era: '明', occasion: '灯会', tone: 'coral', mark: '马', photo: '/images/photo/garment-mamian.jpg', tags: ['裙门居中', '两侧打褶', '明制'], intro: '裙门居中，上台阶先提摆。荔枝湾灯会、两江四湖都稳。', spotIds: ['chen', 'liangjiang'] },
  { id: 'yuanling', name: '圆领袍', aka: '公服', era: '唐以后', occasion: '开幕', tone: 'lilac', mark: '圆', photo: '/images/photo/garment-yuanling.jpg', tags: ['圆领', '直身', '腰带'], intro: '圆领贴颈，直身束带。开幕、阳关、月牙泉仪仗感强。', spotIds: ['yangguan', 'yuequan'] },
  { id: 'zhishen', name: '直裰', aka: '士人服', era: '明', occasion: '讲座', tone: 'peach', mark: '直', photo: '/images/photo/garment-zhishen.jpg', tags: ['交领', '大襟', '平直'], intro: '交领大襟，线条平直。讲座、祠堂、边关都合适。', spotIds: ['mogao', 'baiyun'] }
])

function getGarment(id) {
  return garments.find((item) => item.id === id)
}

module.exports = { garments, getGarment }

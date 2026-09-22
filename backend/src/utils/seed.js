// 初始数据灌入工具
async function empty(conn, table) {
  try {
    const [[{ cnt }]] = await conn.query(`SELECT COUNT(*) AS cnt FROM ${table}`)
    return !cnt
  } catch (e) {
    return true
  }
}

async function run(db) {
  const r = { spots: 0, garments: 0, garmentSpots: 0, events: 0, services: 0, articles: 0, checkins: 0, guides: 0, taboos: 0, quiz: 0, banners: 0, categories: 0, admins: 0 }
  const conn = await db.getConnection()
  try {
    const steps = [
      seedSpots, seedGarments, seedGarmentSpots, seedEvents, seedServices,
      seedArticles, seedCheckins, seedGuides, seedQuiz, seedBanners,
      seedCategories, seedHome, seedAdmins, seedSocial
    ]
    for (const fn of steps) {
      try {
        await fn(conn, r)
      } catch (e) {
        console.error('seed', fn.name, e.message)
        r.errors = r.errors || []
        r.errors.push(fn.name + ': ' + e.message)
      }
    }
  } finally {
    conn.release()
  }
  return r
}

async function seedSpots(conn, r) {
  const spots = [
    ['yuyin','余荫山房','广州','广州','国家4A','mint','余','/images/photo/spot-yuyin.jpg','08:00–17:30','约 2 小时','清代番禺私家园林。曲廊、池石与过道适合慢走，是广州汉服节常用取景地。','窄桥提摆，交领右衽，褙子过膝不拖地。',1],
    ['chen','陈家祠','广州','广州','国家4A','peach','陈','/images/photo/spot-chen.jpg','08:30–17:30','约 1.5 小时','广东民间工艺博物馆。岭南砖雕、木雕、灰塑集中，祠堂庭院适合短时打卡，也作市集外场。','明制马面在砖雕前最稳，避开高峰人流。',2],
    ['baiyun','白云山','广州','广州','国家5A','lilac','云','/images/photo/spot-baiyun.jpg','06:00–18:00','半天','广州城市绿肺。登山与索道分区管理，适合把汉服拍摄放在园林之后的轻徒步。','山路不建议曳地裙，改短褙子或直裰。',3],
    ['lizhiwan','荔枝湾','广州','广州','国家4A','coral','荔','/images/photo/spot-lizhiwan.jpg','全天（街区）','约 2 小时','广州西关水乡。骑楼、石桥与游船，夜灯密集，灯会主场地之一。','明制交领在骑楼廊道袖不要横扫。',4],
    ['xiangbi','象鼻山','桂林','桂林','国家5A','mint','象','/images/photo/spot-xiangbi.jpg','07:00–18:00','约 2 小时','桂林城徽。象山水月洞与江边倒影，是漓江汉服航线起点。','襦裙或圆领袍，江风大披帛要别牢。',5],
    ['lihe','漓江航线','桂林','桂林','国家5A','mint','漓','/images/photo/spot-lihe.jpg','班次待定','半天','桂林到阳朔水路。竹筏与游船分段，两岸喀斯特峰丛。','船上宜短摆，不宜宽齐胸。',6],
    ['liangjiang','两江四湖','桂林','桂林','国家4A','coral','湖','/images/photo/spot-liangjiang.jpg','夜航为主','约 2 小时','桂林环城水系夜航。日月双塔、榕湖杉湖灯光。','马面裙居中，灯密人多先提摆。',7],
    ['yangshuo','阳朔西街','桂林','桂林','国家4A','coral','朔','/images/photo/spot-yangshuo.jpg','全天','半天','阳朔老街。手作、酒吧、漓江岸线交汇，换装体验取还点。','褙子开衩好走路，西街石板路注意裙门。',8],
    ['mogao','莫高窟','敦煌','敦煌','世界遗产','peach','莫','/images/photo/spot-mogao.jpg','预约制','半天','敦煌石窟群。数字展示中心+指定洞窟，窟内禁止拍照。','深衣讲学对照壁画衣纹，袖垂腰稳。',9],
    ['yuequan','鸣沙山月牙泉','敦煌','敦煌','国家5A','lilac','泉','/images/photo/spot-yuequan.jpg','06:00–19:30','半天','沙山与月牙泉。骆驼、滑沙、日落档拍摄。','沙地改短摆或圆领袍，宽摆易灌沙。',10],
    ['yangguan','阳关','敦煌','敦煌','国家4A','peach','关','/images/photo/spot-yangguan.jpg','08:00–18:00','约 1.5 小时','汉代边关遗址。戈壁、烽燧、博物馆。','圆领袍仪仗感强，戈壁风大束带。',11],
    ['shazhou','沙州夜市','敦煌','敦煌','街区','coral','沙','/images/photo/spot-shazhou.jpg','全天','约 2 小时','敦煌沙州夜市。香囊、文创、小吃摊位轮换。','褙子市集好活动，沙地注意鞋底。',12],
    ['yongqing','永庆坊','广州','广州','街区','mint','永','/images/photo/banner-guangzhou.jpg','全天','约 2 小时','西关骑楼街区。永庆坊、恩宁路连片，适合褙子慢走与早茶前后打卡。','石板路提摆，骑楼柱前不要挡路。',13],
    ['shameen','沙面','广州','广州','街区','lilac','沙','/images/photo/spot-lizhiwan.jpg','全天','约 2 小时','珠江边沙面岛。榕树荫与欧陆外墙，江风比祠堂大。','圆领袍最稳，披帛要别牢。',14],
    ['ludi','芦笛岩','桂林','桂林','国家4A','peach','芦','/images/photo/spot-xiangbi.jpg','08:00–17:30','约 1.5 小时','桂林溶洞景观。洞内光暗，洞外喀斯特可补全身照。','洞内短褙子，不打闪光。',15]
  ]
  for (const s of spots) {
    await conn.query(
      `INSERT INTO spots (spot_code,name,city,region,level,tone,mark,photo,open_time,stay,intro,hanfu_tip,sort_order,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name), photo=VALUES(photo), intro=VALUES(intro), hanfu_tip=VALUES(hanfu_tip)`, s)
    r.spots++
  }
}

async function seedGarments(conn, r) {
  const garments = [
    ['quju','曲裾','绕襟深衣','战国 · 西汉','典礼','lilac','曲','/images/photo/garment-quju.jpg','["交领右衽","绕襟","深衣"]','衣裳连属，绕襟数层。典礼感强，步幅要小，适合陈家祠平地，不适合沙山。',1],
    ['shenyi','深衣','衣裳连属','先秦至汉','讲学','mint','深','/images/photo/garment-shenyi.jpg','["十二幅裳","续衽","连属"]','上衣下裳缝为一体。讲学、对照莫高壁画衣纹常用。袖垂、腰稳。',2],
    ['ruqun','襦裙','上襦下裙','汉 · 唐','出行','coral','襦','/images/photo/garment-ruqun.jpg','["上襦","下裙","两件套"]','最常见的两件套。荔枝湾、漓江岸都好走。裙长以不踩裙门为准。',3],
    ['qixiong','齐胸襦裙','唐制齐胸','盛唐','宴乐','peach','齐','/images/photo/garment-qixiong.jpg','["裙腰齐胸","披帛","宽摆"]','裙腰近胸，披帛易被风带走。适合两江四湖夜色，不适合月牙泉沙地。',4],
    ['beizi','褙子','宋制对襟','宋','市集','mint','褙','/images/photo/garment-beizi.jpg','["直领对襟","开衩","过膝"]','对襟开衩，市集里好活动。陈家祠、阳朔西街、沙州夜市都常见。',5],
    ['mamian','马面裙','明制马面','明','灯会','coral','马','/images/photo/garment-mamian.jpg','["裙门居中","两侧打褶","明制"]','裙门居中，上台阶先提摆。荔枝湾灯会、两江四湖都稳。',6],
    ['yuanling','圆领袍','公服','唐以后','开幕','lilac','圆','/images/photo/garment-yuanling.jpg','["圆领","直身","腰带"]','圆领贴颈，直身束带。开幕、阳关、月牙泉仪仗感强。',7],
    ['zhishen','直裰','士人服','明','讲座','peach','直','/images/photo/garment-zhishen.jpg','["交领","大襟","平直"]','交领大襟，线条平直。讲座、祠堂、边关都合适。',8]
  ]
  for (const g of garments) {
    await conn.query(
      `INSERT INTO garments (garment_code,name,aka,era,occasion,tone,mark,photo,tags,intro,sort_order,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name)`, g)
    r.garments++
  }
}

async function seedGarmentSpots(conn, r) {
  const links = {
    quju: ['chen', 'mogao'],
    shenyi: ['mogao', 'yangguan'],
    ruqun: ['lizhiwan', 'xiangbi'],
    qixiong: ['liangjiang', 'yuyin'],
    beizi: ['chen', 'yangshuo'],
    mamian: ['chen', 'liangjiang'],
    yuanling: ['yangguan', 'yuequan'],
    zhishen: ['mogao', 'baiyun']
  }
  for (const [gcode, spots] of Object.entries(links)) {
    const [[g]] = await conn.query('SELECT id FROM garments WHERE garment_code=?', [gcode])
    if (!g) continue
    for (const sc of spots) {
      const [[s]] = await conn.query('SELECT id FROM spots WHERE spot_code=?', [sc])
      if (!s) continue
      await conn.query('INSERT IGNORE INTO garment_spots (garment_id, spot_id) VALUES (?,?)', [g.id, s.id])
      r.garmentSpots++
    }
  }
}

async function seedEvents(conn, r) {
  const events = [
    ['opening','开幕巡游','待定','广州文化公园','baiyun','yuanling','lilac','巡','/images/photo/event-opening.jpg','花车与仪仗沿园路行进。路边观看无需购票，登车报名暂未开放。',1],
    ['exhibit','形制展览','待定','余荫山房 / 月牙泉外场','yuyin','beizi','mint','展','/images/photo/spot-yuyin.jpg','曲裾、襦裙、褙子、马面分区陈列。广州园林与敦煌沙海对照展出。',2],
    ['market','汉服市集','待定','陈家祠 / 阳朔西街 / 沙州夜市','chen','beizi','peach','市','/images/photo/checkin-chen.jpg','三地摊位轮换：岭南文创、桂林手作、敦煌香囊。本版不收款。',3],
    ['talk','深衣讲座','待定','莫高窟数字展示中心','mogao','shenyi','peach','讲','/images/photo/spot-mogao.jpg','认交领、续衽，并对照壁画衣纹。窟内仍禁止拍照。',4],
    ['night','灯会夜行','待定','荔枝湾 / 两江四湖','liangjiang','mamian','coral','灯','/images/photo/spot-liangjiang.jpg','广州水乡与桂林日月双塔轮值。灯密人多，马面居中。',5],
    ['workshop','换装体验','待定','余荫山房 / 阳朔西街','yangshuo','qixiong','coral','换','/images/photo/checkin-xiangbi.jpg','广州园林与桂林西街都可取还。租赁与打卡机位同看。预约未开通。',6],
    ['boat','漓江汉服航线','待定','漓江','lihe','ruqun','mint','航','/images/photo/banner-guilin.jpg','竹筏与游船班次待定。船上宜短摆，不宜宽齐胸。',7]
  ]
  for (const e of events) {
    const [code,title,day,place,spotCode,garmentCode,tone,mark,photo,desc,sort] = e
    const [[sp]] = await conn.query('SELECT id FROM spots WHERE spot_code=?',[spotCode])
    const [[gm]] = await conn.query('SELECT id FROM garments WHERE garment_code=?',[garmentCode])
    await conn.query(
      `INSERT INTO events (event_code,title,day,place,spot_id,garment_id,tone,mark,photo,\`desc\`,sort_order,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE title=VALUES(title)`,
      [code,title,day,place,sp?.id||null,gm?.id||null,tone,mark,photo,desc,sort])
    r.events++
  }
}

async function seedServices(conn, r) {
  const services = [
    ['tk-yuyin','ticket','余荫山房入园','yuyin',1800,'可订明日','广州 · 番禺','当日入园。园林汉服友好，窄桥提摆。','{"tags":["随时随用","可订明日","随时退"],"badge":"买贵赔","score":"4.5","reviews":1860,"crowd":"今日舒适","sold":"1.6万+","rankLabel":"番禺园林榜 · 第 2 名"}',1],
    ['tk-chen','ticket','陈家祠入园','chen',1000,'随时随用','广州 · 荔湾','含主体建筑参观。语音导览另计。','{"tags":["随时随用","可订明日","随时退"],"badge":"买贵赔","score":"4.6","reviews":2418,"crowd":"客流适中","sold":"2.4万+","rankLabel":"砖雕取景榜 · 广州第 1 名"}',2],
    ['tk-baiyun','ticket','白云山入园','baiyun',500,'随时随用','广州 · 白云','大门入园。索道等区域另计。','{"tags":["随时随用","可订明日"],"badge":"买贵赔","score":"4.4","reviews":5200,"crowd":"建议错峰","sold":"3.1万+"}',3],
    ['tk-xiangbi','ticket','象鼻山入园','xiangbi',7500,'可订明日','桂林','含象山园区。漓江游船另计。','{"tags":["随时随用","可订明日","随时退"],"badge":"买贵赔","score":"4.7","reviews":8600,"crowd":"客流适中","sold":"3.2万+","rankLabel":"最热打卡榜 · 桂林第 1 名"}',4],
    ['tk-lihe','ticket','漓江航线票','lihe',21000,'可订明日','桂林 · 阳朔','班次以当日公示为准。竹筏与游船分开计价。','{"tags":["可订明日","过期退"],"badge":"买贵赔","score":"4.6","reviews":4300,"crowd":"建议错峰","sold":"1.9万+"}',5],
    ['tk-liangjiang','ticket','两江四湖夜游','liangjiang',21000,'可订明日','桂林','环城水系夜航。日月双塔以当日公示为准。','{"tags":["可订明日","随时退"],"badge":"买贵赔","score":"4.5","reviews":3100,"sold":"1.4万+"}',6],
    ['tk-mogao','ticket','莫高窟参观票','mogao',23800,'需预约','敦煌','含数字展示中心与指定洞窟。窟内禁止拍照。','{"tags":["需预约","可订明日"],"badge":"买贵赔","score":"4.8","reviews":9800,"sold":"2.8万+","rankLabel":"形制对照榜 · 敦煌第 2 名"}',7],
    ['tk-yuequan','ticket','鸣沙山月牙泉入园','yuequan',11000,'可订明日','敦煌','含沙山与月牙泉核心区。骆驼等项目另计。','{"tags":["随时随用","可订明日","随时退"],"badge":"买贵赔","score":"4.8","reviews":12400,"crowd":"建议错峰","sold":"4.8万+","rankLabel":"汉服出行榜 · 敦煌第 1 名"}',8],
    ['tk-yangguan','ticket','阳关入园','yangguan',5000,'可订明日','敦煌','含遗址区参观。','{"tags":["随时随用","可订明日"],"badge":"买贵赔","score":"4.3","reviews":760,"sold":"4200+"}',9],
    ['tk-lizhiwan','ticket','荔枝湾游船票','lizhiwan',4800,'可订明日','广州 · 荔湾','夜航与日航分开。岸线仍免费。','{"tags":["随时随用","可订明日","随时退"],"badge":"买贵赔","score":"4.5","reviews":2100,"sold":"1.2万+","rankLabel":"夜游灯会榜 · 广州第 2 名"}',46],
    ['tk-ludi','ticket','芦笛岩入园','ludi',6500,'可订明日','桂林','含溶洞参观。洞内禁止闪光。','{"tags":["随时随用","可订明日","随时退"],"badge":"买贵赔","score":"4.4","reviews":3680,"sold":"8600+","crowd":"今日舒适"}',47],
    ['fr-lizhiwan','free','荔枝湾岸线免费通行','lizhiwan',0,'待定','广州 · 荔湾','部分岸线与骑楼可逛。游船另计。','{"tags":["岸线免费","游船另购"],"score":"4.3","reviews":920,"sold":"免费通行"}',10],
    ['fr-yangshuo','free','阳朔西街免费通行','yangshuo',0,'待定','桂林 · 阳朔','街区可逛。遇龙河、漓江航线另计。','{"tags":["街区免费","景点另计"],"score":"4.4","reviews":1540,"sold":"免费通行"}',11],
    ['fr-shazhou','free','沙州夜市免费通行','shazhou',0,'待定','敦煌','街巷可逛。摊位消费另计。','{"tags":["街区免费"],"score":"4.2","reviews":680,"sold":"免费通行"}',12],
    ['fr-yongqing','free','永庆坊街区免费通行','yongqing',0,'待定','广州 · 荔湾','骑楼街区可逛。陈家祠入园另计。','{"tags":["街区免费","随时随用"],"score":"4.3","reviews":1120,"sold":"免费通行"}',48],
    ['fr-shameen','free','沙面岸线免费通行','shameen',0,'待定','广州 · 荔湾','沙面岛可逛。租车转场另计。','{"tags":["岸线免费","随时随用"],"score":"4.4","reviews":860,"sold":"免费通行"}',49],
    ['rt-gz','rent','广州汉服换装参考','yuyin',0,'行程参考','余荫山房 / 陈家祠','可在景区附近了解换装点。本平台不销售汉服租赁。','{"tags":["仅介绍","换装参考"],"score":"4.7","reviews":2860,"sold":"介绍"}',13],
    ['rt-gl','rent','桂林汉服换装参考','xiangbi',0,'行程参考','象鼻山 / 阳朔','江边与西街换装建议。本平台不销售租赁。','{"tags":["仅介绍"],"score":"4.6","reviews":1940,"sold":"介绍"}',14],
    ['rt-dh','rent','敦煌汉服换装参考','yuequan',0,'行程参考','月牙泉 / 沙州','沙地建议短摆或圆领袍。本平台不销售租赁。','{"tags":["仅介绍"],"score":"4.6","reviews":1680,"sold":"介绍"}',15],
    ['rt-gz-half','rent','广州半日换装参考','chen',0,'行程参考','陈家祠 / 荔枝湾','适合祠堂快拍的形制建议。本平台不销售租赁。','{"tags":["仅介绍"],"score":"4.5","reviews":1240,"sold":"介绍"}',33],
    ['rt-gz-couple','rent','广州双人换装参考','lizhiwan',0,'行程参考','荔枝湾 / 陈家祠','交领+马面或褙子双人造型建议。本平台不销售。','{"tags":["仅介绍"],"score":"4.8","reviews":980,"sold":"介绍"}',34],
    ['rt-gz-mamian','rent','马面裙取景参考','chen',0,'行程参考','陈家祠','明制马面砖雕前取景建议。本平台不销售租赁。','{"tags":["仅介绍"],"score":"4.7","reviews":1560,"sold":"介绍"}',35],
    ['rt-gl-half','rent','桂林半日换装参考','xiangbi',0,'行程参考','象鼻山','江边短摆建议。本平台不销售租赁。','{"tags":["仅介绍"],"score":"4.4","reviews":860,"sold":"介绍"}',36],
    ['rt-gl-boat','rent','漓江船上穿搭参考','lihe',0,'行程参考','漓江航线','船上短摆建议。船票请单独预订入园/航线。','{"tags":["仅介绍"],"score":"4.5","reviews":640,"sold":"介绍"}',37],
    ['rt-dh-sunset','rent','月牙泉日落穿搭参考','yuequan',0,'行程参考','鸣沙山月牙泉','日落档穿搭建议。本平台不销售租赁。','{"tags":["仅介绍"],"score":"4.7","reviews":1120,"sold":"介绍"}',38],
    ['rt-dh-couple','rent','敦煌双人换装参考','shazhou',0,'行程参考','沙州夜市 / 月牙泉','双人造型建议。本平台不销售租赁。','{"tags":["仅介绍"],"score":"4.6","reviews":520,"sold":"介绍"}',39],
    ['fd-tea','food','广州早茶点心（参考）','lizhiwan',0,'行程参考','广州 · 荔湾','虾饺、干蒸等参考。本平台不提供餐饮预订。','{"tags":["仅介绍","人均参考"],"score":"4.6","reviews":2100,"sold":"介绍"}',27],
    ['fd-sweet','food','西关糖水（参考）','chen',0,'行程参考','广州 · 荔湾','姜撞奶、双皮奶等参考。本平台不提供餐饮预订。','{"tags":["仅介绍"],"score":"4.4","reviews":980,"sold":"介绍"}',28],
    ['fd-rice','food','桂林米粉（参考）','xiangbi',0,'行程参考','桂林象山区','出园周边用餐参考。本平台不提供餐饮预订。','{"tags":["仅介绍"],"score":"4.5","reviews":1560,"sold":"介绍"}',29],
    ['fd-beerfish','food','阳朔啤酒鱼（参考）','yangshuo',0,'行程参考','桂林 · 阳朔西街','用餐礼节参考。本平台不提供餐饮预订。','{"tags":["仅介绍"],"score":"4.6","reviews":1880,"sold":"介绍"}',30],
    ['fd-huangmian','food','敦煌黄面（参考）','shazhou',0,'行程参考','敦煌 · 沙州夜市','夜市小吃参考。本平台不提供餐饮预订。','{"tags":["仅介绍"],"score":"4.5","reviews":1320,"sold":"介绍"}',31],
    ['fd-yangrou','food','月牙泉周边用餐（参考）','yuequan',0,'行程参考','敦煌 · 月牙泉景区外','日落后用餐参考。本平台不提供餐饮预订。','{"tags":["仅介绍"],"score":"4.4","reviews":420,"sold":"介绍"}',32],
    ['fd-yumcha','food','泮溪酒家早茶（参考）','lizhiwan',0,'行程参考','广州 · 荔湾','早茶参考。本平台不提供餐饮预订。','{"tags":["仅介绍"],"score":"4.7","reviews":3200,"sold":"介绍"}',43],
    ['fd-boat','food','漓江船上简餐（参考）','lihe',0,'行程参考','桂林 · 阳朔','航线简餐参考。船票请单独预订。','{"tags":["仅介绍"],"score":"4.1","reviews":420,"sold":"介绍"}',44],
    ['sh-garden','show','园林雅集观演（介绍）','yuyin',0,'活动日','余荫山房 · 主舞台','持当日园票可现场了解观演安排。本平台不销售演出票。','{"tags":["仅介绍","关联入园"],"score":"4.4","reviews":360,"sold":"介绍"}',16],
    ['sh-night','show','荔枝湾夜游（介绍）','lizhiwan',0,'活动日','广州 · 荔湾','夜场岸线与航线信息供行程参考。游船与演出票请向现场或主办方咨询。','{"tags":["仅介绍"],"score":"4.5","reviews":1280,"sold":"介绍"}',17],
    ['sh-boat','show','漓江 / 两江夜航（介绍）','lihe',0,'活动日','桂林','日航与夜航班次以当日公示为准。本平台不销售航线与演出票。','{"tags":["仅介绍"],"score":"4.4","reviews":940,"sold":"介绍"}',18],
    ['sh-yue','show','敦煌乐舞（介绍）','mogao',0,'活动日','敦煌','主题展演信息介绍。票务由主办方或场馆渠道提供。','{"tags":["仅介绍"],"score":"4.6","reviews":1560,"sold":"介绍"}',19],
    ['sh-open','show','汉服节开幕仪仗（介绍）','baiyun',0,'活动日','广州文化公园','路边观看与登车席安排以主办方公示为准。本平台不销售演出票。','{"tags":["仅介绍"],"score":"4.6","reviews":880,"sold":"介绍"}',45],
    ['ht-gz','hotel','西关园林客栈（参考）','yuyin',0,'行程参考','广州 · 荔湾 / 番禺','近陈家祠、荔枝湾一线。住宿预订请自行联系商家，本平台不销售。','{"tags":["仅介绍","行程参考"],"score":"4.4","reviews":860,"sold":"介绍"}',20],
    ['ht-gl','hotel','漓江景客栈（参考）','xiangbi',0,'行程参考','桂林 / 阳朔','可择市区近象山，或阳朔近西街。本平台不销售住宿。','{"tags":["仅介绍"],"score":"4.5","reviews":720,"sold":"介绍"}',21],
    ['ht-dh','hotel','沙州驿站（参考）','shazhou',0,'行程参考','敦煌 · 沙州','近夜市与鸣沙山。住宿请自行预订。','{"tags":["仅介绍"],"score":"4.3","reviews":540,"sold":"介绍"}',22],
    ['ht-gz-garden','hotel','陈家祠旁广府客栈（参考）','chen',0,'行程参考','广州 · 荔湾','步行可达陈家祠。本平台仅提供周边住宿参考。','{"tags":["仅介绍"],"score":"4.5","reviews":1280,"crowd":"今日舒适","sold":"介绍"}',40],
    ['ht-gl-west','hotel','阳朔西街江景客栈（参考）','yangshuo',0,'行程参考','桂林 · 阳朔','近西街换装点。本平台不销售住宿。','{"tags":["仅介绍"],"score":"4.4","reviews":960,"sold":"介绍"}',41],
    ['ht-dh-sand','hotel','月牙泉沙景客栈（参考）','yuequan',0,'行程参考','敦煌 · 月牙泉','近沙山门口。住宿请自行预订。','{"tags":["仅介绍"],"score":"4.3","reviews":640,"sold":"介绍"}',42],
    ['cr-gz','car','广州租车','yuyin',15000,'待定','广州','市区短租。园林间转场用。','["参考价","支付暂未开通"]',23],
    ['cr-gl','car','桂林租车','xiangbi',18000,'待定','桂林','市区到阳朔短租。','["参考价","支付暂未开通"]',24],
    ['fl-open','float','开幕花车','baiyun',0,'待定','广州文化公园','开幕巡游花车。本版只展示。','["暂未开放报名"]',25],
    ['sp-fan','shop','文创扇铺','chen',3900,'现货','陈家祠 / 阳朔','团扇、折扇手作。','["包邮满 99 元"]',26]
  ]
  for (const s of services) {
    const [code,type,name,spotCode,price,day,place,desc,notes,sort] = s
    const [[sp]] = await conn.query('SELECT id FROM spots WHERE spot_code=?',[spotCode])
    await conn.query(
      `INSERT INTO services (service_code,type,name,spot_id,price,day,place,\`desc\`,notes,sort_order,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name), price=VALUES(price), day=VALUES(day), place=VALUES(place), \`desc\`=VALUES(\`desc\`), notes=VALUES(notes)`,
      [code,type,name,sp?.id||null,price,day,place,desc,notes,sort])
    r.services++
  }
  await conn.query(
    `UPDATE services s JOIN spots sp ON s.spot_id = sp.id
     SET s.cover = sp.photo WHERE s.cover IS NULL OR s.cover = ''`
  )
}

async function seedArticles(conn, r) {
  const articles = [
    ['history','沿革','lilac','沿','["汉服是一套分叉的衣冠系统","先认结构，再记朝代"]','["不要把汉服理解成一件衣服的名字。它是交领、袍、裙、深衣这些结构在不同朝代里的分叉。","先看衣裳是连属还是两截，再看领：交领右衽、圆领、对襟。朝代是标签，结构才是索引。","首页上认形制，是为了到景区时知道自己穿的是哪一支，而不是为了背年表。"]',1],
    ['color','色彩','mint','色','["正色是骨架，间色是变化","先避丧色，再谈品级"]','["青赤黄白黑是正色，间色用来调节场合。节日现场不必复原品级，但要避开丧礼常用的组合。","园林拍照浅色更显层次，灯会可用饱和的红与石青，山路则宜沉一点，少大面积曳地白。"]',2],
    ['etiquette','礼仪','coral','礼','["交领右衽","袖垂、腰稳、不掀别人衣带"]','["右衽是大多数场合的默认。袖自然下垂，腰带打平，结藏在侧后。","不要拉开别人的衣带，不要把补子说成自己的官职。景区里不挡路、不踩裙门，比姿势更要紧。"]',3],
    ['pattern','纹样','peach','纹','["云纹、牡丹、团花各有场合","宁可少绣"]','["云纹、卷草适合常服；牡丹、团花更偏宴乐。开幕仪仗可以满，出行可以素。","纹样不是越多越对。宁可少绣，让领、袖、裙门先被看见。"]',4],
    ['festival','节俗','lilac','俗','["看见、学会穿、走回街道"]','["形制不是只在舞台上。广州园林、桂林江岸、敦煌沙海，才是衣服被看见的地方。","先认形制，再选广州、桂林、敦煌的景区。入园、演出、租车、住宿可以串成一条出行，但本版先展示、不收款。"]',5]
  ]
  for (const a of articles) {
    await conn.query(
      `INSERT INTO articles (article_code,title,tone,mark,summary_lines,body,sort_order,status)
       VALUES (?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE title=VALUES(title)`, a)
    r.articles++
  }
}

async function seedCheckins(conn, r) {
  const checkins = [
    ['ck-chen','陈家祠砖雕','chen','马面 / 褙子','/images/photo/checkin-chen.jpg','陈家祠砖雕前把马面裙门摆正，避开午后导游团。灰塑吃侧面光，交领不要被补光灯打翻白。祠堂平地最好走，上台阶先提摆，入园约十元。',1],
    ['ck-lizhiwan','荔枝湾石桥','lizhiwan','明制交领','/images/photo/checkin-lizhiwan.jpg','荔枝湾石桥先提摆再上台阶，骑楼廊道袖不要横扫行人。夜灯起来之后明制交领最稳，灯会机位别站在桥心。岸线免费，游船另买。',2],
    ['ck-xiangbi','象鼻山倒影','xiangbi','襦裙 / 圆领袍','/images/photo/checkin-xiangbi.jpg','象鼻山水月洞外倒影只要三分钟窗口。江风大，披帛别在腰后，襦裙短摆比齐胸安全。岸边湿石小心裙门，漓江航线不要和入园套餐绑死。',3],
    ['ck-yuequan','月牙泉日落','yuequan','襦裙 / 圆领袍','/images/photo/checkin-yuequan.jpg','月牙泉日落档十六点前入园。沙地改平底鞋，宽摆会灌沙，圆领袍比曳地裙好走。骆驼项目另计，先拍泉再上沙。入园约一百一十。',4],
    ['ck-yuyin','余荫山房曲廊','yuyin','褙子','/images/photo/spot-yuyin.jpg','余荫山房曲廊适合慢走，褙子过膝但不拖地。窄桥提摆，不要为了构图挡别人过廊。池石吃侧面光，人少时再拍。番禺园林入园约十八元。',5],
    ['ck-baiyun','白云山轻徒步','baiyun','直裰 / 短褙子','/images/photo/spot-baiyun.jpg','白云山把汉服放在园林之后的轻徒步。山路不建议曳地裙，改短褙子或直裰，索道分区另看，出园再整理裙门。大门五元，索道另计。',6],
    ['ck-yangshuo','阳朔西街换装','yangshuo','褙子','/images/photo/spot-yangshuo.jpg','阳朔西街石板路注意裙门。换装点就在街区，褙子开衩好走路，夜色里不要抢灯会机位，先让路再取景。西街免费逛，遇龙河竹筏另买。',7],
    ['ck-shazhou','沙州夜市摊位','shazhou','褙子','/images/photo/spot-shazhou.jpg','沙州夜市香囊摊位轮换很快。褙子市集好活动，沙地鞋底先拍干净再进铺，别用宽摆扫货架。夜市免费逛，黄面是夜市时段。',8],
    ['ck-lihe','漓江竹筏短摆','lihe','襦裙 / 圆领袍','/images/photo/spot-lihe.jpg','漓江竹筏上短摆最稳，船晃时裙门按住。两岸峰丛不要探身，圆领袍比齐胸安全，班次以当日公示为准。航线票和船上汉服套餐分开买。',9],
    ['ck-liangjiang','两江四湖夜航','liangjiang','马面','/images/photo/spot-liangjiang.jpg','两江四湖夜航灯密人多，马面居中先提摆。日月双塔吃对岸倒影，不要站在舱门挡上下客。夜航参考价两百一十。',10],
    ['ck-mogao','莫高窟形制对照','mogao','深衣','/images/photo/spot-mogao.jpg','莫高窟先数字中心再指定窟。窟内禁止拍照，深衣对照壁画衣纹，袖垂腰稳。讲解加时不入窟。预约票含数字中心。',11],
    ['ck-yangguan','阳关戈壁束带','yangguan','圆领袍','/images/photo/spot-yangguan.jpg','阳关戈壁风大先束带。圆领袍仪仗感强，烽燧前不要曳地。博物馆闭馆前留四十分钟。遗址票五十，联票把馆也算进去更省一次排队。',12],
    ['ck-yongqing','永庆坊骑楼','yongqing','褙子','/images/photo/banner-guangzhou.jpg','永庆坊骑楼荫里适合褙子慢走。石板路提摆，别在骑楼柱前挡路拍照。早茶前后人少，傍晚灯亮再拍交领。街区免费逛，陈家祠入园可顺路买。',13],
    ['ck-shameen','沙面榕荫','shameen','圆领袍','/images/photo/spot-lizhiwan.jpg','沙面榕树荫下圆领袍最稳，江风比祠堂大，披帛要别牢。欧陆外墙吃侧面光，不要站在车道中央构图。岸线免费，租车转场比走路省裙摆。',14],
    ['ck-ludi','芦笛岩洞外','ludi','短褙子','/images/photo/spot-xiangbi.jpg','芦笛岩洞内不打闪光，短褙子比曳地裙好走。洞外喀斯特再补一张全身。入园约六十五，可订明日，和象鼻山不要强行联票。',15]
  ]
  for (const c of checkins) {
    const [code,name,spotCode,garment,photo,tip,sort] = c
    const [[sp]] = await conn.query('SELECT id FROM spots WHERE spot_code=?',[spotCode])
    await conn.query(
      `INSERT INTO checkin_spots (checkin_code,name,spot_id,garment,photo,tip,sort_order,status)
       VALUES (?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name), tip=VALUES(tip), photo=VALUES(photo)`,
      [code,name,sp?.id||null,garment,photo,tip,sort])
    r.checkins++
  }
}

async function seedGuides(conn, r) {
  if (await empty(conn, 'guides')) {
    const guides = [
      ['头','髻稳、钗少而对称','lilac','头',1],
      ['领','交领右衽，圆领贴颈','mint','领',2],
      ['腰','带打平，结藏在侧后','coral','腰',3],
      ['袖','袖从肘垂下','peach','袖',4],
      ['摆','马面居中，上台阶先提摆','lilac','摆',5],
      ['鞋','布鞋、翘头履','mint','鞋',6]
    ]
    for (const g of guides) {
      await conn.query(`INSERT INTO guides (title,text,tone,mark,sort_order) VALUES (?,?,?,?,?)`, g)
      r.guides++
    }
  }
  if (await empty(conn, 'taboos')) {
    const taboos = ['不要反穿右衽','不要把补子说成官职','不要拉开别人的衣带']
    for (let i=0;i<taboos.length;i++) {
      await conn.query(`INSERT INTO taboos (text,sort_order) VALUES (?,?)`, [taboos[i],i+1])
      r.taboos++
    }
  }
}

async function seedQuiz(conn, r) {
  if (!(await empty(conn, 'quiz_questions'))) return
  const questions = [
    ['交领应该怎样合上？','["左襟压右襟","右襟压左襟","对襟扣到喉"]',0,'右衽是左边的衣襟压住右边。左衽是丧服方向。',1],
    ['齐胸襦裙的「齐胸」指什么？','["把胸口完全露出","裙腰提到胸下","只用抹胸不用襦"]',1,'齐胸是裙腰的位置，不是省略上衣。',2],
    ['马面裙最重要的结构是？','["前后光面裙门居中，两侧打褶","整圈都是细褶","没有开衩的筒裙"]',0,'认马面，先找两片光面是否对齐。',3],
    ['白天赶市集，哪件更合适？','["织金大袖礼服","宋制褙子","拖尾齐胸加长披帛"]',1,'褙子平直、开衩、好走路，适合昼市。',4],
    ['深衣的裳用十二幅，主要是为了？','["多浪费布","对应十二月的象征","方便改成马面"]',1,'十二幅是礼仪象征，也是深衣的记忆点。',5]
  ]
  for (const q of questions) {
    await conn.query(
      `INSERT INTO quiz_questions (question,options,answer,\`explain\`,sort_order,status) VALUES (?,?,?,?,?,1)`, q)
    r.quiz++
  }
}

async function seedBanners(conn, r) {
  if (!(await empty(conn, 'banners'))) return
  const banners = [
    ['广州汉服打卡','/images/photo/banner-guangzhou.jpg','/pages/spot/spot?id=chen',1],
    ['漓江汉服航线','/images/photo/banner-guilin.jpg','/pages/spot/spot?id=xiangbi',2],
    ['月牙泉日落','/images/photo/banner-dunhuang.jpg','/pages/spot/spot?id=yuequan',3]
  ]
  for (const b of banners) {
    await conn.query(`INSERT INTO banners (title,image,link,sort_order,status) VALUES (?,?,?,?,1)`, b)
    r.banners++
  }
}

async function seedCategories(conn, r) {
  if (!(await empty(conn, 'categories'))) return
  const cats = [
    ['景区','#21C7B1','/pages/spots/spots',1],
    ['汉服形制','#FF8A65','/pages/catalog/catalog',2],
    ['活动','#7E6FF0','/pages/festival/festival',3],
    ['文化','#21C7B1','/pages/culture/culture',4],
    ['穿搭指南','#FF8A65','/pages/guide/guide',5],
    ['测验','#7E6FF0','/pages/quiz/quiz',6]
  ]
  for (const c of cats) {
    await conn.query(`INSERT INTO categories (name,color,link,sort_order,status) VALUES (?,?,?,?,1)`, c)
    r.categories++
  }
}

async function seedAdmins(conn, r) {
  await conn.query(
    `INSERT INTO admins (username,password,name,role) VALUES ('admin','admin123','超级管理员','admin')
     ON DUPLICATE KEY UPDATE name=VALUES(name)`)
  r.admins++
}

async function seedHome(conn, r) {
  r.homeCats = r.homeCats || 0
  r.guidesExtra = r.guidesExtra || 0
  r.rankings = r.rankings || 0
  const cats = [
    ['hot', '热门', '/images/photo/cat-hot.png', '/images/photo/banner-dunhuang.jpg', 'hot', 1],
    ['spots', '景区', '/images/photo/cat-spots.png', '/images/photo/banner-guilin.jpg', 'spots', 2],
    ['hanfu', '汉服', '/images/photo/cat-hanfu.png', '/images/photo/banner-guangzhou.jpg', 'hanfu', 3],
    ['food', '美食', '/images/photo/cat-food.png', '/images/photo/spot-lizhiwan.jpg', 'food', 4],
    ['show', '活动', '/images/photo/cat-show.png', '/images/photo/event-opening.jpg', 'show', 5],
    ['guide', '攻略', '/images/photo/cat-guide.png', '/images/photo/spot-mogao.jpg', 'guide', 6]
  ]
  await conn.query(`DELETE FROM home_cats WHERE cat_code IN ('hotel','ticket')`).catch(() => {})
  for (const c of cats) {
    await conn.query(
      `INSERT INTO home_cats (cat_code,name,icon,hero,page_type,sort_order,status)
       VALUES (?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name), icon=VALUES(icon), hero=VALUES(hero), page_type=VALUES(page_type)`,
      c
    )
    r.homeCats++
  }

  await conn.query('DELETE FROM rankings')
  const ranks = [
    [1, 'yuequan', '¥110 · 月售 4.8万'],
    [2, 'xiangbi', '¥75 · 月售 3.2万'],
    [3, 'chen', '¥10 · 月售 2.4万'],
    [4, 'lizhiwan', '岸线免费 · 游船 ¥48'],
    [5, 'mogao', '¥238 · 需预约']
  ]
  for (const [rank, code, label] of ranks) {
    const [[sp]] = await conn.query('SELECT id FROM spots WHERE spot_code=?', [code])
    if (!sp) continue
    await conn.query(
      `INSERT INTO rankings (spot_id, rank, label, sort_order) VALUES (?,?,?,?)`,
      [sp.id, rank, label, rank]
    )
    r.rankings++
  }

  const guides = [
    ['gz-day', '广州汉服一日', '/images/photo/banner-guangzhou.jpg', '广州 · 荔湾', '陈家祠砖雕 + 荔枝湾石桥，下午三点光线最好。', '先陈家祠马面打卡，再荔枝湾石桥提摆夜拍。陈家祠入园约 10 元，岸线免费。'],
    ['gl-river', '漓江汉服航线', '/images/photo/banner-guilin.jpg', '桂林 · 阳朔', '象鼻山倒影与竹筏，江风大披帛要别牢。', '早场象鼻山 75 元，下午转阳朔西街换装。船上宜短摆。'],
    ['dh-sunset', '月牙泉日落档', '/images/photo/banner-dunhuang.jpg', '敦煌', '16:00 前入园，沙地改短摆或圆领袍。', '入园约 110 元。骆驼、滑沙另计。宽摆易灌沙。'],
    ['wear-taboo', '三地穿搭禁忌', '/images/photo/garment-mamian.jpg', '广州 / 桂林 / 敦煌', '右衽、不掀衣带、沙地不曳地。', '祠堂平地可用马面；江边风大束披帛；沙海改平底鞋。']
  ]
  for (let i = 0; i < guides.length; i++) {
    const g = guides[i]
    await conn.query(
      `INSERT INTO travel_guides (guide_code,title,photo,place,summary,body,sort_order,status)
       VALUES (?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE title=VALUES(title), photo=VALUES(photo)`,
      [g[0], g[1], g[2], g[3], g[4], g[5], i + 1]
    )
    r.guidesExtra++
  }
}

module.exports = { run, seedSpots, seedGarments, seedGarmentSpots, seedEvents, seedServices, seedArticles, seedCheckins, seedGuides, seedQuiz, seedBanners, seedCategories, seedAdmins, seedHome, seedSocial }

async function seedSocial(conn, r) {
  r.users = r.users || 0
  r.posts = r.posts || 0
  r.chats = r.chats || 0
  r.notices = r.notices || 0
  const people = [
    ['seed-ning', '西关阿柠', '/images/photo/avatar-01.jpg', 860],
    ['seed-man', '漓江小满', '/images/photo/avatar-02.jpg', 1240],
    ['seed-feng', '沙洲晚风', '/images/photo/garment-ruqun.jpg', 640],
    ['seed-tang', '祠堂阿棠', '/images/photo/garment-mamian.jpg', 980],
    ['seed-quan', '月牙泉客', '/images/photo/garment-qixiong.jpg', 720],
    ['seed-yin', '余荫慢走', '/images/photo/garment-beizi.jpg', 540],
    ['seed-shuo', '阳朔换装', '/images/photo/garment-yuanling.jpg', 430],
    ['seed-ge', '戈壁束带', '/images/photo/garment-zhishen.jpg', 310]
  ]
  const members = []
  for (const [openid, nickname, avatar, growth] of people) {
    await conn.query(
      `INSERT INTO users (openid, nickname, avatar_url) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE nickname=VALUES(nickname), avatar_url=VALUES(avatar_url)`,
      [openid, nickname, avatar]
    )
    const [[user]] = await conn.query('SELECT id FROM users WHERE openid=?', [openid])
    await conn.query(
      `INSERT INTO members (user_id, growth_value, level, card_status) VALUES (?,?,1,0)
       ON DUPLICATE KEY UPDATE growth_value=VALUES(growth_value)`,
      [user.id, growth]
    )
    const [[member]] = await conn.query('SELECT id FROM members WHERE user_id=?', [user.id])
    members.push({ id: member.id, nickname, avatar })
    r.users++
  }
  const [[{ postCnt }]] = await conn.query(
    `SELECT COUNT(*) AS postCnt FROM posts p JOIN members m ON p.member_id=m.id JOIN users u ON m.user_id=u.id WHERE u.openid LIKE 'seed-%'`
  )
  if (!postCnt) {
    const posts = [
      [0, '陈家祠砖雕前把马面裙门摆正，灰塑吃侧面光。交领别被补光灯打白，上台阶先提摆。', ['/images/photo/checkin-chen.jpg'], '广州 · 陈家祠', 186, 24, 1],
      [1, '象鼻山水月洞外倒影只有几分钟。江风大，披帛别在腰后，短摆比齐胸安全。', ['/images/photo/checkin-xiangbi.jpg', '/images/photo/spot-xiangbi.jpg'], '桂林 · 象鼻山', 242, 31, 1],
      [2, '沙州夜市香囊换得很快。鞋底拍干净再进铺，褙子比宽摆好活动。', ['/images/photo/spot-shazhou.jpg'], '敦煌 · 沙州夜市', 128, 16, 0],
      [3, '荔枝湾石桥先提摆。夜灯起来之后明制交领最稳，别站在桥心挡人。', ['/images/photo/checkin-lizhiwan.jpg'], '广州 · 荔枝湾', 164, 19, 1],
      [4, '月牙泉日落档四点前入园。沙地改平底鞋，圆领袍比曳地裙好走。', ['/images/photo/checkin-yuequan.jpg'], '敦煌 · 月牙泉', 209, 27, 0],
      [5, '余荫山房曲廊适合慢走。窄桥提摆，人少的时候再拍池石。', ['/images/photo/spot-yuyin.jpg'], '广州 · 余荫山房', 97, 11, 1],
      [6, '阳朔西街石板路裙门容易绊。褙子开衩好走，先让路再取景。', ['/images/photo/spot-yangshuo.jpg'], '桂林 · 阳朔西街', 143, 18, 0],
      [7, '阳关风大，圆领袍先束带。烽燧前不要曳地，博物馆闭馆前留足时间。', ['/images/photo/spot-yangguan.jpg'], '敦煌 · 阳关', 88, 9, 0]
    ]
    for (let i = 0; i < posts.length; i++) {
      const [who, content, images, location, likes, comments, official] = posts[i]
      const member = members[who]
      if (!member) continue
      await conn.query(
        `INSERT INTO posts (member_id, type, content, images, location, likes, comments, is_official, status, created_at)
         VALUES (?, 'checkin', ?, ?, ?, ?, ?, ?, 1, DATE_SUB(NOW(), INTERVAL ? HOUR))`,
        [member.id, content, JSON.stringify(images), location, likes, comments, official, (i + 1) * 5]
      )
      r.posts++
    }
  }
  const [[{ chatCnt }]] = await conn.query('SELECT COUNT(*) AS chatCnt FROM conversations')
  if (!chatCnt && members[0]) {
    const chats = [
      ['西关阿柠', '/images/photo/avatar-01.jpg', '明天陈家祠还去吗？马面我已经在换装区取好了。', 2, 1],
      ['漓江小满', '/images/photo/avatar-02.jpg', '竹筏改到十点，短摆就行，别穿齐胸。', 1, 3],
      ['月牙泉客', '/images/photo/garment-qixiong.jpg', '日落档四点前入园，平底鞋我多带了一双。', 0, 6],
      ['同袍旅行', '/images/photo/icon-hanfu.jpg', '广州汉服日租已确认，取还在陈家祠换装区，押金可退。', 1, 2],
      ['余荫慢走', '/images/photo/garment-beizi.jpg', '曲廊人少再拍，窄桥我帮你提一下摆。', 0, 8],
      ['阳朔换装', '/images/photo/garment-yuanling.jpg', '西街石板路裙门容易绊，褙子开衩更好走。', 3, 4]
    ]
    for (const [name, avatar, last, unread, hours] of chats) {
      await conn.query(
        `INSERT INTO conversations (member_id, target_type, target_name, target_avatar, last_message, unread, updated_at)
         VALUES (?, 'user', ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? HOUR))`,
        [members[0].id, name, avatar, last, unread, hours]
      )
      r.chats++
    }
  }
  const [[{ noteCnt }]] = await conn.query('SELECT COUNT(*) AS noteCnt FROM notifications')
  if (!noteCnt && members[0]) {
    const notes = [
      ['like', '西关阿柠 赞了你的打卡', '陈家祠砖雕那条，她说马面裙门摆得很正。', 1],
      ['comment', '漓江小满 评论了你', '江风大，披帛别在腰后，短摆比齐胸安全。', 2],
      ['fan', '沙洲晚风 关注了你', '敦煌同袍，想约沙州夜市一起逛香囊摊。', 3],
      ['at', '祠堂阿棠 提到了你', '在「砖雕前把马面裙门摆正」里 @ 了你，问下午还去不去。', 4],
      ['order', '陈家祠入园已确认', '2 份全天通行，随时可用，可订明日，随时退。', 5],
      ['benefit', '租赁订单待取衣', '广州汉服日租 ¥168，取还点：陈家祠换装区。', 7],
      ['comment', '月牙泉客 评论了你', '沙地别穿宽摆，圆领袍和短摆更稳，骆驼项目另算。', 9],
      ['like', '余荫慢走 赞了你的打卡', '曲廊那张侧面光很好，窄桥记得提摆。', 12],
      ['system', '出行提醒', '两江四湖夜航建议马面居中，灯密人多，别挡舱门。', 20]
    ]
    for (const [type, title, content, hours] of notes) {
      await conn.query(
        `INSERT INTO notifications (member_id, type, title, content, is_read, created_at)
         VALUES (?, ?, ?, ?, 0, DATE_SUB(NOW(), INTERVAL ? HOUR))`,
        [members[0].id, type, title, content, hours]
      )
      r.notices++
    }
  }
}

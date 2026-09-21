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
      seedCategories, seedHome, seedAdmins
    ]
    for (const fn of steps) {
      try {
        await fn(conn, r)
      } catch (e) {
        console.error('seed', fn.name, e.message)
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
    ['shazhou','沙州夜市','敦煌','敦煌','街区','coral','沙','/images/photo/spot-shazhou.jpg','全天','约 2 小时','敦煌沙州夜市。香囊、文创、小吃摊位轮换。','褙子市集好活动，沙地注意鞋底。',12]
  ]
  for (const s of spots) {
    await conn.query(
      `INSERT INTO spots (spot_code,name,city,region,level,tone,mark,photo,open_time,stay,intro,hanfu_tip,sort_order,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name)`, s)
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
      `INSERT INTO events (event_code,title,day,place,spot_id,garment_id,tone,mark,photo,desc,sort_order,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE title=VALUES(title)`,
      [code,title,day,place,sp?.id||null,gm?.id||null,tone,mark,photo,desc,sort])
    r.events++
  }
}

async function seedServices(conn, r) {
  const services = [
    ['tk-yuyin','ticket','余荫山房门票','yuyin',1800,'待定','广州 · 番禺','当日入园。预约通道本版只展示。','["参考价","支付暂未开通"]',1],
    ['tk-chen','ticket','陈家祠门票','chen',1000,'待定','广州 · 荔湾','含主体建筑参观。语音导览另计。','["当日有效","支付暂未开通"]',2],
    ['tk-baiyun','ticket','白云山门票','baiyun',500,'待定','广州 · 白云','大门入园。索道等区域另计。','["参考价","支付暂未开通"]',3],
    ['tk-xiangbi','ticket','象鼻山门票','xiangbi',4000,'待定','桂林','含象山园区。漓江游船另计。','["参考价","支付暂未开通"]',4],
    ['tk-lihe','ticket','漓江航线票','lihe',21000,'待定','桂林 · 阳朔','班次待定。竹筏与游船分开计价。','["参考价","支付暂未开通"]',5],
    ['tk-liangjiang','ticket','两江四湖夜游','liangjiang',21000,'待定','桂林','环城水系夜航。日月双塔以当日公示为准。','["参考价","支付暂未开通"]',6],
    ['tk-mogao','ticket','莫高窟参观票','mogao',23800,'待定','敦煌','含数字展示中心与指定洞窟。窟内禁止拍照。','["需预约时段","支付暂未开通"]',7],
    ['tk-yuequan','ticket','鸣沙山月牙泉门票','yuequan',11000,'待定','敦煌','含沙山与月牙泉核心区。骆驼等项目另计。','["参考价","支付暂未开通"]',8],
    ['tk-yangguan','ticket','阳关门票','yangguan',5000,'待定','敦煌','含遗址区参观。','["参考价","支付暂未开通"]',9],
    ['fr-lizhiwan','free','荔枝湾岸线免费通行','lizhiwan',0,'待定','广州 · 荔湾','部分岸线与骑楼可逛。游船另计。','["岸线免费","游船另购"]',10],
    ['fr-yangshuo','free','阳朔西街免费通行','yangshuo',0,'待定','桂林 · 阳朔','街区可逛。遇龙河、漓江航线另计。','["街区免费","景点另计"]',11],
    ['fr-shazhou','free','沙州夜市免费通行','shazhou',0,'待定','敦煌','街巷可逛。摊位消费另计。','["街区免费"]',12],
    ['rt-gz','rent','广州汉服日租','yuyin',16800,'当日取还','余荫山房 / 陈家祠','襦裙、褙子、马面可租。取还在换装区。头饰可加。','["汉服友好","随时退","可订明日"]',13],
    ['rt-gl','rent','桂林汉服日租','xiangbi',18800,'当日取还','象鼻山 / 阳朔','襦裙、圆领袍适合江边与西街。风大披帛另配。','["汉服友好","随时退","可订明日"]',14],
    ['rt-dh','rent','敦煌汉服日租','yuequan',19800,'当日取还','月牙泉 / 沙州','沙地改短摆或圆领袍。日落档需提前取衣。','["汉服友好","随时退","可订明日"]',15],
    ['rt-gz-half','rent','广州汉服半日租','chen',9800,'4 小时','陈家祠 / 荔枝湾','半日取还。适合祠堂快拍，不含头饰。','["今日可用","随时退"]',33],
    ['rt-gz-couple','rent','广州情侣汉服双人套','lizhiwan',29800,'当日取还','荔枝湾 / 陈家祠','交领+马面或褙子双人。含基础头饰，妆造另计。','["可订明日","随时退"]',34],
    ['rt-gz-mamian','rent','马面裙精拍套餐','chen',22800,'当日取还','陈家祠','明制马面+交领+头饰。砖雕前最稳，避开高峰。','["汉服友好","可订明日"]',35],
    ['rt-gl-half','rent','桂林汉服半日租','xiangbi',10800,'4 小时','象鼻山','江边短摆。披帛需另配别针。','["今日可用","随时退"]',36],
    ['rt-gl-boat','rent','漓江航拍汉服套','lihe',26800,'半天','漓江航线','船上短摆+圆领袍。不含船票，班次待定。','["可订明日","过期退"]',37],
    ['rt-dh-sunset','rent','月牙泉日落汉服套','yuequan',25800,'下午档','鸣沙山月牙泉','圆领袍或短摆。十六点前取衣，平底鞋自备。','["汉服友好","可订明日"]',38],
    ['rt-dh-couple','rent','敦煌情侣汉服双人套','shazhou',31800,'当日取还','沙州夜市 / 月牙泉','双人圆领或褙子。沙地不建议曳地。','["可订明日","随时退"]',39],
    ['sh-garden','show','园林雅集观演','yuyin',0,'待定','余荫山房 · 主舞台','持当日园票可预约观演席。本版只展示。','["通票预约席","支付暂未开通"]',16],
    ['sh-night','show','荔枝湾夜游','lizhiwan',3900,'待定','广州 · 荔湾','夜场岸线与少量航线。摊位消费另计。','["参考价","支付暂未开通"]',17],
    ['sh-boat','show','漓江 / 两江夜航','lihe',8000,'待定','桂林','日航与夜航班次待定。不与门票强制捆绑。','["参考价","支付暂未开通"]',18],
    ['sh-yue','show','敦煌乐舞','mogao',12800,'待定','敦煌','主题展演。与莫高窟参观可连看，场次待定。','["参考价","支付暂未开通"]',19],
    ['ht-gz','hotel','西关园林客栈','yuyin',32800,'待定','广州 · 荔湾 / 番禺','近陈家祠、荔枝湾一线。本版只展示房型。','["大床 / 双床","支付暂未开通"]',20],
    ['ht-gl','hotel','漓江景客栈','xiangbi',39800,'待定','桂林 / 阳朔','可择市区近象山，或阳朔近西街。不含航线票。','["参考价","支付暂未开通"]',21],
    ['ht-dh','hotel','沙州驿站','shazhou',28800,'待定','敦煌 · 沙州','近夜市与鸣沙山。本版只展示房型。','["参考价","支付暂未开通"]',22],
    ['cr-gz','car','广州租车','yuyin',15000,'待定','广州','市区短租。园林间转场用。','["参考价","支付暂未开通"]',23],
    ['cr-gl','car','桂林租车','xiangbi',18000,'待定','桂林','市区到阳朔短租。','["参考价","支付暂未开通"]',24],
    ['fl-open','float','开幕花车','baiyun',0,'待定','广州文化公园','开幕巡游花车。本版只展示。','["暂未开放报名"]',25],
    ['sp-fan','shop','文创扇铺','chen',3900,'现货','陈家祠 / 阳朔','团扇、折扇手作。','["包邮满 99 元"]',26],
    ['fd-tea','food','广州早茶点心','lizhiwan',6800,'需预约','广州 · 荔湾','虾饺、干蒸、叉烧包。汉服出行建议避开午市高峰。','["人均参考","包厢需提前"]',27],
    ['fd-sweet','food','西关糖水','chen',2800,'当日可用','广州 · 荔湾','姜撞奶、双皮奶。陈家祠步行约 8 分钟。','["甜品"]',28],
    ['fd-rice','food','桂林米粉','xiangbi',2200,'当日可用','桂林象山区','卤水粉、酸辣粉。象鼻山出园即可吃。','["回民街亦有"]',29],
    ['fd-beerfish','food','阳朔啤酒鱼','yangshuo',8800,'需预约','桂林 · 阳朔西街','漓江鲜鱼。建议换装后再入座，裙摆勿扫桌。','["建议 2 人份"]',30],
    ['fd-huangmian','food','敦煌黄面','shazhou',3800,'夜市时段','敦煌 · 沙州夜市','驴肉黄面、烤羊肉。夜市街巷免费逛。','["夜市"]',31],
    ['fd-yangrou','food','月牙泉烤全羊','yuequan',16800,'需预约','敦煌 · 月牙泉景区外','日落档结束后用餐。沙地建议改短摆。','["建议 4 人"]',32]
  ]
  for (const s of services) {
    const [code,type,name,spotCode,price,day,place,desc,notes,sort] = s
    const [[sp]] = await conn.query('SELECT id FROM spots WHERE spot_code=?',[spotCode])
    await conn.query(
      `INSERT INTO services (service_code,type,name,spot_id,price,day,place,desc,notes,sort_order,status)
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
    ['festival','节俗','lilac','俗','["看见、学会穿、走回街道"]','["形制不是只在舞台上。广州园林、桂林江岸、敦煌沙海，才是衣服被看见的地方。","先认形制，再选广州、桂林、敦煌的景区。门票、演出、租车、酒店可以串成一条出行，但本版先展示、不收款。"]',5]
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
    ['ck-chen','陈家祠砖雕','chen','马面 / 褙子','/images/photo/checkin-chen.jpg','陈家祠砖雕前把马面裙门摆正，避开午后导游团。灰塑吃侧面光，交领不要被补光灯打翻白。',1],
    ['ck-lizhiwan','荔枝湾石桥','lizhiwan','明制交领','/images/photo/checkin-lizhiwan.jpg','荔枝湾石桥先提摆再上台阶，骑楼廊道袖不要横扫行人。夜灯起来之后，明制交领最稳。',2],
    ['ck-xiangbi','象鼻山倒影','xiangbi','襦裙 / 圆领袍','/images/photo/checkin-xiangbi.jpg','象鼻山水月洞外倒影只要三分钟窗口。江风大，披帛别在腰后，襦裙短摆比齐胸安全。',3],
    ['ck-yuequan','月牙泉日落','yuequan','襦裙 / 圆领袍','/images/photo/checkin-yuequan.jpg','月牙泉日落档十六点前入园。沙地改平底鞋，宽摆会灌沙，圆领袍比曳地裙好走。',4],
    ['ck-yuyin','余荫山房曲廊','yuyin','褙子','/images/photo/spot-yuyin.jpg','余荫山房曲廊适合慢走，褙子过膝但不拖地。窄桥提摆，不要为了构图挡别人过廊。',5],
    ['ck-baiyun','白云山轻徒步','baiyun','直裰 / 短褙子','/images/photo/spot-baiyun.jpg','白云山把汉服放在园林之后的轻徒步。山路不建议曳地裙，改短褙子或直裰，索道分区另看。',6],
    ['ck-yangshuo','阳朔西街换装','yangshuo','褙子','/images/photo/spot-yangshuo.jpg','阳朔西街石板路注意裙门。换装点就在街区，褙子开衩好走路，夜色里不要抢灯会机位。',7],
    ['ck-shazhou','沙州夜市摊位','shazhou','褙子','/images/photo/spot-shazhou.jpg','沙州夜市香囊摊位轮换很快。褙子市集好活动，沙地鞋底先拍干净再进铺，别用宽摆扫货架。',8]
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
      `INSERT INTO quiz_questions (question,options,answer,explain,sort_order,status) VALUES (?,?,?,?,?,1)`, q)
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
    ['hotel', '酒店', '/images/photo/cat-hotel.png', '/images/photo/hotel-gz.jpg', 'hotel', 5],
    ['ticket', '门票', '/images/photo/cat-ticket.png', '/images/photo/spot-yuequan.jpg', 'ticket', 6],
    ['show', '演出', '/images/photo/cat-show.png', '/images/photo/event-opening.jpg', 'show', 7],
    ['guide', '攻略', '/images/photo/cat-guide.png', '/images/photo/spot-mogao.jpg', 'guide', 8]
  ]
  for (const c of cats) {
    await conn.query(
      `INSERT INTO home_cats (cat_code,name,icon,hero,page_type,sort_order,status)
       VALUES (?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name), icon=VALUES(icon), hero=VALUES(hero), page_type=VALUES(page_type)`,
      c
    )
    r.homeCats++
  }

  const [[{ rankCnt }]] = await conn.query('SELECT COUNT(*) AS rankCnt FROM rankings')
  if (!rankCnt) {
    const ranks = [
      [1, 'yuequan', '¥110 · 月售 4.8万'],
      [2, 'xiangbi', '¥75 · 月售 3.2万'],
      [3, 'chen', '¥10 · 月售 2.4万']
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
  }

  const guides = [
    ['gz-day', '广州汉服一日', '/images/photo/banner-guangzhou.jpg', '广州 · 荔湾', '陈家祠砖雕 + 荔枝湾石桥，下午三点光线最好。', '先陈家祠马面打卡，再荔枝湾石桥提摆夜拍。门票陈家祠 10 元，岸线免费。'],
    ['gl-river', '漓江汉服航线', '/images/photo/banner-guilin.jpg', '桂林 · 阳朔', '象鼻山倒影与竹筏，江风大披帛要别牢。', '早场象鼻山 75 元，下午转阳朔西街换装。船上宜短摆。'],
    ['dh-sunset', '月牙泉日落档', '/images/photo/banner-dunhuang.jpg', '敦煌', '16:00 前入园，沙地改短摆或圆领袍。', '门票 110 元。骆驼、滑沙另计。宽摆易灌沙。'],
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

module.exports = { run, seedSpots, seedGarments, seedGarmentSpots, seedEvents, seedServices, seedArticles, seedCheckins, seedGuides, seedQuiz, seedBanners, seedCategories, seedAdmins, seedHome }

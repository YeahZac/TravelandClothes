export const brand = {
  name: '全民优享',
  skin: '能量罐',
  slogan: '每天打开，攒能量兑好物',
}

export const user = {
  id: '',
  nickName: '点击登录',
  avatarUrl: '',
  gender: '',
  loggedIn: false,
  level: 1,
  levelName: '能量新星',
  continuousDays: 0,
  points: 0,
  coins: 0,
  lotteryChance: 0,
  energy: 0,
  stepsToday: 0,
  stepsSynced: false,
  inviteCode: '',
  frozenInviteReward: 0,
  validInviteCount: 0,
}

export const growth = {
  targetName: '首罐能量礼',
  targetGift: '便携化妆镜',
  current: 60,
  total: 100,
  stage: 1,
  daysLeftHint: '再充一点就能兑',
  almostThere: true,
}

export const checkin = {
  todayDone: false,
  dayIndex: 5,
  streak: 5,
  rewards: [
    { day: 1, label: '+20', type: 'energy', value: 20 },
    { day: 2, label: '+30', type: 'energy', value: 30 },
    { day: 3, label: '抽×1', type: 'lottery', value: 1 },
    { day: 4, label: '+40', type: 'energy', value: 40 },
    { day: 5, label: '+50', type: 'energy', value: 50 },
    { day: 6, label: '抽×1', type: 'lottery', value: 1 },
    { day: 7, label: '宝箱', type: 'key', value: 1 },
  ],
}

export const banners = [
  {
    id: 'b1',
    title: '汉服节门票开售',
    sub: '星火成炬 · 早鸟价',
    tone: 'orange',
    link: 'festival',
  },
  {
    id: 'b2',
    title: '商城新到多巴胺好物',
    sub: '能量值最高抵 10%',
    tone: 'blue',
    link: 'mall',
  },
  {
    id: 'b3',
    title: '晚场开兑进行中',
    sub: '20:00–22:00 限量',
    tone: 'mint',
    link: 'energy',
  },
]

export const quickEntries = [
  { id: 'q1', name: '每日签到', icon: '签', tone: 'orange', action: 'checkin' },
  { id: 'q2', name: '幸运抽奖', icon: '抽', tone: 'blue', action: 'lottery' },
  { id: 'q3', name: '汉服节', icon: '节', tone: 'coral', action: 'festival' },
  { id: 'q4', name: '逛商城', icon: '购', tone: 'mint', action: 'mall' },
  { id: 'q5', name: '兑好礼', icon: '兑', tone: 'gold', action: 'gift' },
  { id: 'q6', name: '邀好友', icon: '邀', tone: 'purple', action: 'invite' },
]

export const hotActivities = [
  { id: 'h1', name: '幸运大转盘', desc: '百万能量等你拿', tone: 'blue', action: 'lottery' },
  { id: 'h2', name: '汉服节购票', desc: '日通票早鸟中', tone: 'orange', action: 'festival' },
  { id: 'h3', name: '红包雨预告', desc: '能量雨 · 非整提现', tone: 'coral', action: 'energy' },
  { id: 'h4', name: '新人 7 日礼', desc: '连签开宝箱', tone: 'mint', action: 'checkin' },
]

export const contents = [
  {
    id: 'c1',
    type: 'policy',
    title: '活动规则与兑礼须知',
    summary: '激励综合成本、熔断与履约说明',
    time: '置顶',
  },
  {
    id: 'c2',
    type: 'news',
    title: '晚场开兑剩余 37 个名额',
    summary: '今日不做就亏 · 20:00–22:00',
    time: '刚刚',
  },
  {
    id: 'c3',
    type: 'news',
    title: '汉服节联票上新：节庆 + 入园',
    summary: '购票可额外得能量',
    time: '1 小时前',
  },
  {
    id: 'c4',
    type: 'policy',
    title: '用户协议与隐私政策摘要',
    summary: '能量值不可提现交易',
    time: '公告',
  },
]

export const timeWindows = {
  evening: {
    label: '晚场开兑',
    start: '20:00',
    end: '22:00',
    open: true,
    countdown: '01:28:12',
  },
}

export const tasks = [
  {
    id: 't_checkin',
    title: '今日签到',
    desc: '连续第 5 天',
    reward: '+50 能量',
    status: 'todo',
    action: 'checkin',
    icon: 'check',
    progress: '',
  },
  {
    id: 't_steps',
    title: '步行换能量',
    desc: '今日 6420 步 · 已达 6k 档',
    reward: '+80 能量',
    status: 'claim',
    action: 'steps',
    icon: 'steps',
    progress: '1/1',
  },
  {
    id: 't_browse',
    title: '逛商城 15 秒',
    desc: '浏览加速养成',
    reward: '进度 +3%',
    status: 'todo',
    action: 'mall',
    icon: 'shop',
    progress: '0/1',
  },
  {
    id: 't_festival',
    title: '逛汉服节票务',
    desc: '了解票种即可',
    reward: '+20 能量',
    status: 'todo',
    action: 'festival',
    icon: 'fest',
    progress: '0/1',
  },
  {
    id: 't_video',
    title: '看视频得能量',
    desc: '每日上限 2 次',
    reward: '+30 能量',
    status: 'todo',
    action: 'ad',
    icon: 'play',
    progress: '0/2',
  },
  {
    id: 't_invite',
    title: '邀 1 位新朋友',
    desc: '有效新增冻结 24h',
    reward: '+100 能量',
    status: 'todo',
    action: 'invite',
    icon: 'invite',
    progress: '0/1',
  },
]

export const lotteryPool = [
  { id: 'p1', name: '谢谢参与', weightHint: '常见', color: '#9AA3AF' },
  { id: 'p2', name: '+30 能量值', weightHint: '常见', color: '#2F6BFF' },
  { id: 'p3', name: '+80 能量值', weightHint: '较常见', color: '#2EC4B6' },
  { id: 'p4', name: '+50 能量值', weightHint: '较少', color: '#FF7A1A' },
  { id: 'p5', name: '迷你钥匙扣', weightHint: '稀有', color: '#FF5C4A' },
  { id: 'p6', name: '限定徽章', weightHint: '超稀有', color: '#FFB020' },
]

export const lotteryHistory = [
  { id: 'h1', name: '+30 能量值', time: '今天 10:21' },
  { id: 'h2', name: '谢谢参与 · 返还 +5 能量值', time: '昨天 21:03' },
]

export const festival = {
  slogan: '星火成炬 四海归衣',
  subtitle: '2026 汉服节 · 中国广州',
  seal: '甲辰汉服',
  intro:
    '2026汉服节以「星火成炬·四海归衣」为主题，汇聚全国各地汉服爱好者与传统文化社团，通过方阵巡游、文化论坛、时尚盛典、夜场狂欢等多元形式，展现中华传统服饰之美。本平台同步售卖官方授权场次门票（模拟）。',
  meta: [
    { label: '活动时间', value: '11.21-29' },
    { label: '活动地点', value: '广州市文化馆' },
    { label: '主办单位', value: '汉服广东' },
  ],
  stats: [
    { value: '20万+', label: '参与人次' },
    { value: '100万+', label: '覆盖游客' },
    { value: '70+', label: '支持协会' },
  ],
  guests: [
    { name: '璇玑', role: '文化学者', mark: '学' },
    { name: '浅野', role: '汉服设计', mark: '设' },
    { name: '清音', role: '古琴演奏', mark: '琴' },
    { name: '墨白', role: '书法家', mark: '书' },
    { name: '云裳', role: '汉服模特', mark: '模' },
  ],
  highlights: [
    { id: 'parade', name: '方阵巡游', desc: '全国社团联袂巡游，感受衣冠之美' },
    { id: 'forum', name: '文化论坛', desc: '学者对谈形制、礼仪与当代穿着' },
    { id: 'night', name: '夜场盛典', desc: '灯光与乐舞交织的汉服之夜' },
  ],
}

export const tickets = [
  {
    id: 'tk_day',
    name: '汉服节日通票',
    desc: '当日场馆通行 · 不含夜场盛典',
    price: 68,
    marketPrice: 88,
    stock: 520,
    tag: '早鸟',
    tone: 'blue',
    energyBonus: 30,
  },
  {
    id: 'tk_night',
    name: '夜场盛典票',
    desc: '夜场乐舞与灯光秀指定席',
    price: 128,
    marketPrice: 168,
    stock: 180,
    tag: '热卖',
    tone: 'orange',
    energyBonus: 60,
  },
  {
    id: 'tk_vip',
    name: '巡游观礼席',
    desc: '主会场观礼席 · 含纪念册',
    price: 198,
    marketPrice: 258,
    stock: 60,
    tag: '限量',
    tone: 'gold',
    energyBonus: 100,
  },
  {
    id: 'tk_combo',
    name: '联票：节庆+入园',
    desc: '日通票 + 指定园林入园一次',
    price: 98,
    marketPrice: 130,
    stock: 240,
    tag: '超值',
    tone: 'mint',
    energyBonus: 50,
  },
]

export const gifts = [
  {
    id: 'g1',
    name: '便携化妆镜',
    coverTone: 'peach',
    costPoints: 0,
    costEnergy: 100,
    mode: 'growth',
    tag: '首兑专属',
    stock: 128,
    needInvite: 0,
    needCash: 0,
    needStreak: 0,
    desc: '首轮养成满即可兑',
  },
  {
    id: 'g2',
    name: '卡通数据线收纳',
    coverTone: 'mint',
    costPoints: 600,
    costEnergy: 0,
    mode: 'points',
    tag: '能量兑',
    stock: 86,
    needInvite: 0,
    needCash: 0,
    needStreak: 0,
    desc: '纯能量值兑换',
  },
  {
    id: 'g3',
    name: '随身香氛片 ×3',
    coverTone: 'lilac',
    costPoints: 300,
    costEnergy: 0,
    mode: 'points_invite',
    tag: '邀 1 人',
    stock: 40,
    needInvite: 1,
    needCash: 0,
    needStreak: 0,
    desc: '能量值 + 有效邀请',
  },
  {
    id: 'g4',
    name: '潮玩贴纸包',
    coverTone: 'sun',
    costPoints: 200,
    costEnergy: 0,
    mode: 'points_streak',
    tag: '连签 7 天',
    stock: 55,
    needInvite: 0,
    needCash: 0,
    needStreak: 7,
    desc: '能量值 + 连签',
  },
  {
    id: 'g5',
    name: '趣味冰箱贴',
    coverTone: 'coral',
    costPoints: 100,
    costEnergy: 0,
    mode: 'points_cash',
    tag: '¥1+能量',
    stock: 200,
    needInvite: 0,
    needCash: 100,
    needStreak: 0,
    desc: '小额现金 + 能量值',
  },
]

export const friends = [
  { id: 'f1', name: '小林', energy: 36, status: 'stealable', tip: '可收取' },
  { id: 'f2', name: 'Momo', energy: 18, status: 'stealable', tip: '可收取' },
  { id: 'f3', name: '阿凯', energy: 0, status: 'empty', tip: '已收完' },
  { id: 'f4', name: '七七', energy: 52, status: 'stealable', tip: '可收取' },
]

export const team = {
  name: '今日小队',
  members: [
    { name: '阿柚', done: true, me: true },
    { name: '小林', done: true, me: false },
    { name: '待加入', done: false, me: false, empty: true },
  ],
  reward: '全员达标共享 +60 能量',
  gapTip: '还差 1 人打开',
}

export const mallGoods = [
  { id: 'm1', name: '亚克力手机支架', price: 19.9, pointsOff: 2, payPoints: 20, payCashCent: 1790, payMode: 'mix', payLabel: '20能量值+¥17.9', tag: '热卖', tone: 'mint' },
  { id: 'm2', name: '多巴胺发夹套装', price: 15.9, pointsOff: 1.5, payPoints: 15, payCashCent: 1440, payMode: 'mix', payLabel: '15能量值+¥14.4', tag: '新品', tone: 'peach' },
  { id: 'm3', name: '迷你桌面风扇', price: 29.9, pointsOff: 3, payPoints: 30, payCashCent: 2690, payMode: 'mix', payLabel: '30能量值+¥26.9', tag: '加速', tone: 'sky' },
  { id: 'm4', name: '趣味帆布袋', price: 39.9, pointsOff: 4, payPoints: 40, payCashCent: 3590, payMode: 'mix', payLabel: '40能量值+¥35.9', tag: '', tone: 'sun' },
  { id: 'm5', name: '汉服发簪小样', price: 25.9, pointsOff: 2.5, payPoints: 25, payCashCent: 2340, payMode: 'mix', payLabel: '25能量值+¥23.4', tag: '节庆', tone: 'gold' },
  { id: 'm6', name: '香囊挂件', price: 12.9, pointsOff: 1, payPoints: 10, payCashCent: 1190, payMode: 'mix', payLabel: '10能量值+¥11.9', tag: '', tone: 'coral' },
]

export const fulfillments = [
  { id: 'o1', name: '卡通钥匙扣', status: 'shipped', statusText: '已发货', time: '11-02', type: 'gift' },
  { id: 'o2', name: '迷你便签本', status: 'pending', statusText: '待发货', time: '11-04', type: 'gift' },
]

export const ticketOrders = [
  {
    id: 'to1',
    name: '汉服节日通票',
    status: 'unused',
    statusText: '待使用',
    day: '2026-11-22',
    code: 'HF88601',
  },
]

export const feed = [
  { id: 'n1', text: '小林 刚兑走「潮玩贴纸包」', time: '2 分钟前' },
  { id: 'n2', text: '晚场开兑进行中 · 剩余名额 37', time: '刚刚' },
  { id: 'n3', text: '阿柚 购买了夜场盛典票', time: '5 分钟前' },
]

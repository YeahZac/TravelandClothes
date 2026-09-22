const LEVELS = [
  { level: 0, name: '普通会员', min: 0, robe: '同袍' },
  { level: 1, name: '素袍会员', min: 300, robe: '素袍' },
  { level: 2, name: '青袍会员', min: 1000, robe: '青袍' },
  { level: 3, name: '玄袍会员', min: 3000, robe: '玄袍' },
  { level: 4, name: '金袍会员', min: 8000, robe: '金袍' }
]

const CARD_SKUS = [
  {
    skuCode: 'earlybird',
    name: '早鸟款',
    price: 29900,
    scenicTimes: 10,
    hotelNights: 3,
    showTimes: 2,
    rentTimes: 3,
    studyTimes: 0,
    companions: 4,
    tag: '限量 1000',
    desc: '与标准款同权，汉服节前开售'
  },
  {
    skuCode: 'standard',
    name: '标准款',
    price: 39900,
    scenicTimes: 10,
    hotelNights: 3,
    showTimes: 2,
    rentTimes: 3,
    studyTimes: 0,
    companions: 4,
    tag: '最多人选',
    desc: '10 次景区 + 酒店协议价 + 演出与汉服租赁'
  },
  {
    skuCode: 'family',
    name: '家庭款',
    price: 99900,
    scenicTimes: 20,
    hotelNights: 6,
    showTimes: 4,
    rentTimes: 3,
    studyTimes: 5,
    companions: 4,
    tag: '亲子',
    desc: '按户核销，含研学 5 次'
  }
]

const GROWTH_ACTIONS = {
  consume: { label: '实付消费', per: 1 },
  checkin: { label: '到场核销', per: 20 },
  post: { label: '打卡动态', per: 10 },
  like: { label: '内容被赞', per: 1 },
  invite: { label: '邀请首单', per: 50 },
  route: { label: '走完线路', per: 200 },
  festival: { label: '汉服节到场', per: 100 },
  card: { label: '开通年卡', per: 1 },
  trial: { label: '试用开通', per: 10 }
}

function calcUnlockable(growth) {
  let lv = 0
  LEVELS.forEach((item) => {
    if (growth >= item.min) lv = item.level
  })
  return lv
}

function resolveLevel(member) {
  const unlockable = calcUnlockable(member.growthValue || 0)
  if (member.cardStatus !== 1) {
    return { level: 0, name: '普通会员', unlockable, unlockName: LEVELS[unlockable].name }
  }
  const level = Math.max(1, unlockable)
  return { level, name: LEVELS[level].name, unlockable, unlockName: LEVELS[unlockable].name }
}

function nextGap(member) {
  const info = resolveLevel(member)
  const current = member.cardStatus === 1 ? info.level : info.unlockable
  const next = LEVELS[Math.min(4, current + 1)]
  const remain = Math.max(0, next.min - (member.growthValue || 0))
  return { nextName: next.name, remain, nextMin: next.min }
}

function yuan(fen) {
  return (Number(fen || 0) / 100).toFixed(fen % 100 === 0 ? 0 : 2)
}

function ticketPay(member, listYuan, type) {
  const hasCard = member.cardStatus === 1 && member.card && member.card.status === 1
  const canCover = hasCard && type === 'ticket' && (member.card.remainScenic || 0) > 0
  const payYuan = canCover ? 0 : listYuan
  const saveYuan = canCover ? listYuan : 0
  return { hasCard, canCover, payYuan, saveYuan, hookYuan: listYuan }
}

module.exports = {
  LEVELS,
  CARD_SKUS,
  GROWTH_ACTIONS,
  calcUnlockable,
  resolveLevel,
  nextGap,
  yuan,
  ticketPay
}

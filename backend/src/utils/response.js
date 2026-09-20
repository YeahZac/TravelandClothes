// 统一响应格式
function success(res, data, msg) {
  return res.json({ code: 0, msg: msg || 'ok', data })
}

function fail(res, msg, code) {
  return res.json({ code: code || 1, msg: msg || 'error', data: null })
}

// 成长值等级门槛
const LEVEL_THRESHOLDS = [
  { level: 0, name: '普通会员', min: 0 },
  { level: 1, name: '素袍会员', min: 300 },
  { level: 2, name: '青袍会员', min: 1000 },
  { level: 3, name: '玄袍会员', min: 3000 },
  { level: 4, name: '金袍会员', min: 8000 }
]

// 根据成长值计算可解锁等级（不含持卡判断）
function calcLevelByGrowth(growth) {
  let lv = 0
  for (const t of LEVEL_THRESHOLDS) {
    if (growth >= t.min) lv = t.level
  }
  return lv
}

// 持卡才解锁袍级；无卡一律普通会员。持卡最低素袍。
function resolveMemberLevel(growth, cardStatus) {
  const unlockable = calcLevelByGrowth(growth)
  if (cardStatus !== 1) {
    return { level: 0, name: LEVEL_THRESHOLDS[0].name, unlockable, unlockName: LEVEL_THRESHOLDS[unlockable].name }
  }
  const level = Math.max(1, unlockable)
  return { level, name: LEVEL_THRESHOLDS[level].name, unlockable, unlockName: LEVEL_THRESHOLDS[unlockable].name }
}

function ticketQuote(card, listFen, type) {
  const hasCard = !!(card && card.status === 1)
  const canCover = hasCard && type === 'ticket' && (card.remain_scenic || 0) > 0
  return {
    hasCard,
    canCover,
    payFen: canCover ? 0 : listFen,
    saveFen: canCover ? listFen : 0,
    hookFen: listFen
  }
}

// 成长值行为配置
const GROWTH_ACTIONS = {
  consume: { per: 1, monthlyCap: 0 },      // 1元=1值，无上限
  checkin: { per: 20, monthlyCap: 0 },     // 核销+20
  post: { per: 10, monthlyCap: 300 },      // 打卡图+10，月上限300
  like: { per: 1, monthlyCap: 100 },       // 被点赞+1，月上限100
  invite: { per: 50, monthlyCap: 500 },    // 邀请+50，月上限500
  route: { per: 200, monthlyCap: 0 },      // 完成线路+200
  festival: { per: 100, monthlyCap: 0 },   // 汉服节+100
  task: { per: 30, monthlyCap: 150 },      // 亲子任务+30
  repost: { per: 50, monthlyCap: 300 }     // 官方转发+50
}

// 成长值加速倍数
function getGrowthMultiplier(cardStatus) {
  return cardStatus === 1 ? 1.5 : 1.0
}

module.exports = { success, fail, LEVEL_THRESHOLDS, calcLevelByGrowth, resolveMemberLevel, ticketQuote, GROWTH_ACTIONS, getGrowthMultiplier }

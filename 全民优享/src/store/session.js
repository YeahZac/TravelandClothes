import { reactive } from 'vue'
import {
  user as seedUser,
  growth as seedGrowth,
  checkin as seedCheckin,
  tasks as seedTasks,
} from '../mock/data.js'
import { USE_REMOTE } from '../api/request.js'

function guestUser() {
  return { ...seedUser, loggedIn: false, energy: 0, points: 0, coins: 0, lotteryChance: 0, stepsToday: 0 }
}

function guestCheckin() {
  return {
    ...seedCheckin,
    todayDone: false,
    dayIndex: 1,
    streak: 0,
    lastDayKey: '',
    rewards: seedCheckin.rewards.map((r) => ({ ...r })),
  }
}

function guestGrowth() {
  return { ...seedGrowth, current: 0, almostThere: false, daysLeftHint: '登录后开始攒进度' }
}

function guestCan() {
  return {
    pendingEnergy: 0,
    produceIntervalMs: 3 * 60 * 1000,
    lastProducedAt: Date.now(),
    waterCooldownMs: 30 * 1000,
    waterCooldownUntil: 0,
    decayMs: 5 * 60 * 1000,
    decayed: false,
    bug: { active: false, until: 0, penalty: 10 },
    stage: 1,
  }
}

export const session = reactive({
  user: guestUser(),
  growth: guestGrowth(),
  checkin: guestCheckin(),
  tasks: seedTasks.map((t) => ({ ...t })),
  friends: [],
  lotteryHistory: [],
  ticketOrders: [],
  popup: null,
  can: guestCan(),
})

/** 未登录 / 登出：清掉能量、连签、mock 好友等，避免「未登录却显示能量 20、连签 5」 */
export function resetToGuest() {
  Object.assign(session.user, guestUser())
  Object.assign(session.growth, guestGrowth())
  const nextCheckin = guestCheckin()
  session.checkin.todayDone = nextCheckin.todayDone
  session.checkin.dayIndex = nextCheckin.dayIndex
  session.checkin.streak = nextCheckin.streak
  session.checkin.lastDayKey = ''
  session.checkin.rewards = nextCheckin.rewards
  session.tasks = seedTasks.map((t) => ({ ...t }))
  session.friends = []
  session.lotteryHistory = []
  session.ticketOrders = []
  session.popup = null
  Object.assign(session.can, guestCan())
}

function bumpGrowth(delta) {
  session.growth.current = Math.min(session.growth.total, session.growth.current + delta)
  const left = session.growth.total - session.growth.current
  if (left <= 0) session.growth.daysLeftHint = '已满，可去兑礼'
  else if (left <= 15) {
    session.growth.daysLeftHint = `还差 ${left}%`
    session.growth.almostThere = true
  }
}

export function showPopup(payload) {
  session.popup = payload
}

export function hidePopup() {
  session.popup = null
}

function localDayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 本地/离线签到：连续则 streak+1，漏签（非昨天）则从 1 重计 */
export function doCheckin(opts = {}) {
  // 远程模式禁止纯本地签到，避免未登录「假成功」
  if (USE_REMOTE) {
    return { ok: false, needLogin: true, msg: '请先登录' }
  }
  if (session.checkin.todayDone) {
    return { ok: false, msg: '今天已经签过啦' }
  }
  const rewards = session.checkin.rewards || []
  const n = Math.max(1, rewards.length)
  const today = localDayKey()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const yKey = localDayKey(y)
  const lastKey = session.checkin.lastDayKey || ''
  const streak = lastKey === yKey ? (Number(session.checkin.streak) || 0) + 1 : 1
  const dayIndex = ((streak - 1) % n) + 1
  const reward = rewards.find((r) => r.day === dayIndex) || rewards[dayIndex - 1] || { type: 'energy', value: 0, label: '+0' }
  const value = Number(reward.value != null ? reward.value : reward.amount) || 0
  session.checkin.todayDone = true
  session.checkin.streak = streak
  session.checkin.dayIndex = dayIndex
  session.checkin.lastDayKey = today
  if (reward.type === 'energy' || !reward.type) {
    session.user.energy += value
    bumpGrowth(4)
  } else if (reward.type === 'lottery') {
    session.user.lotteryChance += value
  }
  const task = session.tasks.find((t) => t.id === 't_checkin')
  if (task) task.status = 'done'
  if (!opts.silent) {
    showPopup({
      type: 'reward',
      title: '签到成功',
      amount: reward.label || `+${value}`,
      tip: streak > 1 ? `已连签 ${streak} 天 · 明天继续` : '从第 1 天起计 · 别中断哦',
    })
  }
  return {
    ok: true,
    msg: `签到成功 · ${reward.label || value}`,
    streak,
    dayIndex,
    rewardLabel: reward.label || `+${value}`,
  }
}

export function claimSteps() {
  const task = session.tasks.find((t) => t.id === 't_steps')
  if (!task || task.status !== 'claim') return { ok: false, msg: '暂无可领取' }
  session.user.energy += 80
  bumpGrowth(5)
  task.status = 'done'
  showPopup({
    type: 'reward',
    title: '步数兑换成功',
    amount: '+80 能量',
    tip: '继续走路还能冲 1w 档',
  })
  return { ok: true, msg: '步数能量 +80' }
}

export function chargeEnergy() {
  session.user.energy += 28
  bumpGrowth(3)
  showPopup({
    type: 'reward',
    title: '模拟充能',
    amount: '+28 能量',
    tip: `进度 ${session.growth.current}%`,
  })
  return { ok: true }
}

export function stealFriend(friendId) {
  const f = session.friends.find((x) => x.id === friendId)
  if (!f || f.status !== 'stealable' || f.energy <= 0) {
    return { ok: false, msg: '没有可收的能量' }
  }
  const got = f.energy
  session.user.energy += got
  bumpGrowth(2)
  f.energy = 0
  f.status = 'empty'
  f.tip = '已收完'
  return { ok: true, msg: `收取 ${got} 点能量` }
}

export function spinLottery(cost = 50) {
  const need = Math.max(1, Number(cost) || 50)
  const bal = session.user.energy || session.user.points || 0
  if (bal < need) {
    const gap = need - bal
    return {
      ok: false,
      msg: bal <= 0 ? `还差 ${need} 能量值才能抽奖` : `还差 ${gap} 能量值才能抽奖`,
    }
  }
  session.user.energy = bal - need
  session.user.points = session.user.energy
  // 与后台一致：先掷谢谢参与占比，再在真中奖池内分配
  let emptyRate = 70
  try {
    const { appConfig } = require('./appConfig.js')
    const rules = appConfig.lotteryRules || {}
    if (rules.emptyRatePercent != null) emptyRate = Number(rules.emptyRatePercent)
    else if (rules.globalWinRate != null) emptyRate = 100 - Number(rules.globalWinRate)
  } catch (_) {}
  emptyRate = Math.min(100, Math.max(0, emptyRate))
  if (Math.random() * 100 < emptyRate) {
    const prize = {
      id: 'p_empty',
      name: '谢谢参与',
      prizeType: 'empty',
      prizeValue: 0,
      productId: '',
      imageUrl: '',
    }
    session.lotteryHistory.unshift({
      id: `h_${Date.now()}`,
      name: '谢谢参与',
      time: '刚刚',
      prizeType: 'empty',
    })
    return { ok: true, msg: '谢谢参与', detail: '未中奖', prize }
  }
  const pool = [
    {
      name: '+30 能量值',
      value: 30,
      bonus: () => {
        session.user.energy += 30
        return '+30 能量值'
      },
    },
    {
      name: '+80 能量值',
      value: 80,
      bonus: () => {
        session.user.energy += 80
        bumpGrowth(3)
        return '+80 能量值'
      },
    },
    {
      name: '+50 能量值',
      value: 50,
      bonus: () => {
        session.user.energy += 50
        return '+50 能量值'
      },
    },
  ]
  const hit = pool[Math.floor(Math.random() * pool.length)]
  const detail = hit.bonus()
  const prize = {
    id: `p_local_${Date.now()}`,
    name: hit.name,
    prizeType: 'energy',
    prizeValue: hit.value,
    productId: '',
    imageUrl: '',
  }
  session.lotteryHistory.unshift({
    id: `h_${Date.now()}`,
    name: hit.name,
    time: '刚刚',
    prizeType: prize.prizeType,
  })
  return { ok: true, msg: hit.name, detail, prize }
}

export function browseMallDone() {
  const task = session.tasks.find((t) => t.id === 't_browse')
  if (task && task.status === 'todo') {
    task.status = 'done'
    bumpGrowth(3)
    return { ok: true, msg: '浏览完成 · 进度 +3%' }
  }
  return { ok: true, msg: '已逛过啦' }
}

export function visitFestivalDone() {
  const task = session.tasks.find((t) => t.id === 't_festival')
  if (task && task.status === 'todo') {
    task.status = 'done'
    session.user.energy += 20
  }
}

export function buyTicket(ticket, form) {
  session.ticketOrders.unshift({
    id: `to_${Date.now()}`,
    name: ticket.name,
    status: 'unused',
    statusText: '待使用',
    day: form.day,
    code: `HF${String(Math.floor(Math.random() * 90000) + 10000)}`,
  })
  if (ticket.energyBonus) {
    session.user.energy += ticket.energyBonus
    bumpGrowth(2)
  }
  showPopup({
    type: 'ticket',
    title: '购票成功',
    amount: ticket.name,
    tip: `电子票已放入票夹 · 能量 +${ticket.energyBonus || 0}`,
  })
  return { ok: true }
}

// ========== 能量罐游戏闭环 ==========
// 产出检查：到时间则累积待收能量；超时未收则衰减
export function tickCan() {
  const can = session.can
  const now = Date.now()
  const elapsed = now - can.lastProducedAt
  if (elapsed >= can.produceIntervalMs && can.pendingEnergy < 60) {
    // 产出一批
    can.pendingEnergy = Math.min(60, can.pendingEnergy + 30)
    can.lastProducedAt = now
    can.decayed = false
  }
  // 衰减检查：产出后超过 decayMs 未收
  if (can.pendingEnergy > 0 && elapsed >= can.decayMs && !can.decayed) {
    can.pendingEnergy = Math.floor(can.pendingEnergy * 0.7)
    can.decayed = true
    return { decayed: true }
  }
  return { decayed: false }
}

// 收能量：把待收能量收进账户
export function collectCan() {
  const can = session.can
  if (can.pendingEnergy <= 0) {
    return { ok: false, msg: '暂无待收能量' }
  }
  const got = can.pendingEnergy
  session.user.energy += got
  bumpGrowth(3)
  can.pendingEnergy = 0
  can.lastProducedAt = Date.now()
  can.decayed = false
  return { ok: true, msg: `收取 ${got} 点能量`, amount: got }
}

// 浇水：+15，3h 冷却（demo 30s）
export function waterCan() {
  const can = session.can
  const now = Date.now()
  if (now < can.waterCooldownUntil) {
    const left = Math.ceil((can.waterCooldownUntil - now) / 1000)
    return { ok: false, msg: `冷却中，${left}s 后可再浇` }
  }
  session.user.energy += 15
  bumpGrowth(2)
  can.waterCooldownUntil = now + can.waterCooldownMs
  return { ok: true, msg: '浇水 +15', amount: 15 }
}

// 触发虫害事件（随机，由页面调用）
export function triggerBug() {
  const can = session.can
  if (can.bug.active) return { ok: false, msg: '已有虫害' }
  can.bug.active = true
  // demo 虫害持续 2 分钟，真实 24 小时
  can.bug.until = Date.now() + 2 * 60 * 1000
  return { ok: true, msg: '罐子出现虫害！' }
}

// 处理虫害
export function clearBug() {
  const can = session.can
  if (!can.bug.active) return { ok: false, msg: '无虫害' }
  can.bug.active = false
  can.bug.until = 0
  session.user.energy += 10
  bumpGrowth(1)
  return { ok: true, msg: '虫害已清除 +10' }
}

// 升级关卡（兑礼后调用）
export function levelUpCan() {
  session.can.stage += 1
  session.growth.current = 0
  session.growth.stage = session.can.stage
  return { ok: true }
}


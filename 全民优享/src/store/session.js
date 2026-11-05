import { reactive } from 'vue'
import {
  user as seedUser,
  growth as seedGrowth,
  checkin as seedCheckin,
  tasks as seedTasks,
  friends as seedFriends,
  lotteryHistory as seedHistory,
  ticketOrders as seedTicketOrders,
} from '../mock/data.js'

export const session = reactive({
  user: { ...seedUser },
  growth: { ...seedGrowth },
  checkin: {
    ...seedCheckin,
    rewards: seedCheckin.rewards.map((r) => ({ ...r })),
  },
  tasks: seedTasks.map((t) => ({ ...t })),
  friends: seedFriends.map((f) => ({ ...f })),
  lotteryHistory: seedHistory.map((h) => ({ ...h })),
  ticketOrders: seedTicketOrders.map((o) => ({ ...o })),
  popup: null,
})

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

export function doCheckin() {
  if (session.checkin.todayDone) {
    return { ok: false, msg: '今天已经签过啦' }
  }
  const reward = session.checkin.rewards[session.checkin.dayIndex - 1]
  session.checkin.todayDone = true
  if (reward.type === 'energy') {
    session.user.energy += reward.value
    bumpGrowth(4)
  } else if (reward.type === 'lottery') {
    session.user.lotteryChance += reward.value
  }
  const task = session.tasks.find((t) => t.id === 't_checkin')
  if (task) task.status = 'done'
  showPopup({
    type: 'reward',
    title: '签到成功',
    amount: reward.label,
    tip: '能量已到账 · 明天继续来',
  })
  return { ok: true, msg: `签到成功 · ${reward.label}` }
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

export function spinLottery() {
  if (session.user.lotteryChance <= 0) {
    return { ok: false, msg: '没有抽奖次数了' }
  }
  session.user.lotteryChance -= 1
  const pool = [
    {
      name: '谢谢参与',
      bonus: () => {
        session.user.energy += 5
        return '返还 +5 能量'
      },
    },
    {
      name: '+30 积分',
      bonus: () => {
        session.user.points += 30
        return '+30 积分'
      },
    },
    {
      name: '+80 能量',
      bonus: () => {
        session.user.energy += 80
        bumpGrowth(3)
        return '+80 能量'
      },
    },
    {
      name: '抽奖+1',
      bonus: () => {
        session.user.lotteryChance += 1
        return '抽奖次数 +1'
      },
    },
  ]
  const hit = pool[Math.floor(Math.random() * pool.length)]
  const detail = hit.bonus()
  session.lotteryHistory.unshift({
    id: `h_${Date.now()}`,
    name: hit.name === '谢谢参与' ? `谢谢参与 · ${detail}` : hit.name,
    time: '刚刚',
  })
  return { ok: true, msg: hit.name, detail }
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

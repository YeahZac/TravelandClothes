/**
 * 能量罐游戏引擎 V2 — 支付宝种树 + QQ 农场偷菜玩法
 *
 * 规则读自 appConfig.game（CMS 可配），缺省用 DEFAULT_RULES。
 * 见：产能量 / 浇水 / 收取 / 偷一半 / 助力 / 虫害概率 / 被偷 feed
 */
import { reactive } from 'vue'
import { session, showPopup } from './session.js'
import { appConfig } from './appConfig.js'

export const STAGE_CURVE = [
  { stage: 1, name: '小玻璃罐', capacity: 100 },
  { stage: 2, name: '宽口罐', capacity: 200 },
  { stage: 3, name: '陶瓷罐', capacity: 400 },
  { stage: 5, name: '水晶罐', capacity: 800 },
  { stage: 8, name: '大水晶罐', capacity: 1500 },
]

const DEFAULT_RULES = {
  harvestIntervalMs: 3 * 60 * 60 * 1000,
  pendingCap: 60,
  harvestAmount: 30,
  waterCooldownMs: 3 * 60 * 60 * 1000,
  waterEnergy: 15,
  waterLiquid: 4,
  harvestLiquid: 6,
  stealPerDay: 3,
  helpEnergyMe: 5,
  helpEnergyFriend: 20,
  eventProbability: 0.4,
  eventDeadlineMs: 24 * 60 * 60 * 1000,
  eventPenalty: 10,
  eventClearReward: 10,
}

export function getRules() {
  const g = appConfig.game || {}
  return {
    harvestIntervalMs: Number(g.harvestIntervalMs) || DEFAULT_RULES.harvestIntervalMs,
    pendingCap: Number(g.pendingCap) || DEFAULT_RULES.pendingCap,
    harvestAmount: Number(g.harvestAmount) || DEFAULT_RULES.harvestAmount,
    waterCooldownMs: Number(g.waterCooldownMs) || DEFAULT_RULES.waterCooldownMs,
    waterEnergy: Number(g.waterEnergy) || DEFAULT_RULES.waterEnergy,
    waterLiquid: Number(g.waterLiquid) || DEFAULT_RULES.waterLiquid,
    harvestLiquid: Number(g.harvestLiquid) || DEFAULT_RULES.harvestLiquid,
    stealPerDay: Number(g.stealPerDay) || DEFAULT_RULES.stealPerDay,
    helpEnergyMe: Number(g.helpEnergyMe) || DEFAULT_RULES.helpEnergyMe,
    helpEnergyFriend: Number(g.helpEnergyFriend) || DEFAULT_RULES.helpEnergyFriend,
    eventProbability: clamp01(
      g.eventProbability != null ? Number(g.eventProbability) : DEFAULT_RULES.eventProbability
    ),
    eventDeadlineMs: Number(g.eventDeadlineMs) || DEFAULT_RULES.eventDeadlineMs,
    eventPenalty: Number(g.eventPenalty) || DEFAULT_RULES.eventPenalty,
    eventClearReward: Number(g.eventClearReward) || DEFAULT_RULES.eventClearReward,
  }
}

function clamp01(n) {
  if (Number.isNaN(n)) return DEFAULT_RULES.eventProbability
  return Math.max(0, Math.min(1, n))
}

export const jar = reactive({
  stage: 1,
  liquid: 60,
  pending: 30,
  nextHarvestAt: Date.now() + 2 * 60 * 60 * 1000 + 14 * 60 * 1000,
  waterReadyAt: Date.now() - 1000,
  waterCount: 0,
  stealsLeft: DEFAULT_RULES.stealPerDay,
  helpedIds: [],
  event: null,
  fx: [],
  feed: [
    {
      id: 'feed_seed_1',
      type: 'stolen',
      name: '小林',
      amount: 18,
      time: '12 分钟前',
      tip: '偷走了你的能量',
    },
    {
      id: 'feed_seed_2',
      type: 'helped',
      name: '七七',
      amount: 20,
      time: '1 小时前',
      tip: '给你浇了水',
    },
  ],
  feedUnread: 2,
})

let fxId = 0
function pushFx(text, tone = 'amber', x = 50, y = 40) {
  const id = `fx_${Date.now()}_${fxId++}`
  jar.fx.push({ id, text, tone, x, y })
  setTimeout(() => {
    const i = jar.fx.findIndex((f) => f.id === id)
    if (i >= 0) jar.fx.splice(i, 1)
  }, 1200)
}

function pushFeed(item) {
  jar.feed.unshift({
    id: `feed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    time: '刚刚',
    ...item,
  })
  if (jar.feed.length > 20) jar.feed.length = 20
  jar.feedUnread += 1
}

function gainLiquid(delta) {
  jar.liquid = Math.max(0, Math.min(100, jar.liquid + delta))
  session.growth.current = jar.liquid
  const left = 100 - jar.liquid
  if (left <= 0) session.growth.daysLeftHint = '罐子满了 · 快去兑礼'
  else if (left <= 15) {
    session.growth.daysLeftHint = `还差 ${left}%`
    session.growth.almostThere = true
  } else {
    session.growth.daysLeftHint = '再充一点就能兑'
  }
  return { after: jar.liquid }
}

export function tickProduce() {
  const rules = getRules()
  const now = Date.now()
  if (now < jar.nextHarvestAt) return { ok: false }
  if (jar.pending >= rules.pendingCap) {
    jar.pending = Math.floor(jar.pending * 0.7)
    jar.nextHarvestAt = now + rules.harvestIntervalMs
    return { ok: true, decayed: true }
  }
  jar.pending = Math.min(rules.pendingCap, jar.pending + rules.harvestAmount)
  jar.nextHarvestAt = now + rules.harvestIntervalMs
  return { ok: true, pending: jar.pending }
}

export function tickEventPenalty() {
  if (!jar.event) return { ok: false }
  if (Date.now() < jar.event.penaltyAt) return { ok: false }
  const rules = getRules()
  gainLiquid(-rules.eventPenalty)
  const type = jar.event.type
  jar.event = null
  return {
    ok: true,
    msg:
      type === 'pest'
        ? `虫子啃坏了罐子 · 水位 -${rules.eventPenalty}%`
        : `干旱了 · 水位 -${rules.eventPenalty}%`,
  }
}

export function harvest() {
  const rules = getRules()
  if (jar.pending <= 0) return { ok: false, msg: '还没有可收的能量' }
  const got = jar.pending
  session.user.energy += got
  jar.pending = 0
  jar.nextHarvestAt = Date.now() + rules.harvestIntervalMs
  const lg = gainLiquid(rules.harvestLiquid)
  pushFx(`+${got}`, 'sage', 50, 30)

  let eventSpawned = false
  if (!jar.event && Math.random() < rules.eventProbability) {
    const type = Math.random() < 0.5 ? 'pest' : 'drought'
    jar.event = {
      type,
      foundAt: Date.now(),
      penaltyAt: Date.now() + rules.eventDeadlineMs,
    }
    eventSpawned = true
  }
  return {
    ok: true,
    msg: `收取 ${got} 点能量`,
    detail: { got, liquid: lg.after, eventSpawned },
  }
}

export function water() {
  const rules = getRules()
  const now = Date.now()
  if (now < jar.waterReadyAt) {
    const left = Math.ceil((jar.waterReadyAt - now) / 60000)
    return { ok: false, msg: `浇水冷却中 · 约 ${left} 分钟` }
  }
  session.user.energy += rules.waterEnergy
  jar.waterCount += 1
  jar.waterReadyAt = now + rules.waterCooldownMs
  const lg = gainLiquid(rules.waterLiquid)
  pushFx(`+${rules.waterEnergy}`, 'sage', 30, 35)
  return {
    ok: true,
    msg: `浇水成功 · 能量 +${rules.waterEnergy}`,
    detail: { liquid: lg.after },
  }
}

export function steal(friendId) {
  const rules = getRules()
  if (jar.stealsLeft <= 0) {
    return { ok: false, msg: `今天偷满 ${rules.stealPerDay} 次啦 · 明天再来` }
  }
  const f = session.friends.find((x) => x.id === friendId)
  if (!f || f.status !== 'stealable' || f.energy <= 0) {
    return { ok: false, msg: '这位好友没有可偷的能量' }
  }
  const got = f.energy >= 10 ? Math.ceil(f.energy / 2) : f.energy
  f.energy -= got
  if (f.energy <= 0) {
    f.status = 'empty'
    f.tip = '被收完了'
  } else {
    f.tip = `被偷走 ${got}`
  }
  jar.stealsLeft -= 1
  session.user.energy += got
  const lg = gainLiquid(3)
  pushFx(`+${got}`, 'amber', 70, 35)
  return {
    ok: true,
    msg: `偷到 ${got} 点能量 · 今日剩 ${jar.stealsLeft} 次`,
    detail: { liquid: lg.after },
  }
}

export function helpFriend(friendId) {
  const rules = getRules()
  if (jar.helpedIds.includes(friendId)) {
    return { ok: false, msg: '今天已经帮过这位好友啦' }
  }
  const f = session.friends.find((x) => x.id === friendId)
  if (!f) return { ok: false, msg: '好友不存在' }
  jar.helpedIds.push(friendId)
  session.user.energy += rules.helpEnergyMe
  const lg = gainLiquid(2)
  pushFx(`+${rules.helpEnergyMe}`, 'sage', 50, 45)
  return {
    ok: true,
    msg: `已给 ${f.name} 浇水 · TA +${rules.helpEnergyFriend}，你 +${rules.helpEnergyMe}`,
    detail: { liquid: lg.after },
  }
}

export function clearEvent() {
  const rules = getRules()
  if (!jar.event) return { ok: false, msg: '没有需要处理的事件' }
  const type = jar.event.type
  jar.event = null
  session.user.energy += rules.eventClearReward
  pushFx(`+${rules.eventClearReward}`, 'amber', 50, 25)
  const label = type === 'pest' ? '已除虫' : '已补水'
  return { ok: true, msg: `${label} · 能量 +${rules.eventClearReward}（辛苦费）` }
}

export function redeemStage() {
  if (jar.liquid < 100) {
    return { ok: false, msg: `还差 ${100 - jar.liquid}% 满` }
  }
  jar.stage += 1
  jar.liquid = 0
  session.growth.current = 0
  session.growth.stage = jar.stage
  session.growth.daysLeftHint = `第 ${jar.stage} 罐开始 · 继续攒`
  showPopup({
    type: 'reward',
    title: `第 ${jar.stage - 1} 罐兑礼成功`,
    amount: session.growth.targetGift,
    tip: `进入第 ${jar.stage} 罐 · 容量更大，礼物更好`,
  })
  return { ok: true }
}

/** 模拟「被好友偷了 / 被浇水」——回访时调用，制造社交气泡 */
export function simulateIncomingSocial() {
  const candidates = (session.friends || []).filter((f) => f.name)
  if (!candidates.length) return
  if (Math.random() < 0.5) {
    const who = candidates[Math.floor(Math.random() * candidates.length)]
    pushFeed({
      type: 'stolen',
      name: who.name,
      amount: 8 + Math.floor(Math.random() * 20),
      tip: '偷走了你的能量',
    })
  }
  if (Math.random() < 0.3) {
    const who = candidates[Math.floor(Math.random() * candidates.length)]
    pushFeed({
      type: 'helped',
      name: who.name,
      amount: getRules().helpEnergyFriend,
      tip: '给你浇了水',
    })
  }
}

export function markFeedRead() {
  jar.feedUnread = 0
}

export function dismissFeedItem(id) {
  const i = jar.feed.findIndex((f) => f.id === id)
  if (i >= 0) jar.feed.splice(i, 1)
}

export function formatCountdown(ms) {
  if (ms <= 0) return '可收取'
  const s = Math.ceil(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function isFull() {
  return jar.liquid >= 100
}

export function eventCriticalSoon() {
  if (!jar.event) return false
  return jar.event.penaltyAt - Date.now() < 60 * 60 * 1000
}

/**
 * 能量罐游戏引擎 V2 — 支付宝种树 + QQ 农场偷菜玩法
 *
 * 核心循环（3 小时回访节奏）：
 *   1. 罐子自然产能量（3h 一波，待收上限 60，过期衰减 30%）
 *   2. 浇水（3h 冷却，+15 能量 + 水位 4%）
 *   3. 收能量（待收 → 账户，水位 +6%）
 *   4. 偷好友（3 次/天，偷一半）
 *   5. 助力好友（好友 +20，自己 +5，每人每天一次）
 *   6. 随机事件（虫害/干旱）— 24h 不处理水位 -10%
 *
 * 记账原则（工程师注意）：
 *   - 每个动作有唯一动作 id，服务端幂等记账（本 mock 直接改 reactive）
 *   - 水位 = 养成进度，与 session.growth.current 同步
 *   - 满罐 100% → 可兑礼 → 兑完进下一罐（关卡曲线：罐越大容量越大）
 */
import { reactive } from 'vue'
import { session, showPopup } from './session.js'

// 关卡曲线：第 N 罐需要的水位能量倍率（兑礼门槛）
export const STAGE_CURVE = [
  { stage: 1, name: '小玻璃罐', capacity: 100 },
  { stage: 2, name: '宽口罐', capacity: 200 },
  { stage: 3, name: '陶瓷罐', capacity: 400 },
  { stage: 5, name: '水晶罐', capacity: 800 },
  { stage: 8, name: '大水晶罐', capacity: 1500 },
]

const HARVEST_INTERVAL = 3 * 60 * 60 * 1000       // 3h 产一波
const PENDING_CAP = 60                             // 待收上限
const WATER_COOLDOWN = 3 * 60 * 60 * 1000          // 浇水 3h 冷却
const WATER_ENERGY = 15                            // 浇水 +15
const WATER_LIQUID = 4                             // 浇水水位 +4%
const HARVEST_LIQUID = 6                          // 收取水位 +6%
const STEAL_PER_DAY = 3                            // 每日偷 3 次
const HELP_ENERGY_ME = 5                           // 助力自己得
const HELP_ENERGY_FRIEND = 20                      // 助力好友得
const EVENT_DEADLINE = 24 * 60 * 60 * 1000         // 事件 24h 处理期
const EVENT_PENALTY = 10                           // 不处理水位 -10%

export const jar = reactive({
  stage: 1,
  liquid: 60,                                      // 水位 %，与 growth.current 同步
  pending: 30,                                    // 待收能量
  nextHarvestAt: Date.now() + 2 * 60 * 60 * 1000 + 14 * 60 * 1000, // 2h14m 后
  waterReadyAt: Date.now() - 1000,                 // 已冷却，可浇
  waterCount: 0,                                   // 今日浇水次数
  stealsLeft: STEAL_PER_DAY,                      // 今日剩余偷次数
  helpedIds: [],                                   // 今日已助力好友
  event: null,                                    // { type: 'pest', foundAt, penaltyAt }
  fx: [],                                         // 飘字动效 [{ id, text, tone, x, y }]
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

function gainLiquid(delta) {
  const before = jar.liquid
  jar.liquid = Math.max(0, Math.min(100, jar.liquid + delta))
  // 水位同步养成进度
  session.growth.current = jar.liquid
  const left = 100 - jar.liquid
  if (left <= 0) session.growth.daysLeftHint = '罐子满了 · 快去兑礼'
  else if (left <= 15) {
    session.growth.daysLeftHint = `还差 ${left}%`
    session.growth.almostThere = true
  } else {
    session.growth.daysLeftHint = '再充一点就能兑'
  }
  return { before, after: jar.liquid, capped: jar.liquid === before && delta > 0 }
}

/** 收能量 — 把待收的拿走 */
export function harvest() {
  if (jar.pending <= 0) {
    return { ok: false, msg: '还没有可收的能量' }
  }
  const got = jar.pending
  session.user.energy += got
  jar.pending = 0
  jar.nextHarvestAt = Date.now() + HARVEST_INTERVAL
  const lg = gainLiquid(HARVEST_LIQUID)
  pushFx(`+${got}`, 'sage', 50, 30)

  // 收取后 40% 概率触发随机事件（虫害/干旱）— 演示游戏事件感
  if (!jar.event && Math.random() < 0.4) {
    const types = ['pest', 'drought']
    const type = types[Math.floor(Math.random() * types.length)]
    jar.event = { type, foundAt: Date.now(), penaltyAt: Date.now() + EVENT_DEADLINE }
  }

  return {
    ok: true,
    msg: `收取 ${got} 点能量`,
    detail: { got, liquid: lg.after },
  }
}

/** 浇水 — 3h 冷却，+15 能量 + 水位 4% */
export function water() {
  const now = Date.now()
  if (now < jar.waterReadyAt) {
    const left = Math.ceil((jar.waterReadyAt - now) / 60000)
    return { ok: false, msg: `浇水冷却中 · 约 ${left} 分钟` }
  }
  session.user.energy += WATER_ENERGY
  jar.waterCount += 1
  jar.waterReadyAt = now + WATER_COOLDOWN
  const lg = gainLiquid(WATER_LIQUID)
  pushFx(`+${WATER_ENERGY}`, 'sage', 30, 35)
  return { ok: true, msg: `浇水成功 · 能量 +${WATER_ENERGY}`, detail: { liquid: lg.after } }
}

/** 偷好友 — 3 次/天，偷一半（QQ 农场规则） */
export function steal(friendId) {
  if (jar.stealsLeft <= 0) {
    return { ok: false, msg: '今天偷满 3 次啦 · 明天再来' }
  }
  const f = session.friends.find((x) => x.id === friendId)
  if (!f || f.status !== 'stealable' || f.energy <= 0) {
    return { ok: false, msg: '这位好友没有可偷的能量' }
  }
  // 偷一半，剩一半留给本人（社交摩擦更小）
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
  return { ok: true, msg: `偷到 ${got} 点能量 · 今日剩 ${jar.stealsLeft} 次`, detail: { liquid: lg.after } }
}

/** 助力好友 — 好友 +20，自己 +5，每人每天一次 */
export function helpFriend(friendId) {
  if (jar.helpedIds.includes(friendId)) {
    return { ok: false, msg: '今天已经帮过这位好友啦' }
  }
  const f = session.friends.find((x) => x.id === friendId)
  if (!f) return { ok: false, msg: '好友不存在' }
  jar.helpedIds.push(friendId)
  session.user.energy += HELP_ENERGY_ME
  const lg = gainLiquid(2)
  pushFx(`+${HELP_ENERGY_ME}`, 'sage', 50, 45)
  return {
    ok: true,
    msg: `已给 ${f.name} 浇水 · TA +${HELP_ENERGY_FRIEND}，你 +${HELP_ENERGY_ME}`,
    detail: { liquid: lg.after },
  }
}

/** 处理事件（除虫/补水）— 及时处理保住水位，奖励 +10 */
export function clearEvent() {
  if (!jar.event) return { ok: false, msg: '没有需要处理的事件' }
  const type = jar.event.type
  jar.event = null
  session.user.energy += 10
  pushFx('+10', 'amber', 50, 25)
  const label = type === 'pest' ? '已除虫' : '已补水'
  return { ok: true, msg: `${label} · 能量 +10（辛苦费）` }
}

/** 满罐兑礼 — 进下一关 */
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

/** 倒计时格式化（供 UI 每秒刷新用） */
export function formatCountdown(ms) {
  if (ms <= 0) return '可收取'
  const s = Math.ceil(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** 水位是否到顶 */
export function isFull() {
  return jar.liquid >= 100
}

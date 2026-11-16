/**
 * 全局能量值增减动效：首页钱包 / 抽奖页余额共用
 */
import { reactive } from 'vue'
import { session } from '../store/session.js'

export const energyFx = reactive({
  delta: 0,
  show: false,
  token: 0,
})

let hideTimer = null

/** @param {number} delta 正数增加、负数消耗 */
export function flashEnergyDelta(delta) {
  const n = Math.round(Number(delta) || 0)
  if (!n) return
  energyFx.delta = n
  energyFx.token += 1
  energyFx.show = true
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    energyFx.show = false
  }, 1400)
}

/**
 * 用服务端钱包绝对值更新，并按差值播动效
 * @returns {number} delta
 */
export function applyWalletEnergy(nextEnergy) {
  const prev = Number(session.user.energy != null ? session.user.energy : session.user.points) || 0
  const next = Number(nextEnergy)
  if (!Number.isFinite(next)) return 0
  session.user.energy = next
  session.user.points = next
  const d = next - prev
  if (d) flashEnergyDelta(d)
  return d
}

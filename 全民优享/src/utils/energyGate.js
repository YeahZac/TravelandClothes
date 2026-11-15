/**
 * 能量值消耗动作闸门：先登录，再判余额；不足时给可读提示。
 */
import { session } from '../store/session.js'
import { isAuthed, requireAuth, currentPagePath } from './loginGate.js'

export function currentEnergy() {
  return Number(session.user.energy != null ? session.user.energy : session.user.points) || 0
}

/** 短提示（toast 用，避免超长被截断） */
export function energyShortToast({ need, bal, action = '继续' }) {
  const n = Math.max(0, Number(need) || 0)
  const b = bal != null ? Number(bal) || 0 : currentEnergy()
  const gap = Math.max(0, n - b)
  if (gap <= 0) return ''
  if (b <= 0) return `还差 ${n} 能量值才能${action}`
  return `还差 ${gap} 能量值才能${action}`
}

/** 完整说明（modal content） */
export function energyShortDetail({ need, bal, action = '继续' }) {
  const n = Math.max(0, Number(need) || 0)
  const b = bal != null ? Number(bal) || 0 : currentEnergy()
  const gap = Math.max(0, n - b)
  return `${action}需 ${n} 能量值，当前 ${b}，还差 ${gap}。\n去做签到或日常任务攒一攒再来吧`
}

export function promptEnergyShort({ need, bal, action = '继续' }) {
  const n = Math.max(0, Number(need) || 0)
  const b = bal != null ? Number(bal) || 0 : currentEnergy()
  return new Promise((resolve) => {
    uni.showModal({
      title: '能量值不够啦',
      content: energyShortDetail({ need: n, bal: b, action }),
      confirmText: '去任务',
      cancelText: '知道了',
      success(res) {
        if (res.confirm) {
          // Tab「每日任务」在 energy；独立 tasks 页作兜底
          uni.switchTab({
            url: '/pages/energy/index',
            fail() {
              uni.navigateTo({ url: '/pages/tasks/index' })
            },
          })
        }
        resolve(!!res.confirm)
      },
      fail() {
        uni.showToast({
          title: energyShortToast({ need: n, bal: b, action }),
          icon: 'none',
          duration: 2500,
        })
        resolve(false)
      },
    })
  })
}

/**
 * 先登录 → 再判能量。
 * @returns {Promise<{ok:boolean, reason?:'login'|'energy', bal?:number, need?:number, msg?:string}>}
 */
export async function assertLoginThenEnergy({
  need = 0,
  redirectPath = '',
  action = '继续',
  loginToast = '',
} = {}) {
  if (!isAuthed()) {
    requireAuth(redirectPath || currentPagePath(), loginToast || '请先登录')
    return { ok: false, reason: 'login' }
  }
  const n = Math.max(0, Number(need) || 0)
  const bal = currentEnergy()
  if (n > 0 && bal < n) {
    const msg = energyShortToast({ need: n, bal, action })
    await promptEnergyShort({ need: n, bal, action })
    return { ok: false, reason: 'energy', bal, need: n, msg }
  }
  return { ok: true, bal, need: n }
}

/** 把服务端「能量值不足（需 x，当前 y）」收成统一文案 */
export function polishEnergyError(raw, { action = '继续', need = 0 } = {}) {
  const msg = String(raw || '')
  if (!/能量/.test(msg)) return msg
  const m = msg.match(/需\s*(\d+).*?当前\s*(\d+)/) || msg.match(/当前\s*(\d+).*?需\s*(\d+)/)
  let n = need
  let bal = currentEnergy()
  if (m) {
    if (/需\s*\d+.*?当前/.test(msg)) {
      n = Number(m[1]) || n
      bal = Number(m[2]) || bal
    } else {
      bal = Number(m[1]) || bal
      n = Number(m[2]) || n
    }
  } else {
    const onlyNeed = msg.match(/需\s*(\d+)/)
    if (onlyNeed) n = Number(onlyNeed[1]) || n
  }
  return energyShortToast({ need: n, bal, action }) || msg
}

/**
 * 能量罐订阅消息（回访拉活）
 *
 * 微信：uni.requestSubscribeMessage，模板 ID 由 CMS game.subscribe.tmplIds 配置
 * 抖音/支付宝：暂存本地开关，端侧能力就绪后接各自订阅 API
 *
 * 触发时机（合规：必须用户手势）：
 *   - 收取能量后 → 申请「能量到账提醒」
 *   - 出现虫害/干旱后 → 申请「罐子告急提醒」
 *
 * 服务端真正下发需在产能量到点 / 事件临界前 1h 调微信订阅消息 API；
 * 本文件只做客户端授权采集 + 本地开关状态。
 */
import { reactive } from 'vue'
import { appConfig } from '../store/appConfig.js'

const STORAGE_KEY = 'qmyx_jar_subscribe'

export const subscribeState = reactive({
  harvestReady: false,   // 能量到账提醒
  eventCritical: false,  // 罐子告急提醒
  askedAt: 0,
  lastResult: null,
})

try {
  const raw = uni.getStorageSync(STORAGE_KEY)
  if (raw) {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    Object.assign(subscribeState, parsed)
  }
} catch (e) {}

function persist() {
  try {
    uni.setStorageSync(STORAGE_KEY, {
      harvestReady: subscribeState.harvestReady,
      eventCritical: subscribeState.eventCritical,
      askedAt: subscribeState.askedAt,
      lastResult: subscribeState.lastResult,
    })
  } catch (e) {}
}

function gameSubscribe() {
  const g = (appConfig.game && appConfig.game.subscribe) || {}
  return {
    enabled: g.enabled !== false,
    tmplIds: g.tmplIds || {
      harvestReady: 'TMPL_HARVEST_READY_PLACEHOLDER',
      eventCritical: 'TMPL_EVENT_CRITICAL_PLACEHOLDER',
    },
  }
}

/**
 * 申请订阅（必须在 tap 手势回调里调用）
 * @param {'harvestReady'|'eventCritical'|Array} kinds
 */
export function requestJarSubscribe(kinds = ['harvestReady']) {
  const list = Array.isArray(kinds) ? kinds : [kinds]
  const cfg = gameSubscribe()
  if (!cfg.enabled) {
    return Promise.resolve({ ok: false, reason: 'disabled' })
  }

  const tmplIds = list
    .map((k) => cfg.tmplIds[k])
    .filter(Boolean)
    .slice(0, 3) // 微信单次最多 3 个

  if (!tmplIds.length) {
    return Promise.resolve({ ok: false, reason: 'no_tmpl' })
  }

  // #ifdef MP-WEIXIN
  return new Promise((resolve) => {
    uni.requestSubscribeMessage({
      tmplIds,
      success(res) {
        list.forEach((k) => {
          const id = cfg.tmplIds[k]
          if (res[id] === 'accept') subscribeState[k] = true
        })
        subscribeState.askedAt = Date.now()
        subscribeState.lastResult = res
        persist()
        const accepted = list.some((k) => subscribeState[k])
        resolve({ ok: accepted, res })
      },
      fail(err) {
        subscribeState.lastResult = err
        persist()
        // 开发态占位模板会失败 —— 降级为本地开关，方便联调 UI
        if (String(tmplIds[0] || '').includes('PLACEHOLDER')) {
          list.forEach((k) => {
            subscribeState[k] = true
          })
          subscribeState.askedAt = Date.now()
          persist()
          resolve({ ok: true, mock: true })
          return
        }
        resolve({ ok: false, err })
      },
    })
  })
  // #endif

  // #ifndef MP-WEIXIN
  // 非微信端：先记本地开关，后续接抖音/支付宝订阅
  list.forEach((k) => {
    subscribeState[k] = true
  })
  subscribeState.askedAt = Date.now()
  persist()
  return Promise.resolve({ ok: true, mock: true, platform: appConfig.platform })
  // #endif
}

/** 是否已开任一回访提醒 */
export function hasAnySubscribe() {
  return !!(subscribeState.harvestReady || subscribeState.eventCritical)
}

/** 关闭本地开关（设置页用） */
export function clearJarSubscribe() {
  subscribeState.harvestReady = false
  subscribeState.eventCritical = false
  persist()
}

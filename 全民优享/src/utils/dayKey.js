/**
 * 与后端 chinaDay 对齐：东八区自然日 YYYY-MM-DD。
 * 用于 00:00 日切后重置本地任务完成态。
 */
import { chinaDayKey } from './chinaTime.js'

export function shanghaiDayKey(input = new Date()) {
  try {
    return chinaDayKey(input)
  } catch (_) {
    return '1970-01-01'
  }
}

/** 距下一东八区 00:00 的毫秒数（用于定时刷新） */
export function msUntilNextShanghaiMidnight(now = new Date()) {
  const cur = shanghaiDayKey(now)
  const probe = new Date(now.getTime())
  for (let i = 0; i < 48 * 60; i++) {
    probe.setTime(now.getTime() + i * 60 * 1000)
    if (shanghaiDayKey(probe) !== cur) {
      return Math.max(1000, probe.getTime() - now.getTime())
    }
  }
  return 60 * 60 * 1000
}

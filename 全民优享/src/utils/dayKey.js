/**
 * 与后端 taskService.dayKey 对齐：东八区自然日 YYYY-MM-DD。
 * 用于 00:00 日切后重置本地任务完成态。
 */
export function shanghaiDayKey(input = new Date()) {
  const x =
    typeof input === 'string'
      ? new Date(input)
      : input instanceof Date
        ? input
        : new Date()
  if (Number.isNaN(x.getTime())) return '1970-01-01'
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const map = {}
    fmt.formatToParts(x).forEach((p) => {
      if (p.type !== 'literal') map[p.type] = p.value
    })
    return `${map.year || '1970'}-${map.month || '01'}-${map.day || '01'}`
  } catch (_) {
    const y = x.getFullYear()
    const m = String(x.getMonth() + 1).padStart(2, '0')
    const d = String(x.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
}

/** 距下一东八区 00:00 的毫秒数（用于定时刷新） */
export function msUntilNextShanghaiMidnight(now = new Date()) {
  const cur = shanghaiDayKey(now)
  // 粗略：每分钟检查即可；精确推算下一上海日 00:00
  const probe = new Date(now.getTime())
  for (let i = 0; i < 48 * 60; i++) {
    probe.setTime(now.getTime() + i * 60 * 1000)
    if (shanghaiDayKey(probe) !== cur) {
      return Math.max(1000, probe.getTime() - now.getTime())
    }
  }
  return 60 * 60 * 1000
}

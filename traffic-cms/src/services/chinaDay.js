/**
 * 业务日 / 展示时间一律按东八区（无夏令时，固定 UTC+8）。
 *
 * 约定：
 * - 入库时间 nowIso() = UTC ISO（带 Z）
 * - 业务 day_key / 「今日」= 东八区自然日 YYYY-MM-DD
 * - 按 created_at 统计「今日」须用 chinaDayRangeUtc，禁止 substr(created_at,1,10)
 *   或 toISOString().slice(0,10)（那是 UTC 日）
 */
const OFFSET_MS = 8 * 3600 * 1000

function pad2(n) {
  return String(n).padStart(2, '0')
}

function asDate(d = new Date()) {
  if (d instanceof Date) return d
  if (typeof d === 'string' || typeof d === 'number') {
    const x = new Date(d)
    if (!Number.isNaN(x.getTime())) return x
  }
  return new Date()
}

/** 东八区自然日 YYYY-MM-DD */
function chinaDayKey(d = new Date()) {
  const c = new Date(asDate(d).getTime() + OFFSET_MS)
  return `${c.getUTCFullYear()}-${pad2(c.getUTCMonth() + 1)}-${pad2(c.getUTCDate())}`
}

/** 东八区某日对应的 UTC ISO 半开区间 [start, end) */
function chinaDayRangeUtc(dayKey = chinaDayKey()) {
  const [y, m, d] = String(dayKey).split('-').map(Number)
  const startMs = Date.UTC(y, m - 1, d) - OFFSET_MS
  return [new Date(startMs).toISOString(), new Date(startMs + 86400000).toISOString()]
}

/** 东八区日加减（按日历日，不依赖容器本地时区） */
function shiftChinaDay(dayKey, deltaDays = 0) {
  const [start] = chinaDayRangeUtc(dayKey || chinaDayKey())
  return chinaDayKey(new Date(new Date(start).getTime() + Number(deltaDays || 0) * 86400000))
}

/**
 * 业务入库时间（nowIso = UTC）→ 东八区 YYYY-MM-DD HH:mm。
 * - 带 Z / 偏移 / 含 T 的 ISO：按瞬时点转东八区
 * - 无时区的「YYYY-MM-DD HH:mm[:ss]」：按 UTC 墙钟转东八区（库里常把 ISO 的 T/Z 弄丢）
 * - 已是东八区展示串（调用方二次 format）可传 { assumeChina: true }
 */
function formatChinaDateTime(input, opts = {}) {
  if (input == null || input === '') return ''
  const s = String(input).trim()
  if (!s) return ''
  const assumeChina = !!(opts && opts.assumeChina)
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)
  if (assumeChina && !hasZone && !s.includes('T')) {
    return s.replace('T', ' ').slice(0, 16)
  }
  let instant = s
  if (hasZone) {
    instant = s
  } else if (s.includes('T')) {
    instant = `${s.replace(/\.\d+$/, '')}Z`
  } else if (/^\d{4}-\d{2}-\d{2}[ ]\d{2}:\d{2}/.test(s)) {
    // naive 本地串：按 UTC 解析（与 toISOString 入库约定一致）
    instant = `${s.replace(' ', 'T').replace(/\.\d+$/, '')}Z`
  } else {
    return s.slice(0, 16)
  }
  const d = new Date(instant)
  if (Number.isNaN(d.getTime())) return s.replace('T', ' ').slice(0, 16)
  const c = new Date(d.getTime() + OFFSET_MS)
  return `${c.getUTCFullYear()}-${pad2(c.getUTCMonth() + 1)}-${pad2(c.getUTCDate())} ${pad2(c.getUTCHours())}:${pad2(c.getUTCMinutes())}`
}

/** 东八区完整墙钟 YYYY-MM-DD HH:mm:ss（微信发货等） */
function formatChinaDateTimeSeconds(input = new Date()) {
  const d = asDate(input)
  const c = new Date(d.getTime() + OFFSET_MS)
  return (
    `${c.getUTCFullYear()}-${pad2(c.getUTCMonth() + 1)}-${pad2(c.getUTCDate())} ` +
    `${pad2(c.getUTCHours())}:${pad2(c.getUTCMinutes())}:${pad2(c.getUTCSeconds())}`
  )
}

module.exports = {
  OFFSET_MS,
  chinaDayKey,
  chinaDayRangeUtc,
  shiftChinaDay,
  formatChinaDateTime,
  formatChinaDateTimeSeconds,
}

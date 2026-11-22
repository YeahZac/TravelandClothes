/** 把 UTC ISO 显示成东八区。已经是「YYYY-MM-DD HH:mm」的字符串不再加 8 小时。 */
export function formatChinaTime(input) {
  if (input == null || input === '') return ''
  const s = String(input).trim()
  if (!s) return ''
  const zoned = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)
  if (!zoned && !s.includes('T')) return s.replace('T', ' ').slice(0, 16)
  const instant = zoned ? s : `${s.replace(/\.\d+$/, '')}Z`
  const d = new Date(instant)
  if (Number.isNaN(d.getTime())) return s.replace('T', ' ').slice(0, 16)
  const c = new Date(d.getTime() + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${c.getUTCFullYear()}-${p(c.getUTCMonth() + 1)}-${p(c.getUTCDate())} ${p(c.getUTCHours())}:${p(c.getUTCMinutes())}`
}

export function chinaDayKey(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input)
  const c = new Date(d.getTime() + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${c.getUTCFullYear()}-${p(c.getUTCMonth() + 1)}-${p(c.getUTCDate())}`
}

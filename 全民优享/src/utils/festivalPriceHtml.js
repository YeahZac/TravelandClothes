/**
 * 用 ops 票价覆盖汉服节文章价表（小程序端兜底，避免已发布 HTML 滞后）。
 */
function fmtYuan(n) {
  const x = Number(n)
  if (!Number.isFinite(x) || x < 0) return '0'
  return Number.isInteger(x) ? String(x) : String(Number(x.toFixed(2)))
}

export function resolveFestivalPrices(opsFestival, fallback = {}) {
  const raw = (opsFestival && opsFestival.prices) || fallback || {}
  const a28 = Number(raw.fest_adult_28)
  const a29 = Number(raw.fest_adult_29)
  const c28 = Number(raw.fest_child_28)
  const c29 = Number(raw.fest_child_29)
  const aBoth =
    Number(raw.fest_adult_both) > 0
      ? Number(raw.fest_adult_both)
      : (Number.isFinite(a28) ? a28 : 0) + (Number.isFinite(a29) ? a29 : 0)
  const cBoth =
    Number(raw.fest_child_both) > 0
      ? Number(raw.fest_child_both)
      : (Number.isFinite(c28) ? c28 : 0) + (Number.isFinite(c29) ? c29 : 0)
  return {
    fest_adult_28: a28,
    fest_adult_29: a29,
    fest_adult_both: aBoth,
    fest_child_28: c28,
    fest_child_29: c29,
    fest_child_both: cBoth,
  }
}

/** 与 CMS festivalHtmlPriceSync 对齐的价表改写 */
export function patchFestivalFeeHtml(html, prices) {
  if (!html || typeof html !== 'string') return html || ''
  const a28 = fmtYuan(prices.fest_adult_28)
  const a29 = fmtYuan(prices.fest_adult_29)
  const aBoth = fmtYuan(prices.fest_adult_both)
  const c28 = fmtYuan(prices.fest_child_28)
  const c29 = fmtYuan(prices.fest_child_29)
  const cBoth = fmtYuan(prices.fest_child_both)

  let out = html
  out = out.replace(/两日同选按联报价/g, '两日同选按两日单价合计')
  out = out.replace(/>两日联报</g, '>两日合计<')

  out = out.replace(
    /(成人票<\/td>\s*<td[^>]*>)\s*\d+(?:\.\d+)?\s*(元<\/td>\s*<td[^>]*>)\s*\d+(?:\.\d+)?\s*(元<\/td>\s*<td[^>]*>)\s*\d+(?:\.\d+)?\s*(元)/,
    `$1${a28}$2${a29}$3${aBoth}$4`
  )
  out = out.replace(
    /(儿童\/学生[\s\S]*?<\/td>\s*<td[^>]*>)\s*\d+(?:\.\d+)?\s*(元<\/td>\s*<td[^>]*>)\s*\d+(?:\.\d+)?\s*(元<\/td>\s*<td[^>]*>)\s*\d+(?:\.\d+)?\s*(元)/,
    `$1${c28}$2${c29}$3${cBoth}$4`
  )

  const attrs = {
    fest_adult_28: a28,
    fest_adult_29: a29,
    fest_adult_both: aBoth,
    fest_child_28: c28,
    fest_child_29: c29,
    fest_child_both: cBoth,
  }
  Object.keys(attrs).forEach((sku) => {
    const re = new RegExp(
      `(data-fest-price=["']${sku}["'][^>]*>)\\s*\\d+(?:\\.\\d+)?\\s*(元?)`,
      'gi'
    )
    out = out.replace(re, `$1${attrs[sku]}$2`)
  })
  return out
}

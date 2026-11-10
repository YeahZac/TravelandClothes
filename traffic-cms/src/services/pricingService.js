/**
 * 统一「能量值 + 微信支付现金」组合计价
 * 字段约定（写入 product.meta_json / 兼容旧字段）：
 * - payPoints / costPoints / payEnergy：应付能量值（历史字段名 payPoints 保留）
 * - payCashCent / needCash：应付现金（分）
 * - listPriceCent：划线原价（分），缺省用 price_cent
 * 旧商城 points_off（元抵扣）自动换算为组合价
 */

function parseMeta(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw || '{}') || {}
  } catch (_) {
    return {}
  }
}

function nInt(v, d = 0) {
  const x = Number(v)
  return Number.isFinite(x) ? Math.max(0, Math.round(x)) : d
}

/**
 * @param {object} prod product 行或已 map 对象
 * @returns {{
 *  payPoints:number, payEnergy:number, payCashCent:number, listPriceCent:number,
 *  listPriceYuan:number, payCashYuan:number, payMode:string, label:string
 * }}
 */
function resolvePayMix(prod = {}) {
  const meta = parseMeta(prod.meta_json || prod.meta)
  const priceCent = nInt(prod.price_cent != null ? prod.price_cent : Math.round(Number(prod.price || 0) * 100))
  const listPriceCent = nInt(
    meta.listPriceCent != null ? meta.listPriceCent : prod.listPriceCent != null ? prod.listPriceCent : priceCent
  )

  let payPoints = null
  let payCashCent = null

  if (meta.payEnergy != null) {
    payPoints = nInt(meta.payEnergy)
  } else if (meta.payPoints != null || meta.costPoints != null) {
    payPoints = nInt(meta.payPoints != null ? meta.payPoints : meta.costPoints)
  }
  if (meta.payCashCent != null || meta.needCash != null) {
    payCashCent = nInt(meta.payCashCent != null ? meta.payCashCent : meta.needCash)
  }

  // 旧商城：points_off 为「可抵多少元」→ 按能量汇率折算（默认 10 能量≈1 元抵扣展示的简化：*10）
  if (payPoints == null && payCashCent == null && Number(prod.points_off || prod.pointsOff || 0) > 0) {
    const offYuan = Number(prod.points_off || prod.pointsOff || 0)
    payPoints = Math.round(offYuan * 10)
    payCashCent = Math.max(0, priceCent - Math.round(offYuan * 100))
  }

  const isGift = prod.category === '兑礼' || prod.kind === 'gift'
  if (payPoints == null && payCashCent == null) {
    if (isGift) {
      payPoints = 0
      payCashCent = 0
    } else {
      payPoints = 0
      payCashCent = priceCent
    }
  }
  if (payPoints == null) payPoints = 0
  if (payCashCent == null) payCashCent = 0
  if (!isGift && payPoints === 0 && payCashCent === 0 && priceCent > 0) {
    payCashCent = priceCent
  }

  // costEnergy 并入应付能量
  const costEnergy = nInt(meta.costEnergy)
  const payEnergy = payPoints + costEnergy

  let payMode = 'free'
  if (payEnergy > 0 && payCashCent > 0) payMode = 'mix'
  else if (payEnergy > 0) payMode = 'energy'
  else if (payCashCent > 0) payMode = 'cash'

  const parts = []
  if (payEnergy > 0) parts.push(`${payEnergy}能量值`)
  if (payCashCent > 0) parts.push(`¥${(payCashCent / 100).toFixed(payCashCent % 100 ? 2 : 0)}`)
  const label = parts.length ? parts.join('+') : '免费领'

  return {
    payPoints: payEnergy, // 兼容旧字段名 = 能量值
    payEnergy,
    payCashCent,
    listPriceCent,
    listPriceYuan: Math.round(listPriceCent) / 100,
    payCashYuan: Math.round(payCashCent) / 100,
    payMode,
    label,
    costEnergy: 0, // 已并入 payEnergy
  }
}

function applyMetaPayFields(meta = {}, body = {}) {
  const next = { ...meta }
  if (body.payEnergy != null) next.payPoints = nInt(body.payEnergy)
  if (body.payPoints != null && body.payEnergy == null) next.payPoints = nInt(body.payPoints)
  if (body.costPoints != null && body.payPoints == null && body.payEnergy == null) {
    next.payPoints = nInt(body.costPoints)
  }
  if (body.payCashCent != null) next.payCashCent = nInt(body.payCashCent)
  if (body.payCashYuan != null && body.payCashCent == null) {
    next.payCashCent = Math.round(Number(body.payCashYuan) * 100)
  }
  if (body.needCash != null && body.payCashCent == null && body.payCashYuan == null) {
    next.payCashCent = nInt(body.needCash)
  }
  if (body.listPriceCent != null) next.listPriceCent = nInt(body.listPriceCent)
  if (body.listPriceYuan != null && body.listPriceCent == null) {
    next.listPriceCent = Math.round(Number(body.listPriceYuan) * 100)
  }
  if (next.payPoints != null) {
    next.costPoints = next.payPoints
    next.payEnergy = next.payPoints
  }
  if (next.payCashCent != null) next.needCash = next.payCashCent
  // 统一后不再单独存 costEnergy 门槛
  if (body.clearCostEnergy) delete next.costEnergy
  return next
}

module.exports = {
  parseMeta,
  resolvePayMix,
  applyMetaPayFields,
}

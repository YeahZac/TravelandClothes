/**
 * 前端统一解析「能量值 + 微信支付」组合价
 * 兼容旧字段：costPoints/needCash/pointsOff/price/payPoints
 */
export function resolvePayMix(item = {}, { qty = 1 } = {}) {
  const q = Math.max(1, Number(qty) || 1)
  let payPoints =
    item.payEnergy != null
      ? Number(item.payEnergy)
      : item.payPoints != null
        ? Number(item.payPoints)
        : item.costPoints != null
          ? Number(item.costPoints)
          : null
  let payCashCent =
    item.payCashCent != null
      ? Number(item.payCashCent)
      : item.needCash != null
        ? Number(item.needCash)
        : null

  const listPriceCent =
    item.listPriceCent != null
      ? Number(item.listPriceCent)
      : item.listPriceYuan != null
        ? Math.round(Number(item.listPriceYuan) * 100)
        : item.price != null
          ? Math.round(Number(item.price) * 100)
          : 0

  if (payPoints == null && payCashCent == null && Number(item.pointsOff || 0) > 0) {
    const offYuan = Number(item.pointsOff || 0)
    payPoints = Math.round(offYuan * 10)
    payCashCent = Math.max(0, listPriceCent - Math.round(offYuan * 100))
  }

  const isGift =
    !!item.mode ||
    item.costPoints != null ||
    item.needCash != null ||
    item.costEnergy != null ||
    item.category === '兑礼'
  if (payPoints == null && payCashCent == null) {
    if (isGift) {
      payPoints = 0
      payCashCent = 0
    } else {
      payPoints = 0
      payCashCent = listPriceCent
    }
  }
  if (payPoints == null) payPoints = 0
  if (payCashCent == null) payCashCent = 0
  if (!isGift && payPoints === 0 && payCashCent === 0 && listPriceCent > 0) {
    payCashCent = listPriceCent
  }

  // costEnergy 并入能量应付
  const costEnergy = Math.max(0, Math.round(Number(item.costEnergy || 0)))
  payPoints = Math.max(0, Math.round(payPoints) + costEnergy) * q
  payCashCent = Math.max(0, Math.round(payCashCent)) * q

  let payMode = 'free'
  if (payPoints > 0 && payCashCent > 0) payMode = 'mix'
  else if (payPoints > 0) payMode = 'energy'
  else if (payCashCent > 0) payMode = 'cash'

  const cashYuan = payCashCent / 100
  const cashText = cashYuan > 0 ? `¥${cashYuan.toFixed(cashYuan % 1 ? 2 : 0)}` : ''
  const parts = []
  if (payPoints > 0) parts.push(`${payPoints}能量值`)
  if (cashText) parts.push(cashText)
  const label = parts.length ? parts.join('+') : item.payLabel || '免费领'

  const listYuan = listPriceCent / 100
  const showList =
    listPriceCent > 0 &&
    (payMode === 'mix' ||
      payMode === 'energy' ||
      payMode === 'points' ||
      (payMode === 'cash' && payCashCent < listPriceCent) ||
      payMode === 'free')

  let saveHint = ''
  if (showList && payMode !== 'cash') {
    saveHint = `省 ¥${listYuan.toFixed(listYuan % 1 ? 2 : 0)}`
  } else if (showList && payCashCent < listPriceCent) {
    const saved = (listPriceCent - payCashCent) / 100
    saveHint = `已减 ¥${saved.toFixed(saved % 1 ? 2 : 0)}`
  }

  return {
    payPoints,
    payEnergy: payPoints,
    payCashCent,
    payCashYuan: cashYuan,
    listPriceCent,
    listPriceYuan: listYuan,
    payMode: payMode === 'energy' ? 'energy' : payMode,
    label,
    cashText,
    showList,
    saveHint,
    ctaText:
      payMode === 'mix'
        ? '能量值+微信兑'
        : payMode === 'energy' || payMode === 'points'
          ? '能量值兑换'
          : payMode === 'cash'
            ? '立即购买'
            : '免费领取',
  }
}

export function formatCashCent(cent) {
  const y = Number(cent || 0) / 100
  return y.toFixed(y % 1 ? 2 : 0)
}

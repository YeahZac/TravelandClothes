/**
 * 对客公示：能量值性质（营销积分，非货币）。多入口复用，避免文案漂移。
 */
export const ENERGY_RULE_TITLE = '能量值规则说明'

export const ENERGY_RULE_LINES = [
  '「能量值」是营销积分 / 会员积分，仅可在本小程序内按规则使用',
  '能量值不是虚拟货币、不是代币，不具有法定货币属性',
  '不得提现、不得转赠、不得兑微信红包或其他现金红包',
  '平台不提供「能量值回收 / 兑换现金」入口，请勿轻信第三方套现',
]

export function goEnergyRules() {
  uni.navigateTo({ url: '/pages/legal/detail?id=energy' })
}

export function goLegalDoc(id) {
  uni.navigateTo({ url: `/pages/legal/detail?id=${encodeURIComponent(id || 'tos')}` })
}

/** 禁止把提现类能力配进主路径；合规脚注里的「不可提现」除外 */
const PROMO_FORBIDDEN = /秒到账|话费红包|现金红包|可提现/

const MODULE_TYPES = new Set([
  'banner_swiper',
  'checkin_strip',
  'quick_grid',
  'countdown_bar',
  'content_feed',
  'energy_hero',
  'task_list',
  'hot_grid',
  'goods_grid',
  'festival_hero',
  'ticket_list',
  'menu_group',
  'rich_text',
  'share_bar',
])

function scanText(value, path, errors) {
  if (typeof value !== 'string') return
  const cleaned = value.replace(
    /不可提现|禁止提现|不能提现|严禁提现|无法提现|不支持提现/g,
    ''
  )
  if (PROMO_FORBIDDEN.test(cleaned) || /提现/.test(cleaned)) {
    errors.push(`${path} 含禁止主路径文案`)
  }
}

function walk(obj, path, errors) {
  if (!obj || typeof obj !== 'object') {
    scanText(obj, path, errors)
    return
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => walk(item, `${path}[${i}]`, errors))
    return
  }
  Object.keys(obj).forEach((k) => walk(obj[k], `${path}.${k}`, errors))
}

function validateConfig(cfg) {
  const errors = []
  if (!cfg || typeof cfg !== 'object') {
    return { ok: false, errors: ['config 必须是对象'] }
  }
  if (!cfg.brand || !cfg.brand.name) errors.push('缺少 brand.name')
  if (!Array.isArray(cfg.tabBar) || cfg.tabBar.length !== 5) {
    errors.push('tabBar 必须恰好 5 项')
  }
  if (!cfg.pages || typeof cfg.pages !== 'object') errors.push('缺少 pages')
  ;['home', 'mall', 'festival', 'energy', 'mine'].forEach((key) => {
    const page = cfg.pages && cfg.pages[key]
    if (!page || !Array.isArray(page.modules)) {
      errors.push(`pages.${key}.modules 必须是数组`)
      return
    }
    page.modules.forEach((m, i) => {
      if (!m.type || !MODULE_TYPES.has(m.type)) {
        errors.push(`pages.${key}.modules[${i}].type 非法: ${m && m.type}`)
      }
      if (!m.id) errors.push(`pages.${key}.modules[${i}].id 必填`)
    })
  })
  walk(cfg, 'config', errors)
  return { ok: errors.length === 0, errors }
}

module.exports = { validateConfig, MODULE_TYPES, PROMO_FORBIDDEN }

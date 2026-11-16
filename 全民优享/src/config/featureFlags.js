/**
 * 版本功能开关（前端）。
 *
 * ENERGY_JAR_PLAY_ENABLED：能量罐「养成玩法」——罐/树成长、浇水施肥光照、偷能量/助力社交。
 * 本版关闭玩法：Tab 展示为「每日任务」，去掉养成英雄区；任务/抽奖入口保留。
 * 下版重开玩法：改为 true。正式业务改动仍走 jar / API / TreeStage，勿写进预览目录。
 */
export const ENERGY_JAR_PLAY_ENABLED = false

export function isEnergyJarPlayEnabled() {
  return ENERGY_JAR_PLAY_ENABLED === true
}

/** @deprecated 兼容旧调用：模块线始终开启，仅玩法可关 */
export function isEnergyJarLineEnabled() {
  return true
}

/** 仅养成玩法相关路径（好友偷助力）；能量罐页本身可进 */
export const ENERGY_JAR_PLAY_PATHS = ['/pages/friends/index']

export function isEnergyJarPlayPath(path) {
  const p = String(path || '')
    .split('?')[0]
    .replace(/^\//, '')
  const norm = p.startsWith('/') ? p : `/${p}`
  return ENERGY_JAR_PLAY_PATHS.some((x) => norm === x || norm.startsWith(x.replace(/\/index$/, '')))
}

function cloneMod(m) {
  if (!m || typeof m !== 'object') return m
  return { ...m, payload: m.payload ? { ...m.payload } : m.payload }
}

/** 首页：去掉今日任务；保证准点兑换后有连续签到 */
function sanitizeHomeLayout(page, fallbackHome) {
  if (!page || !Array.isArray(page.modules)) return page
  let modules = page.modules
    .map(cloneMod)
    .filter((m) => m && m.type !== 'task_list')
  const hasCheckin = modules.some((m) => m.type === 'checkin_strip')
  if (!hasCheckin) {
    const fromFb =
      (fallbackHome &&
        Array.isArray(fallbackHome.modules) &&
        fallbackHome.modules.find((m) => m && m.type === 'checkin_strip')) ||
      null
    if (fromFb) {
      const flashIdx = modules.findIndex(
        (m) => m.type === 'flash_redeem' || m.type === 'countdown_bar'
      )
      const insertAt = flashIdx >= 0 ? flashIdx + 1 : modules.length
      modules = [...modules.slice(0, insertAt), cloneMod(fromFb), ...modules.slice(insertAt)]
    }
  }
  return { ...page, modules }
}

/** 每日任务页：玩法关闭时去掉 energy_hero；暂时隐藏「更多玩法」hot_grid */
function sanitizeEnergyLayout(page, fallbackEnergy) {
  if (!page || !Array.isArray(page.modules)) return page
  let modules = page.modules
    .map(cloneMod)
    .filter((m) => m && m.type !== 'energy_hero')
    // 暂时隐藏「更多玩法」（幸运抽奖入口等）
    .filter((m) => {
      if (!m || m.type !== 'hot_grid') return true
      const title = String(m.title || '')
      const id = String(m.id || '')
      return !(title === '更多玩法' || id === 'energy_more' || id.includes('more'))
    })
    .map((m) => {
      if (m.type === 'task_list') {
        return { ...m, title: m.title === '今日任务' ? '每日任务' : m.title || '每日任务' }
      }
      return m
    })
  const hasTask = modules.some((m) => m.type === 'task_list')
  if (!hasTask && fallbackEnergy && Array.isArray(fallbackEnergy.modules)) {
    const fbMods = fallbackEnergy.modules
      .map(cloneMod)
      .filter((m) => m && m.type !== 'energy_hero')
      .filter((m) => m && m.type !== 'hot_grid')
    modules = [...fbMods, ...modules]
  }
  // 任务优先
  const rank = (t) => (t === 'task_list' ? 0 : t === 'hot_grid' ? 1 : 2)
  modules = [...modules].sort((a, b) => rank(a.type) - rank(b.type))
  return {
    ...page,
    navigationTitle: '每日任务',
    modules,
  }
}

/** 我的：签到已迁首页，去掉重复签到条 */
function sanitizeMineLayout(page) {
  if (!page || !Array.isArray(page.modules)) return page
  return {
    ...page,
    modules: page.modules.map(cloneMod).filter((m) => m && m.type !== 'checkin_strip'),
  }
}

/** 配置清洗：去掉「偷能量」等玩法入口；本版 Tab/页名为每日任务 */
export function sanitizeEnergyJarPlayFromConfig(cfg) {
  if (!cfg) return cfg
  const next = { ...cfg }
  let fallback = null
  try {
    // eslint-disable-next-line global-require
    fallback = require('./fallback.json')
  } catch (e) {}

  // 兼容：旧版曾整页删掉 pages.energy，这里用包内 fallback 补回（仅缺页时）
  if (
    fallback &&
    fallback.pages &&
    fallback.pages.energy &&
    (!next.pages || !next.pages.energy)
  ) {
    next.pages = { ...(next.pages || {}), energy: fallback.pages.energy }
  }
  if (fallback && Array.isArray(fallback.tabBar) && Array.isArray(next.tabBar)) {
    const hasEnergy = next.tabBar.some((t) => {
      const key = String((t && (t.pageKey || t.text)) || '')
      const path = String((t && (t.path || t.pagePath)) || '')
      return key === 'energy' || key === '能量罐' || key === '每日任务' || path.includes('pages/energy')
    })
    if (!hasEnergy) {
      const energyTab = fallback.tabBar.find((t) => t && t.pageKey === 'energy')
      if (energyTab) {
        const mineIdx = next.tabBar.findIndex((t) => t && (t.pageKey === 'mine' || t.text === '我的'))
        const insertAt = mineIdx >= 0 ? mineIdx : next.tabBar.length
        next.tabBar = [...next.tabBar.slice(0, insertAt), energyTab, ...next.tabBar.slice(insertAt)]
      }
    }
  }
  if (next.dicts && next.dicts.links && !next.dicts.links.energy && fallback && fallback.dicts && fallback.dicts.links) {
    next.dicts = {
      ...next.dicts,
      links: { ...next.dicts.links, energy: fallback.dicts.links.energy },
    }
  }

  // Tab / 品牌文案：能量罐 → 每日任务（玩法关闭期间）
  if (!isEnergyJarPlayEnabled()) {
    if (Array.isArray(next.tabBar)) {
      next.tabBar = next.tabBar.map((t) => {
        if (!t) return t
        const path = String(t.path || t.pagePath || '')
        const key = String(t.pageKey || t.text || '')
        if (key === 'energy' || key === '能量罐' || path.includes('pages/energy')) {
          return { ...t, text: '每日任务' }
        }
        return t
      })
    }
    if (next.brand) {
      next.brand = { ...next.brand, skin: next.brand.skin === '能量罐' ? '每日任务' : next.brand.skin }
    }
  }

  if (isEnergyJarPlayEnabled()) return next

  if (next.dicts && next.dicts.links) {
    const links = { ...next.dicts.links }
    delete links.friends
    next.dicts = { ...next.dicts, links }
  }

  if (next.pages && typeof next.pages === 'object') {
    const pages = { ...next.pages }
    const fbHome = fallback && fallback.pages && fallback.pages.home
    const fbEnergy = fallback && fallback.pages && fallback.pages.energy
    Object.keys(pages).forEach((pk) => {
      const page = pages[pk]
      if (!page || !Array.isArray(page.modules)) return
      let mods = page.modules.map((m) => sanitizeModulePlayLinks(m))
      let nextPage = { ...page, modules: mods }
      if (pk === 'home') nextPage = sanitizeHomeLayout(nextPage, fbHome)
      if (pk === 'energy') nextPage = sanitizeEnergyLayout(nextPage, fbEnergy)
      if (pk === 'mine') nextPage = sanitizeMineLayout(nextPage)
      pages[pk] = nextPage
    })
    next.pages = pages
  }

  return next
}

/** @deprecated 旧名，避免残留引用报错 */
export function stripEnergyJarLineFromConfig(cfg) {
  return sanitizeEnergyJarPlayFromConfig(cfg)
}

function sanitizeModulePlayLinks(mod) {
  if (!mod || typeof mod !== 'object') return mod
  const copy = { ...mod, payload: mod.payload ? { ...mod.payload } : mod.payload }
  const payload = copy.payload
  if (!payload) return copy

  const isPlayLink = (it) => {
    if (!it || typeof it !== 'object') return false
    const key = it.linkKey || it.link || it.action
    return key === 'friends' || it.id === 'h_friends'
  }

  ;['items', 'entries', 'icons', 'list', 'tiles'].forEach((k) => {
    if (Array.isArray(payload[k])) {
      payload[k] = payload[k].filter((it) => !isPlayLink(it))
    }
  })
  return copy
}

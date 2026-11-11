import { reactive } from 'vue'
import { fetchBootstrap } from '../api/bootstrap.js'
import { request, USE_REMOTE } from '../api/request.js'
import { rewriteConfigAssets } from '../utils/assetUrl.js'
import { applyNativeTabBar } from '../utils/tabbar.js'
import { readCachedConfig, readCachedMeta } from '../utils/configCache.js'
import { sanitizeEnergyJarPlayFromConfig } from '../config/featureFlags.js'
import fallback from '../config/fallback.json'

function detectPlatform() {
  // #ifdef MP-WEIXIN
  return 'mp-weixin'
  // #endif
  // #ifdef MP-TOUTIAO
  return 'mp-toutiao'
  // #endif
  // #ifdef MP-KUAISHOU
  return 'mp-kuaishou'
  // #endif
  // #ifdef MP-ALIPAY
  return 'mp-alipay'
  // #endif
  // #ifdef H5
  return 'h5'
  // #endif
  return 'mp-weixin'
}

function seedFromFallback() {
  const cached = readCachedConfig()
  const raw = cached
    ? rewriteConfigAssets(cached, { remote: true, assetBase: (readCachedMeta() || {}).assetBase })
    : rewriteConfigAssets(fallback, { remote: false })
  return sanitizeEnergyJarPlayFromConfig(raw)
}

const seed = seedFromFallback()

export const appConfig = reactive({
  ready: true,
  from: seed === fallback || !readCachedConfig() ? 'fallback' : 'cache',
  version: seed.version || '',
  brand: seed.brand || { name: '', skin: '', slogan: '' },
  tabBar: seed.tabBar || [],
  pages: seed.pages || {},
  dicts: seed.dicts || { links: {} },
  assets: seed.assets || {},
  copy: seed.copy || {},
  game: seed.game || {},
  ops: seed.ops || {},
  catalog: seed.catalog || { products: [], lottery: [], tasks: [], icons: {}, gifts: [] },
  risk: seed.risk || { fused: false },
  economy: (seed.game && seed.game.economy) || { energyPerYuan: 1000, lotteryEnergyCost: 50, label: '能量值' },
  lotteryRules: seed.lotteryRules || { lines: [] },
  meta: readCachedMeta() || {},
  assetBase: (readCachedMeta() || {}).assetBase || null,
  platform: detectPlatform(),
})

/** 后台 catalog 与壳层 mall / lottery / assets 互通 */
function mergeCatalogIntoPages(cfg, catalog) {
  if (!cfg || !catalog) return cfg
  const pages = cfg.pages || {}
  if (catalog.products && catalog.products.length && pages.mall) {
    const mods = pages.mall.modules || []
    const idx = mods.findIndex((m) => m.type === 'goods_grid')
    if (idx >= 0) {
      mods[idx].payload = mods[idx].payload || {}
      delete mods[idx].payload.categories
      mods[idx].payload.items = catalog.products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        pointsOff: p.pointsOff,
        payPoints: p.payPoints,
        payCashCent: p.payCashCent,
        payCashYuan: p.payCashYuan,
        listPriceCent: p.listPriceCent,
        listPriceYuan: p.listPriceYuan,
        payMode: p.payMode,
        payLabel: p.payLabel,
        tag: p.tag,
        imageUrl: p.imageUrl,
        subtitle: p.subtitle || '',
        detailHtml: p.detailHtml || '',
        gallery: p.gallery || [],
        tone: 'mint',
        stock: p.stock,
      }))
    }
  }
  if (catalog.icons && typeof catalog.icons === 'object') {
    // 后台图标库覆盖壳层 assets（忽略空串 /static）
    const merged = { ...(cfg.assets || {}) }
    Object.keys(catalog.icons).forEach((k) => {
      const v = catalog.icons[k]
      if (v && typeof v === 'string' && !v.startsWith('/static/')) merged[k] = v
    })
    cfg.assets = merged
  }
  if (!cfg.game) cfg.game = {}
  if (catalog.lottery && catalog.lottery.length) {
    cfg.game.lottery = catalog.lottery
  }
  if (catalog.tasks && catalog.tasks.length) {
    cfg.catalog = cfg.catalog || {}
    cfg.catalog.tasks = catalog.tasks
  }
  return cfg
}

function applyConfig(data) {
  let cfg = data.config || {}
  const catalog = data.catalog || cfg.catalog || {}
  cfg = mergeCatalogIntoPages(cfg, catalog)
  cfg = sanitizeEnergyJarPlayFromConfig(cfg)
  appConfig.from = data.from
  appConfig.platform = data.platform || detectPlatform()
  appConfig.version = cfg.version || ''
  appConfig.brand = cfg.brand || {}
  appConfig.tabBar = cfg.tabBar || []
  appConfig.pages = cfg.pages || {}
  appConfig.dicts = cfg.dicts || { links: {} }
  appConfig.assets = cfg.assets || {}
  appConfig.copy = cfg.copy || {}
  appConfig.game = cfg.game || {}
  appConfig.ops = cfg.ops || data.ops || {}
  appConfig.catalog = {
    products: catalog.products || [],
    lottery: catalog.lottery || cfg.game.lottery || [],
    tasks: catalog.tasks || [],
    icons: catalog.icons || {},
    gifts: catalog.gifts || [],
  }
  appConfig.risk = data.risk || cfg.risk || { fused: false }
  appConfig.lotteryRules = data.lotteryRules || cfg.lotteryRules || appConfig.lotteryRules || { lines: [] }
  appConfig.economy =
    data.economy ||
    (cfg.game && cfg.game.economy) ||
    appConfig.economy ||
    { energyPerYuan: 1000, lotteryEnergyCost: 50, label: '能量值' }
  if (cfg.game && !cfg.game.economy) cfg.game.economy = appConfig.economy
  appConfig.meta = data.meta || {}
  appConfig.assetBase = (data.meta && data.meta.assetBase) || null
  appConfig.ready = true
  // 连签档位：后台 game.rewards.checkin → 本地 session（展示与离线签到）
  try {
    const { session } = require('./session.js')
    const list = (cfg.game && cfg.game.rewards && cfg.game.rewards.checkin) || []
    if (Array.isArray(list) && list.length) {
      session.checkin.rewards = list.map((x, i) => ({
        day: Number(x.day) || i + 1,
        label: x.label || `+${x.amount || x.value || 0}`,
        type: x.type || 'energy',
        value: Number(x.value != null ? x.value : x.amount) || 0,
        amount: Number(x.amount != null ? x.amount : x.value) || 0,
      }))
    }
  } catch (_) {}
  applyNativeTabBar()
}

export async function loadAppConfig(force = false) {
  const platform = detectPlatform()
  const data = await fetchBootstrap({ force, platform })
  applyConfig(data)
  return appConfig
}

export async function refreshAppConfigIfNeeded() {
  if (!USE_REMOTE) {
    applyNativeTabBar()
    return appConfig
  }
  try {
    const platform = detectPlatform()
    const data = await fetchBootstrap({ force: false, platform })
    if (data.from === 'remote' || data.from === 'cache-304' || data.from === 'cache') {
      // version 变化才整表替换；304/同版本仍刷新 tab（文案）
      if (!appConfig.version || data.config.version !== appConfig.version || data.from === 'remote') {
        applyConfig(data)
      } else {
        applyNativeTabBar()
      }
    } else {
      applyNativeTabBar()
    }
  } catch (e) {
    applyNativeTabBar()
  }
  return appConfig
}

/**
 * 商城商品：直接拉线上 catalog，不依赖壳层发布按钮 / 本地缓存版本。
 * 保存商品后小程序进商城即可看到最新列表与封面。
 */
export async function refreshMallCatalog() {
  if (!USE_REMOTE) return appConfig
  try {
    const raw = await request('/api/traffic/v1/catalog', { method: 'GET', timeout: 15000 })
    const catalog = rewriteConfigAssets(raw || {}, {
      remote: true,
      assetBase: appConfig.assetBase || (appConfig.meta && appConfig.meta.assetBase) || null,
    })
    applyConfig({
      from: 'catalog-live',
      config: {
        version: appConfig.version,
        brand: appConfig.brand,
        tabBar: appConfig.tabBar,
        pages: appConfig.pages,
        dicts: appConfig.dicts,
        assets: appConfig.assets,
        copy: appConfig.copy,
        game: appConfig.game,
        catalog,
        risk: appConfig.risk,
      },
      catalog,
      meta: appConfig.meta,
      platform: appConfig.platform,
    })
  } catch (e) {
    console.warn('[catalog]', e && e.message)
  }
  return appConfig
}

export function pageModules(pageKey) {
  const page = appConfig.pages[pageKey]
  return (page && page.modules) || []
}

export function pageTitle(pageKey) {
  const page = appConfig.pages[pageKey]
  return (page && page.navigationTitle) || appConfig.brand.name || ''
}

export function resolveLink(linkOrKey) {
  if (!linkOrKey) return { type: 'none' }
  if (typeof linkOrKey === 'string') {
    // 直接路径：/pages/... 或 pages/...
    if (linkOrKey.startsWith('/') || linkOrKey.startsWith('pages/')) {
      const path = linkOrKey.startsWith('/') ? linkOrKey : `/${linkOrKey}`
      const tabPaths = (appConfig.tabBar || []).map((t) => t.pagePath).filter(Boolean)
      const norm = path.replace(/^\//, '')
      if (tabPaths.some((p) => p === norm || `/${p}` === path)) {
        return { type: 'tab', path: path.startsWith('/') ? path : `/${path}` }
      }
      return { type: 'page', path }
    }
    return appConfig.dicts.links[linkOrKey] || { type: 'none' }
  }
  // 条目对象：优先显式 path，再 linkKey / link
  if (linkOrKey.path && typeof linkOrKey.path === 'string') {
    const path = linkOrKey.path.startsWith('/') ? linkOrKey.path : `/${linkOrKey.path}`
    if (linkOrKey.type === 'tab' || linkOrKey.type === 'page' || linkOrKey.type === 'webview') {
      return { type: linkOrKey.type, path, params: linkOrKey.params }
    }
    return resolveLink(path)
  }
  if (linkOrKey.linkKey) {
    return appConfig.dicts.links[linkOrKey.linkKey] || { type: 'none' }
  }
  if (linkOrKey.link) return resolveLink(linkOrKey.link)
  if (linkOrKey.type) return linkOrKey
  return { type: 'none' }
}

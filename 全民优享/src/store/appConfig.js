import { reactive } from 'vue'
import { fetchBootstrap } from '../api/bootstrap.js'
import { USE_REMOTE } from '../api/request.js'
import { rewriteConfigAssets } from '../utils/assetUrl.js'
import { applyNativeTabBar } from '../utils/tabbar.js'
import { readCachedConfig, readCachedMeta } from '../utils/configCache.js'
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
  if (cached) return rewriteConfigAssets(cached, { remote: true, assetBase: (readCachedMeta() || {}).assetBase })
  return rewriteConfigAssets(fallback, { remote: false })
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
  catalog: seed.catalog || { products: [], lottery: [], tasks: [], icons: {}, gifts: [] },
  risk: seed.risk || { fused: false },
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
      mods[idx].payload.items = catalog.products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        pointsOff: p.pointsOff,
        tag: p.tag,
        imageUrl: p.imageUrl,
        tone: 'mint',
        stock: p.stock,
      }))
    }
  }
  if (catalog.icons && typeof catalog.icons === 'object') {
    cfg.assets = { ...(cfg.assets || {}), ...catalog.icons }
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
  appConfig.catalog = {
    products: catalog.products || [],
    lottery: catalog.lottery || cfg.game.lottery || [],
    tasks: catalog.tasks || [],
    icons: catalog.icons || {},
    gifts: catalog.gifts || [],
  }
  appConfig.risk = data.risk || cfg.risk || { fused: false }
  appConfig.meta = data.meta || {}
  appConfig.assetBase = (data.meta && data.meta.assetBase) || null
  appConfig.ready = true
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
    return appConfig.dicts.links[linkOrKey] || { type: 'none' }
  }
  if (linkOrKey.linkKey) {
    return appConfig.dicts.links[linkOrKey.linkKey] || { type: 'none' }
  }
  if (linkOrKey.link) return linkOrKey.link
  if (linkOrKey.type) return linkOrKey
  return { type: 'none' }
}

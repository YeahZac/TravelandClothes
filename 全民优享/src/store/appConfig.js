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
  meta: readCachedMeta() || {},
  assetBase: (readCachedMeta() || {}).assetBase || null,
  platform: detectPlatform(),
})

function applyConfig(data) {
  const cfg = data.config || {}
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

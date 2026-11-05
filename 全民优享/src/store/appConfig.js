import { reactive } from 'vue'
import { fetchBootstrap } from '../api/bootstrap.js'
import { request, USE_REMOTE } from '../api/request.js'
import { rewriteConfigAssets } from '../utils/assetUrl.js'
import { applyNativeTabBar } from '../utils/tabbar.js'
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
  return rewriteConfigAssets(fallback, { remote: false })
}

const seed = seedFromFallback()

export const appConfig = reactive({
  ready: true,
  from: 'fallback',
  version: seed.version || '',
  brand: seed.brand || { name: '', skin: '', slogan: '' },
  tabBar: seed.tabBar || [],
  pages: seed.pages || {},
  dicts: seed.dicts || { links: {} },
  assets: seed.assets || {},
  copy: seed.copy || {},
  platform: 'mp-weixin',
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
  appConfig.ready = true
  applyNativeTabBar()
}

export async function loadAppConfig(force = false) {
  if (appConfig.from === 'remote' && !force) return appConfig
  const platform = detectPlatform()
  const data = await fetchBootstrap(platform)
  applyConfig(data)
  return appConfig
}

export async function refreshAppConfigIfNeeded() {
  if (!USE_REMOTE) {
    applyNativeTabBar()
    return appConfig
  }
  const platform = detectPlatform()
  try {
    const data = await request(
      `/api/traffic/v1/bootstrap?platform=${encodeURIComponent(platform)}`
    )
    const cfg = rewriteConfigAssets(data.config || {}, { remote: true })
    const next = cfg.version || ''
    if (!appConfig.version || (next && next !== appConfig.version) || appConfig.from !== 'remote') {
      applyConfig({ ...data, config: cfg, from: 'remote' })
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

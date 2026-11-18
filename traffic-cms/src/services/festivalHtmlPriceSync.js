/**
 * 票价 → 汉服节文章 HTML 同步：改 ops 票价后，草稿/已发布的 fest_schedule 表格一并更新，
 * 避免「底栏已变价、文章仍旧价」。
 */
const configService = require('./configService')

function fmtYuan(n) {
  const x = Number(n)
  if (!Number.isFinite(x) || x < 0) return '0'
  return Number.isInteger(x) ? String(x) : String(Number(x.toFixed(2)))
}

function priceMap(prices) {
  const a28 = fmtYuan(prices.fest_adult_28)
  const a29 = fmtYuan(prices.fest_adult_29)
  const aBoth = fmtYuan(
    Number(prices.fest_adult_both) > 0
      ? prices.fest_adult_both
      : Number(prices.fest_adult_28 || 0) + Number(prices.fest_adult_29 || 0)
  )
  const c28 = fmtYuan(prices.fest_child_28)
  const c29 = fmtYuan(prices.fest_child_29)
  const cBoth = fmtYuan(
    Number(prices.fest_child_both) > 0
      ? prices.fest_child_both
      : Number(prices.fest_child_28 || 0) + Number(prices.fest_child_29 || 0)
  )
  return {
    fest_adult_28: a28,
    fest_adult_29: a29,
    fest_adult_both: aBoth,
    fest_child_28: c28,
    fest_child_29: c29,
    fest_child_both: cBoth,
  }
}

/**
 * 将价目写入报名费用表；并植入 data-fest-price，便于下次精确替换。
 */
function patchFestivalFeeHtml(html, prices) {
  if (!html || typeof html !== 'string') return { html: html || '', changed: false }
  const map = priceMap(prices)
  const a28 = map.fest_adult_28
  const a29 = map.fest_adult_29
  const aBoth = map.fest_adult_both
  const c28 = map.fest_child_28
  const c29 = map.fest_child_29
  const cBoth = map.fest_child_both

  const original = String(html || '')
  let out = original.replace(/<(p|li)\b[^>]*>[\s\S]*?<\/\1>/gi, (block) => {
    if (/免报名费/.test(block) || /付费报名请滑动/.test(block)) return ''
    return block
  })

  out = out.replace(/两日同选按联报价/g, '两日同选按两日单价合计')
  out = out.replace(/>两日联报</g, '>两日合计<')

  // 优先：带 data-fest-price
  Object.keys(map).forEach((sku) => {
    const re = new RegExp(
      `(data-fest-price=["']${sku}["'][^>]*>)\\s*\\d+(?:\\.\\d+)?\\s*(元?)`,
      'gi'
    )
    out = out.replace(re, `$1${map[sku]}$2`)
  })

  // 成人三列：写入数值并补 data-fest-price（若还没有）
  out = out.replace(
    /成人票<\/td>\s*<td([^>]*)>\s*\d+(?:\.\d+)?\s*元<\/td>\s*<td([^>]*)>\s*\d+(?:\.\d+)?\s*元<\/td>\s*<td([^>]*)>\s*\d+(?:\.\d+)?\s*元<\/td>/,
    (full, a1, a2, a3) => {
      const t1 = /data-fest-price=/.test(a1) ? a1 : `${a1} data-fest-price="fest_adult_28"`
      const t2 = /data-fest-price=/.test(a2) ? a2 : `${a2} data-fest-price="fest_adult_29"`
      const t3 = /data-fest-price=/.test(a3) ? a3 : `${a3} data-fest-price="fest_adult_both"`
      return `成人票</td><td${t1}>${a28}元</td><td${t2}>${a29}元</td><td${t3}>${aBoth}元</td>`
    }
  )

  // 儿童/学生三列
  out = out.replace(
    /(儿童\/学生[\s\S]*?<\/td>)\s*<td([^>]*)>\s*\d+(?:\.\d+)?\s*元<\/td>\s*<td([^>]*)>\s*\d+(?:\.\d+)?\s*元<\/td>\s*<td([^>]*)>\s*\d+(?:\.\d+)?\s*元<\/td>/,
    (full, labelTd, a1, a2, a3) => {
      const t1 = /data-fest-price=/.test(a1) ? a1 : `${a1} data-fest-price="fest_child_28"`
      const t2 = /data-fest-price=/.test(a2) ? a2 : `${a2} data-fest-price="fest_child_29"`
      const t3 = /data-fest-price=/.test(a3) ? a3 : `${a3} data-fest-price="fest_child_both"`
      return `${labelTd}<td${t1}>${c28}元</td><td${t2}>${c29}元</td><td${t3}>${cBoth}元</td>`
    }
  )

  return { html: out, changed: out !== original }
}

function findScheduleMod(page) {
  if (!page || !Array.isArray(page.modules)) return { page: null, idx: -1, mod: null }
  let idx = page.modules.findIndex((m) => m && m.id === 'fest_schedule' && m.type === 'rich_text')
  if (idx < 0) idx = page.modules.findIndex((m) => m && m.type === 'rich_text')
  return { page, idx, mod: idx >= 0 ? page.modules[idx] : null }
}

function applyPricesToConfig(cfg, prices) {
  if (!cfg || !cfg.pages || !cfg.pages.festival) {
    return { ok: false, changed: false, msg: '无 festival 页' }
  }
  const { idx, mod } = findScheduleMod(cfg.pages.festival)
  if (!mod || !mod.payload) return { ok: false, changed: false, msg: '无 fest_schedule 富文本' }
  const html = mod.payload.html || mod.payload.text || ''
  const patched = patchFestivalFeeHtml(html, prices)
  if (!patched.changed) return { ok: true, changed: false, msg: 'HTML 价表已是最新或未识别到价表' }
  const nextMod = {
    ...mod,
    payload: { ...mod.payload, html: patched.html },
  }
  const mods = cfg.pages.festival.modules.slice()
  mods[idx] = nextMod
  cfg.pages.festival = { ...cfg.pages.festival, modules: mods }
  return { ok: true, changed: true, msg: '已同步文章价表' }
}

/**
 * 同步草稿 + 已发布（票价属运营即时生效字段，文章需跟价）
 */
function syncFestivalHtmlPrices(prices) {
  const map = prices && typeof prices === 'object' ? prices : {}
  const result = { draft: null, published: null }
  try {
    const draftRaw = configService.getDraft()
    const draft = draftRaw ? JSON.parse(JSON.stringify(draftRaw)) : null
    if (draft) {
      const r = applyPricesToConfig(draft, map)
      result.draft = r
      if (r.changed) configService.saveDraft(draft)
    }
  } catch (e) {
    result.draft = { ok: false, changed: false, msg: (e && e.message) || 'draft sync failed' }
  }
  try {
    const pubRaw = configService.getPublished()
    const pub = pubRaw ? JSON.parse(JSON.stringify(pubRaw)) : null
    if (pub) {
      const r = applyPricesToConfig(pub, map)
      result.published = r
      if (r.changed) {
        const dbMod = require('../db')
        const d = dbMod.open()
        const t = dbMod.nowIso()
        const payload = JSON.stringify(pub)
        d.prepare(`UPDATE config_published SET payload_json=?, updated_at=? WHERE id=1`).run(payload, t)
        try {
          const path = require('path')
          const fs = require('fs')
          const file = path.join(__dirname, '..', 'data', 'published.json')
          fs.writeFileSync(file, JSON.stringify(pub, null, 2), 'utf8')
        } catch (_) {}
      }
    }
  } catch (e) {
    result.published = { ok: false, changed: false, msg: (e && e.message) || 'published sync failed' }
  }
  return result
}

module.exports = {
  patchFestivalFeeHtml,
  syncFestivalHtmlPrices,
  applyPricesToConfig,
  priceMap,
}

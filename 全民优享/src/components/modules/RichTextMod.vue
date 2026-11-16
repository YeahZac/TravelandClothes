<template>
  <view class="rich">
    <rich-text v-if="rendered" class="html" :nodes="rendered" />
    <text v-else class="txt">{{ text }}</text>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { appConfig } from '../../store/appConfig.js'
import { CMS_BASE } from '../../api/request.js'
import { ensureLocalImage } from '../../utils/cloudImage.js'

const props = defineProps({ mod: Object })
const rawHtml = computed(() => (props.mod.payload && props.mod.payload.html) || '')
const text = computed(
  () =>
    (props.mod.payload && props.mod.payload.text) ||
    appConfig.copy.compliance ||
    ''
)
const rendered = ref('')

function extractKey(url) {
  const u = String(url || '').trim()
  if (!u) return ''
  if (u.includes('/qmyx/')) return u.slice(u.indexOf('/qmyx/') + 1).replace(/^\/+/, '').split('?')[0]
  if (u.startsWith('/uploads/')) return u.slice('/uploads/'.length).split('?')[0]
  if (u.startsWith('qmyx/')) return u.split('?')[0]
  try {
    const q = new URL(u, 'https://yx.linyio.com')
    const k = q.searchParams.get('key')
    if (k) return decodeURIComponent(k)
  } catch (_) {}
  return ''
}

function toProxyHttps(url) {
  const u = String(url || '').trim()
  if (!u || u.startsWith('data:') || u.startsWith('wxfile://')) return u
  if (/^https?:\/\//i.test(u) && u.includes('/api/traffic/v1/media/file')) return u
  const key = extractKey(u)
  if (key) return `${CMS_BASE}/api/traffic/v1/media/file?key=${encodeURIComponent(key)}`
  if (/^https?:\/\//i.test(u)) return u
  return u
}

async function rewriteHtmlImages(html) {
  const src = String(html || '')
  if (!src) return ''
  const re = /(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi
  const matches = [...src.matchAll(re)]
  if (!matches.length) return src.replace(/__FESTIVAL_(HERO|QR|SCENE)_IMG__/g, '')

  let out = src
  for (const m of matches) {
    const original = m[2]
    if (
      original.includes('__FESTIVAL_') ||
      original === 'about:blank' ||
      !original.trim()
    ) {
      // 占位未替换：去掉整张图，避免裂图
      out = out.replace(m[0], '')
      continue
    }
    let next = toProxyHttps(original)
    try {
      const local = await ensureLocalImage(original)
      if (local) next = local
    } catch (_) {}
    if (next && next !== original) {
      out = out.replace(m[0], `${m[1]}${next}${m[3]}`)
    }
  }
  return out
}

watch(
  rawHtml,
  async (v) => {
    rendered.value = ''
    if (!v) return
    try {
      rendered.value = await rewriteHtmlImages(v)
    } catch (_) {
      rendered.value = String(v || '')
        .replace(/__FESTIVAL_(HERO|QR|SCENE)_IMG__/g, '')
        .replace(/<img\b[^>]*src=["']__FESTIVAL_[^"']+["'][^>]*>/gi, '')
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.rich {
  padding: 8rpx 4rpx;
}
.txt {
  display: block;
  font-size: 22rpx;
  color: #5e6977;
  line-height: 1.5;
}
.html {
  display: block;
  font-size: 28rpx;
  color: #2b2520;
  line-height: 1.6;
  word-break: break-word;
}
</style>

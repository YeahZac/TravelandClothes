<template>
  <view class="rich">
    <block v-for="(b, i) in blocks" :key="i">
      <rich-text v-if="b.type === 'html' && b.html" class="html" :nodes="b.html" />
      <view v-else-if="b.type === 'img'" class="img-wrap">
        <CmsImage class="rich-img" :src="b.src" mode="widthFix" :show-placeholder="true" />
      </view>
    </block>
    <text v-if="!blocks.length && text" class="txt">{{ text }}</text>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { appConfig } from '../../store/appConfig.js'
import CmsImage from '../CmsImage.vue'
import { patchFestivalFeeHtml, resolveFestivalPrices } from '../../utils/festivalPriceHtml.js'

const props = defineProps({ mod: Object })
const rawHtml = computed(() => (props.mod.payload && props.mod.payload.html) || '')
const text = computed(
  () =>
    (props.mod.payload && props.mod.payload.text) ||
    appConfig.copy.compliance ||
    ''
)
const blocks = ref([])

function applyLivePrices(html) {
  const src = String(html || '')
  if (!src || !/成人票|data-fest-price|报名费用/.test(src)) return src
  const fest = (appConfig.ops && appConfig.ops.festival) || {}
  const prices = resolveFestivalPrices(fest)
  const hasAny = Object.values(prices).some((v) => Number(v) > 0)
  if (!hasAny) return src
  return patchFestivalFeeHtml(src, prices)
}

function splitHtml(html) {
  const src = applyLivePrices(html)
  if (!src) return []
  const cleaned = src
    .replace(/__FESTIVAL_(HERO|QR|SCENE)_IMG__/g, '')
    .replace(/<img\b[^>]*src=["']__FESTIVAL_[^"']+["'][^>]*>/gi, '')
    // 不再展示「官方报名二维码」占位块（含邀请卡图）
    .replace(/<div\b[^>]*>[\s\S]*?官方报名二维码[\s\S]*?<\/div>/gi, '')
    .replace(/<p\b[^>]*>\s*官方报名二维码[\s\S]*?<\/p>/gi, '')
    .replace(/<img\b[^>]*festival-invite[^>]*>/gi, '')
  const re = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi
  const out = []
  let last = 0
  let m
  while ((m = re.exec(cleaned))) {
    const before = cleaned.slice(last, m.index).trim()
    if (before) out.push({ type: 'html', html: before })
    const imgSrc = String(m[1] || '').trim()
    if (imgSrc && !imgSrc.includes('__FESTIVAL_')) {
      out.push({ type: 'img', src: imgSrc })
    }
    last = m.index + m[0].length
  }
  const tail = cleaned.slice(last).trim()
  if (tail) out.push({ type: 'html', html: tail })
  return out
}

watch(
  [rawHtml, () => appConfig.ops && appConfig.ops.festival && appConfig.ops.festival.prices],
  () => {
    blocks.value = splitHtml(rawHtml.value)
  },
  { immediate: true, deep: true }
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
.img-wrap {
  width: 100%;
  margin: 12rpx 0 20rpx;
  border-radius: 16rpx;
  overflow: hidden;
  background: #f3ebe3;
}
.rich-img {
  width: 100%;
  display: block;
  min-height: 120rpx;
}
</style>

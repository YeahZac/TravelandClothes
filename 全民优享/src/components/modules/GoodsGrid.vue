<template>
  <view>
    <view class="head">
      <text class="title">{{ mod.title || '优享好物' }}</text>
      <text class="sub">能量值可抵 · 微信可补 · 组合更划算</text>
    </view>
    <view class="grid">
      <view v-for="g in items" :key="g.id" class="goods" @click="onOpen(g)">
        <view class="cover">
          <CmsImage
            :src="coverRaw(g)"
            mode="aspectFill"
            placeholder="/static/ui/ico-gift.png"
            :show-placeholder="true"
          />
          <text v-if="g.tag" class="tag">{{ g.tag }}</text>
          <text v-if="mixOf(g).payMode === 'mix'" class="ribbon">组合兑</text>
        </view>
        <text class="name">{{ g.name }}</text>
        <view class="price-wrap">
          <PriceMix :item="g" size="sm" />
          <text class="buy-tag">{{ mixOf(g).ctaText }}</text>
        </view>
      </view>
    </view>
    <view v-if="browseCta" class="browse-bar">
      <text class="browse-t">浏览 15 秒，养成 +3%</text>
      <button class="yx-btn-ghost" @click="onBrowse">{{ browseCta }}</button>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { browseMallDone } from '../../store/session.js'
import { resolveImageSrc } from '../../utils/resolveMedia.js'
import { resolvePayMix } from '../../utils/payMix.js'
import CmsImage from '../CmsImage.vue'
import PriceMix from '../PriceMix.vue'

const props = defineProps({ mod: Object })
const p = computed(() => props.mod.payload || {})
const items = computed(() => p.value.items || [])
const browseCta = computed(() => p.value.browseCta || '')

function coverRaw(g) {
  return resolveImageSrc(g && g.imageUrl)
}

function mixOf(g) {
  return resolvePayMix(g || {})
}

function onBrowse() {
  uni.showLoading({ title: '浏览中…' })
  setTimeout(() => {
    uni.hideLoading()
    uni.showToast({ title: browseMallDone().msg, icon: 'none' })
  }, 1000)
}

function onOpen(g) {
  if (!g || !g.id) return
  uni.navigateTo({ url: `/pages/mall/detail?id=${encodeURIComponent(g.id)}` })
}
</script>

<style scoped>
.head {
  margin-bottom: 16rpx;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}
.title {
  font-size: 32rpx;
  font-weight: 700;
  color: #111827;
}
.sub {
  font-size: 20rpx;
  color: #e11d48;
  font-weight: 600;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx 14rpx;
}
.goods {
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  padding-bottom: 18rpx;
  box-shadow: 0 6rpx 20rpx rgba(17, 24, 39, 0.06);
}
.cover {
  height: 340rpx;
  background: #f3f4f6;
  position: relative;
  overflow: hidden;
}
.cover :deep(.cms-img),
.cover :deep(.cms-ph) {
  width: 100%;
  height: 100%;
  display: block;
}
.tag {
  position: absolute;
  left: 0;
  top: 16rpx;
  padding: 6rpx 14rpx;
  border-radius: 0 999rpx 999rpx 0;
  background: linear-gradient(90deg, #e11d48, #f97316);
  color: #fff;
  font-size: 20rpx;
  font-weight: 700;
}
.ribbon {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 6rpx 12rpx;
  background: rgba(17, 24, 39, 0.82);
  color: #fff;
  font-size: 18rpx;
  font-weight: 700;
}
.name {
  display: block;
  margin: 14rpx 14rpx 0;
  font-size: 26rpx;
  font-weight: 600;
  color: #111827;
  line-height: 1.35;
  height: 70rpx;
  overflow: hidden;
}
.price-wrap {
  margin: 8rpx 14rpx 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 8rpx;
}
.buy-tag {
  flex-shrink: 0;
  font-size: 18rpx;
  color: #fff;
  background: #e11d48;
  padding: 6rpx 12rpx;
  border-radius: 8rpx;
  font-weight: 700;
}
.browse-bar {
  margin-top: 48rpx;
  height: 96rpx;
  background: #fff;
  border-top: 1rpx solid #e6e8ee;
  border-radius: 20rpx;
  padding: 0 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.browse-t {
  font-size: 26rpx;
  color: #121826;
}
.yx-btn-ghost {
  margin: 0;
  height: 56rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  border: 2rpx solid #121826;
  background: transparent;
  color: #121826;
  font-size: 22rpx;
  font-weight: 600;
  line-height: 52rpx;
}
.yx-btn-ghost::after {
  border: none;
}
</style>

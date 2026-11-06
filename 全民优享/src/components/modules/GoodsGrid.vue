<template>
  <view>
    <view class="head">
      <text class="title">{{ mod.title || '优享好物' }}</text>
    </view>
    <scroll-view v-if="categories.length" scroll-x class="cats">
      <text
        v-for="c in categories"
        :key="c"
        class="cat"
        :class="{ on: cat === c }"
        @click="cat = c"
      >{{ c }}</text>
    </scroll-view>
    <view class="grid">
      <view v-for="g in items" :key="g.id" class="goods" @click="onOpen(g)">
        <view class="cover">
          <image :src="coverOf(g)" mode="aspectFit" />
          <text v-if="g.tag" class="tag">{{ g.tag }}</text>
        </view>
        <text class="name">{{ g.name }}</text>
        <view class="price">
          <text class="p yx-num">¥{{ g.price }}</text>
          <text class="buy-tag">查看详情</text>
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
import { computed, ref } from 'vue'
import { browseMallDone } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { assetUrl } from '../../utils/assetUrl.js'

const props = defineProps({ mod: Object })
const p = computed(() => props.mod.payload || {})
const items = computed(() => p.value.items || [])
const categories = computed(() => p.value.categories || [])
const browseCta = computed(() => p.value.browseCta || '')
const cat = ref((categories.value && categories.value[0]) || '推荐')

function coverOf(g) {
  const raw = g && g.imageUrl
  if (!raw || String(raw).startsWith('/static/')) {
    return '/static/ui/ico-gift.png'
  }
  return assetUrl(raw, { remote: true, assetBase: appConfig.assetBase }) || '/static/ui/ico-gift.png'
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
}
.title {
  font-size: 32rpx;
  font-weight: 600;
  color: #121826;
}
.cats {
  white-space: nowrap;
  margin-bottom: 16rpx;
  height: 64rpx;
}
.cat {
  display: inline-block;
  margin-right: 28rpx;
  padding-bottom: 10rpx;
  font-size: 26rpx;
  color: #3a4252;
  border-bottom: 4rpx solid transparent;
}
.cat.on {
  color: #121826;
  font-weight: 600;
  border-bottom-color: #121826;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24rpx 16rpx;
}
.goods {
  background: #fff;
  border-radius: 20rpx;
  overflow: hidden;
  padding-bottom: 16rpx;
  box-shadow: 0 8rpx 24rpx rgba(18, 24, 38, 0.06);
}
.cover {
  height: 328rpx;
  background: #f3f4f6;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cover image {
  width: 70%;
  height: 70%;
}
.tag {
  position: absolute;
  left: 12rpx;
  top: 12rpx;
  padding: 4rpx 10rpx;
  border-radius: 8rpx;
  background: rgba(18, 24, 38, 0.8);
  color: #fff;
  font-size: 20rpx;
}
.name {
  display: block;
  margin: 16rpx 16rpx 0;
  font-size: 28rpx;
  font-weight: 600;
  color: #121826;
  line-height: 1.3;
  height: 72rpx;
  overflow: hidden;
}
.price {
  margin: 8rpx 16rpx 0;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.p {
  font-size: 32rpx;
  font-weight: 700;
  color: #121826;
  font-variant-numeric: tabular-nums;
}
.buy-tag {
  font-size: 20rpx;
  color: #6e6258;
  background: #f4ede6;
  padding: 4rpx 10rpx;
  border-radius: 999rpx;
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

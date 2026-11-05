<template>
  <view class="grid">
    <view
      v-for="item in items"
      :key="item.id"
      class="item"
      @click="openLink(item.linkKey || item.link)"
    >
      <view class="ico-wrap" :style="iconBg(item)">
        <VIcon
          v-if="item.iconKey || !item.iconUrl"
          :name="item.iconKey || 'coin'"
          :size="56"
          :color="iconColor(item)"
          :stroke="iconStroke(item)"
        />
        <image v-else class="ico" :src="item.iconUrl" mode="aspectFit" />
        <view v-if="badge(item)" class="dot">
          <text class="dot-num yx-num">{{ session.user.lotteryChance }}</text>
        </view>
      </view>
      <text class="name">{{ item.name }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { openLink } from '../../utils/navigate.js'
import { session } from '../../store/session.js'
import VIcon from '../VIcon.vue'

const props = defineProps({ mod: Object })
const items = computed(() => ((props.mod.payload && props.mod.payload.items) || []).slice(0, 5))

// 4 金刚按位置轮换柔色块
const TONES = [
  { bg: '#FFF1E6', color: '#F06400' },
  { bg: '#E8F1FF', color: '#245BDB' },
  { bg: '#FFF6E0', color: '#C8881A' },
  { bg: '#E8F8F0', color: '#1F9D6A' },
  { bg: '#F3EEFF', color: '#6B5BD0' },
]

function toneOf(item, idx) {
  return item.tone != null ? TONES[item.tone] : TONES[idx % TONES.length]
}
function iconBg(item) {
  const idx = items.value.indexOf(item)
  return { background: (toneOf(item, idx) || {}).bg || '#F4F6F8' }
}
function iconColor(item) {
  const idx = items.value.indexOf(item)
  return (toneOf(item, idx) || {}).color || '#F06400'
}
function iconStroke(item) {
  return '#121826'
}

function badge(item) {
  return (item.linkKey === 'lottery' || (item.id || '').includes('lottery')) && session.user.lotteryChance > 0
}
</script>

<style scoped>
.grid {
  display: flex;
  justify-content: space-between;
  padding: 0 4rpx;
}
.item {
  width: 140rpx;
  text-align: center;
}
.ico-wrap {
  position: relative;
  width: 112rpx;
  height: 112rpx;
  margin: 0 auto 8rpx;
  border-radius: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ico {
  width: 112rpx;
  height: 112rpx;
}
.dot {
  position: absolute;
  top: -6rpx;
  right: -6rpx;
  min-width: 32rpx;
  height: 32rpx;
  padding: 0 8rpx;
  border-radius: 999rpx;
  background: #e0494f;
  border: 2rpx solid #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dot-num {
  font-size: 20rpx;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}
.name {
  font-size: 22rpx;
  font-weight: 600;
  color: #121826;
  line-height: 1.2;
}
.item:active .ico-wrap {
  transform: scale(0.96);
}
</style>

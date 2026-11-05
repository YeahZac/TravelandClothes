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

// 4 金刚按位置轮换柔色块（cream-friendly 低彩度）
const TONES = [
  { bg: '#F6E0E1', color: '#DB8A8F' }, // rose
  { bg: '#F3E8D4', color: '#C9A36B' }, // gold
  { bg: '#E8EFE2', color: '#7DA07A' }, // mint
  { bg: '#ECE6F3', color: '#8474A8' }, // lavender
  { bg: '#F6E0E1', color: '#DB8A8F' }, // rose (wrap)
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
  padding: 8rpx 4rpx 4rpx;
}
.item {
  width: 140rpx;
  text-align: center;
}
.ico-wrap {
  position: relative;
  width: 120rpx;
  height: 120rpx;
  margin: 0 auto 14rpx;
  border-radius: var(--radius-icon);
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
  min-width: 36rpx;
  height: 36rpx;
  padding: 0 10rpx;
  border-radius: var(--radius-pill);
  background: var(--warn);
  border: 2rpx solid var(--paper-2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.dot-num {
  font-size: 20rpx;
  font-weight: 700;
  color: var(--paper-2);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.name {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.2;
}
.item:active .ico-wrap {
  transform: scale(0.96);
}
</style>

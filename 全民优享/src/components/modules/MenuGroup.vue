<template>
  <view class="box">
    <view
      v-for="(item, idx) in items"
      :key="item.id"
      class="row"
      :class="{ last: idx === items.length - 1 }"
      @click="openLink(item.path ? item : item.linkKey || item.link || item)"
    >
      <view class="lead">
        <view class="ico-wrap" :style="iconBg(item, idx)">
          <image
            v-if="resolveIcon(item)"
            class="ico-fallback"
            :src="resolveIcon(item)"
            mode="aspectFit"
          />
          <VIcon
            v-else
            :name="item.iconKey || 'coin'"
            :size="40"
            :color="iconColor(item, idx)"
            :stroke="iconStroke(item)"
          />
        </view>
        <view class="txt">
          <text class="t">{{ item.title }}</text>
          <text v-if="item.sub" class="sub">{{ item.sub }}</text>
        </view>
      </view>
      <view class="trail">
        <text v-if="item.badge" class="badge">{{ item.badge }}</text>
        <view class="chev">
          <VIcon name="arrow" :size="28" color="#9AA3B2" stroke="#9AA3B2" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { openLink } from '../../utils/navigate.js'
import { resolveIconSrc } from '../../utils/resolveMedia.js'
import VIcon from '../VIcon.vue'

const props = defineProps({ mod: Object })
const items = computed(() => (props.mod.payload && props.mod.payload.items) || [])

function resolveIcon(item) {
  return resolveIconSrc(item)
}

// 每行图标背景色按 tone 轮换（cream-friendly 性别中立）
const TONES = [
  { bg: '#E8EFE2', color: '#7FA67A' }, // sage
  { bg: '#ECE6F3', color: '#9B8FBF' }, // lavender
  { bg: '#F3E8D4', color: '#C9A36B' }, // gold
  { bg: '#F4EDE6', color: '#6E6258' }, // ink soft
  { bg: '#E8EFE2', color: '#7FA67A' }, // sage (wrap)
  { bg: '#F3E8D4', color: '#C9A36B' }, // gold (wrap)
]

function iconBg(item, idx) {
  const t = item.tone != null ? TONES[item.tone] : TONES[idx % TONES.length]
  return { background: (t && t.bg) || '#F4F6F8' }
}
function iconColor(item, idx) {
  const t = item.tone != null ? TONES[item.tone] : TONES[idx % TONES.length]
  return (t && t.color) || '#6E6258'
}
function iconStroke(item) {
  return '#121826'
}
</script>

<style scoped>
.box {
  background: var(--paper-2);
  border-radius: var(--radius-card);
  padding: 4rpx var(--card-pad);
  box-shadow: var(--shadow);
  border: 1rpx solid var(--line-soft);
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 124rpx;
  border-bottom: 1rpx solid var(--line-soft);
}
.row.last {
  border-bottom: none;
}
.lead {
  display: flex;
  align-items: center;
  gap: 24rpx;
  min-width: 0;
  flex: 1;
}
.ico-wrap {
  width: 80rpx;
  height: 80rpx;
  border-radius: var(--radius-icon);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ico-fallback {
  width: 44rpx;
  height: 44rpx;
}
.txt {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.t {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.2;
}
.sub {
  margin-top: 6rpx;
  font-size: 22rpx;
  font-weight: 400;
  color: var(--ink-3, #9a948c);
  line-height: 1.2;
}
.trail {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}
.badge {
  font-size: 20rpx;
  color: var(--sage-deep);
  background: var(--sage-soft);
  padding: 6rpx 14rpx;
  border-radius: var(--radius-pill);
  font-weight: 600;
}
.chev {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32rpx;
  height: 32rpx;
}
</style>

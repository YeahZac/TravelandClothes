<template>
  <view class="box">
    <view
      v-for="(item, idx) in items"
      :key="item.id"
      class="row"
      :class="{ last: idx === items.length - 1 }"
      @click="openLink(item.linkKey || item.link)"
    >
      <view class="lead">
        <view class="ico-wrap" :style="iconBg(item, idx)">
          <VIcon
            v-if="item.iconKey || item.iconUrl"
            :name="item.iconKey || 'coin'"
            :size="40"
            :color="iconColor(item, idx)"
            :stroke="iconStroke(item)"
          />
          <image
            v-else
            class="ico-fallback"
            src="/static/ui/ico-coin.png"
            mode="aspectFit"
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
import VIcon from '../VIcon.vue'

const props = defineProps({ mod: Object })
const items = computed(() => (props.mod.payload && props.mod.payload.items) || [])

// 每行图标背景色按 tone 轮换，柔化品牌色
const TONES = [
  { bg: '#FFF1E6', color: '#F06400' }, // orange
  { bg: '#E8F1FF', color: '#245BDB' }, // blue
  { bg: '#FFF6E0', color: '#C8881A' }, // gold
  { bg: '#E8F8F0', color: '#1F9D6A' }, // mint
  { bg: '#F3EEFF', color: '#6B5BD0' }, // violet
  { bg: '#FFE9E9', color: '#E0494F' }, // red
]

function iconBg(item, idx) {
  const t = item.tone != null ? TONES[item.tone] : TONES[idx % TONES.length]
  return { background: (t && t.bg) || '#F4F6F8' }
}
function iconColor(item, idx) {
  const t = item.tone != null ? TONES[item.tone] : TONES[idx % TONES.length]
  return (t && t.color) || '#F06400'
}
function iconStroke(item) {
  return '#121826'
}
</script>

<style scoped>
.box {
  background: #fff;
  border-radius: 24rpx;
  padding: 0 32rpx;
  box-shadow: 0 8rpx 24rpx rgba(18, 24, 38, 0.06);
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 112rpx;
  border-bottom: 1rpx solid #eef0f4;
}
.row.last {
  border-bottom: none;
}
.lead {
  display: flex;
  align-items: center;
  gap: 20rpx;
  min-width: 0;
  flex: 1;
}
.ico-wrap {
  width: 72rpx;
  height: 72rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ico-fallback {
  width: 40rpx;
  height: 40rpx;
}
.txt {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.t {
  font-size: 30rpx;
  font-weight: 600;
  color: #121826;
  line-height: 1.2;
}
.sub {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #5e6977;
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
  color: #f06400;
  background: #fff1e6;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
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

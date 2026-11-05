<template>
  <view class="bar" @click="openLink(mod.payload && (mod.payload.linkKey || mod.payload.link))">
    <view class="left">
      <text class="tag">{{ (mod.payload && mod.payload.tag) || '晚场' }}</text>
      <view class="copy">
        <text class="title">{{ shortTitle }}</text>
        <text class="range">{{ mod.payload && mod.payload.rangeText }}</text>
      </view>
    </view>
    <view class="right">
      <text class="cd yx-num">{{ mod.payload && mod.payload.countdown }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { openLink } from '../../utils/navigate.js'
const props = defineProps({ mod: Object })
const shortTitle = computed(() => {
  const t = props.mod.title || '限时开兑'
  return t.length > 8 ? '限时开兑' : t
})
</script>

<style scoped>
.bar {
  height: 96rpx;
  padding: 0 28rpx;
  border-radius: 20rpx;
  background: #121826;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.left {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-width: 0;
}
.tag {
  flex-shrink: 0;
  font-size: 20rpx;
  font-weight: 500;
  color: #f5b942;
}
.copy {
  min-width: 0;
}
.title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #fff;
  line-height: 1.2;
}
.range {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.7);
}
.cd {
  font-size: 28rpx;
  font-weight: 700;
  color: #f5b942;
  font-variant-numeric: tabular-nums;
}
</style>

/* Hallmark · genre: playful · macrostructure: app-shell · theme: cream-rose · designed-as-app */
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
  min-height: 112rpx;
  padding: 24rpx 32rpx;
  border-radius: var(--radius-card);
  background: var(--ink);
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: var(--shadow);
}
.left {
  display: flex;
  align-items: center;
  gap: 18rpx;
  min-width: 0;
}
.tag {
  flex-shrink: 0;
  font-size: 20rpx;
  font-weight: 600;
  color: var(--gold);
  padding: 6rpx 14rpx;
  border-radius: var(--radius-pill);
  background: rgba(201, 163, 107, 0.18);
  letter-spacing: 0.5rpx;
}
.copy {
  min-width: 0;
}
.title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--paper-2);
  line-height: 1.2;
}
.range {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: rgba(251, 247, 243, 0.7);
}
.cd {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--gold);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5rpx;
}
</style>

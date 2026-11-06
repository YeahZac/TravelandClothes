<template>
  <view class="ring-wrap" :style="{ width: size + 'rpx', height: size + 'rpx' }">
    <image class="ring-img" :src="dataUri" mode="aspectFit" :style="{ width: size + 'rpx', height: size + 'rpx' }" />
    <view class="ring-inner">
      <text class="ring-pct yx-num" :style="{ fontSize: numSize + 'rpx' }">{{ pct }}%</text>
      <text class="ring-cap" v-if="cap">{{ cap }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  pct: { type: Number, default: 0 },
  size: { type: Number, default: 140 },
  stroke: { type: Number, default: 10 },
  color: { type: String, default: '#7FA67A' },
  track: { type: String, default: '#EAE0D5' },
  numSize: { type: Number, default: 34 },
  cap: { type: String, default: '养成进度' },
})

const dataUri = computed(() => {
  const r = 50 - props.stroke / 2
  const c = 2 * Math.PI * r
  const offset = c - (Math.max(0, Math.min(100, props.pct)) / 100) * c
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="${props.track}" stroke-width="${props.stroke}"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="${props.color}" stroke-width="${props.stroke}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"
      transform="rotate(-90 50 50)"/>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
})
</script>

<style scoped>
.ring-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ring-img {
  position: absolute;
  inset: 0;
  display: block;
}
.ring-inner {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1;
}
.ring-pct {
  font-weight: 800;
  color: #5a8055;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.ring-cap {
  margin-top: 4rpx;
  font-size: 18rpx;
  color: #5e6977;
}
</style>

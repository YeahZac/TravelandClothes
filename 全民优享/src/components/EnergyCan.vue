<template>
  <view class="stage">
    <image
      v-for="b in bubbles"
      :key="b.id"
      class="coin"
      :src="coinSrc"
      :style="{ left: b.left, top: b.top, animationDelay: b.delay, width: b.w, height: b.w }"
      mode="aspectFit"
    />
    <image class="battery" :src="batterySrc" mode="aspectFit" />
    <view class="readout">
      <text class="pct">{{ percent }}%</text>
      <text class="sub">能量进度</text>
    </view>
    <view v-if="hint" class="hint">{{ hint }}</view>
  </view>
</template>

<script setup>
defineProps({
  percent: { type: Number, default: 0 },
  hint: { type: String, default: '' },
})

const coinSrc = '/static/ui/coin.png'
const batterySrc = '/static/ui/battery.png'
const bubbles = [
  { id: 1, left: '6%', top: '8%', delay: '0s', w: '72rpx' },
  { id: 2, left: '78%', top: '4%', delay: '0.5s', w: '88rpx' },
  { id: 3, left: '82%', top: '42%', delay: '1s', w: '64rpx' },
]
</script>

<style scoped lang="scss">
.stage {
  position: relative;
  height: 460rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.battery {
  width: 280rpx;
  height: 280rpx;
  position: relative;
  z-index: 1;
  animation: bob 3s ease-in-out infinite;
  filter: drop-shadow(0 18rpx 28rpx rgba(45, 107, 255, 0.35));
}

@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-12rpx);
  }
}

.coin {
  position: absolute;
  z-index: 2;
  animation: float 2.6s ease-in-out infinite;
  filter: drop-shadow(0 8rpx 12rpx rgba(255, 122, 0, 0.35));
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0) rotate(-6deg);
  }
  50% {
    transform: translateY(-16rpx) rotate(6deg);
  }
}

.readout {
  margin-top: -28rpx;
  text-align: center;
  position: relative;
  z-index: 2;
}

.pct {
  display: block;
  font-size: 48rpx;
  font-weight: 800;
  color: #1a2233;
  letter-spacing: -1rpx;
}

.sub {
  display: block;
  margin-top: 2rpx;
  font-size: 22rpx;
  color: #6b7a94;
  font-weight: 600;
}

.hint {
  margin-top: 12rpx;
  padding: 8rpx 22rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.75);
  color: #ff6a00;
  font-size: 22rpx;
  font-weight: 700;
  box-shadow: 0 6rpx 16rpx rgba(45, 107, 255, 0.12);
}
</style>

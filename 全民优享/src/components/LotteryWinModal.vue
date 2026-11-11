<template>
  <view v-if="show" class="mask" @click="onClose">
    <view class="panel" @click.stop>
      <view class="title-wrap">
        <text class="title">恭喜获得</text>
        <text class="sub">奖品已入账 · 可前往兑换</text>
      </view>

      <view class="box-stage">
        <view class="glow" />
        <view class="rays" />
        <image class="box-bg" src="/static/ui/lottery/win-box.png" mode="aspectFit" />
        <view class="prize-float">
          <view class="prize-card">
            <CmsImage
              class="prize-img"
              :src="imageUrl || ''"
              mode="aspectFill"
              placeholder="/static/ui/ico-gift.png"
              :show-placeholder="true"
            />
          </view>
          <text class="prize-name">{{ name || '神秘奖品' }}</text>
        </view>
      </view>

      <view class="actions">
        <button class="ghost" @click="onClose">继续抽奖</button>
        <button v-if="canRedeem" class="primary" @click="onRedeem">去兑换</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import CmsImage from './CmsImage.vue'

defineProps({
  show: { type: Boolean, default: false },
  name: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  canRedeem: { type: Boolean, default: true },
})

const emit = defineEmits(['close', 'redeem'])

function onClose() {
  emit('close')
}
function onRedeem() {
  emit('redeem')
}
</script>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}
.panel {
  width: 680rpx;
  text-align: center;
}
.title-wrap {
  margin-bottom: 8rpx;
}
.title {
  display: block;
  font-size: 48rpx;
  font-weight: 900;
  letter-spacing: 4rpx;
  color: #fff7ed;
  text-shadow: 0 0 24rpx rgba(251, 113, 133, 0.65);
}
.sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: rgba(255, 247, 237, 0.72);
}
.box-stage {
  position: relative;
  width: 600rpx;
  height: 600rpx;
  margin: 0 auto;
}
.glow {
  position: absolute;
  left: 50%;
  top: 58%;
  width: 360rpx;
  height: 160rpx;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(255, 255, 255, 0.55), transparent 70%);
  animation: pulse 1.8s ease-in-out infinite;
  pointer-events: none;
}
.rays {
  position: absolute;
  left: 50%;
  top: 42%;
  width: 520rpx;
  height: 520rpx;
  transform: translate(-50%, -50%);
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    rgba(251, 113, 133, 0.18) 12deg,
    transparent 24deg,
    transparent 40deg,
    rgba(251, 191, 36, 0.16) 52deg,
    transparent 64deg
  );
  border-radius: 50%;
  animation: spinRays 8s linear infinite;
  opacity: 0.85;
  pointer-events: none;
}
.box-bg {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: block;
}
.prize-float {
  position: absolute;
  left: 50%;
  top: 28%;
  z-index: 2;
  transform: translateX(-50%);
  width: 280rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  animation: floatPrize 2.4s ease-in-out infinite;
}
.prize-card {
  width: 176rpx;
  height: 176rpx;
  border-radius: 28rpx;
  padding: 8rpx;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(255, 241, 242, 0.92));
  box-shadow:
    0 16rpx 36rpx rgba(190, 18, 60, 0.42),
    0 0 0 4rpx rgba(255, 255, 255, 0.55);
  overflow: hidden;
}
.prize-img {
  width: 100%;
  height: 100%;
  border-radius: 22rpx;
  overflow: hidden;
  background: #fff;
}
.prize-name {
  max-width: 320rpx;
  padding: 10rpx 22rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.95);
  color: #be123c;
  font-size: 26rpx;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-shadow: 0 8rpx 20rpx rgba(0, 0, 0, 0.25);
}
.actions {
  margin-top: 12rpx;
  display: flex;
  gap: 20rpx;
  justify-content: center;
}
.ghost,
.primary {
  margin: 0;
  min-width: 260rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 999rpx;
  font-size: 30rpx;
  font-weight: 800;
  border: none;
}
.ghost {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  border: 2rpx solid rgba(255, 255, 255, 0.35);
  line-height: 84rpx;
}
.primary {
  background: linear-gradient(90deg, #fb7185, #e11d48);
  color: #fff;
  box-shadow: 0 12rpx 28rpx rgba(225, 29, 72, 0.45);
}
.ghost::after,
.primary::after {
  border: none;
}
@keyframes floatPrize {
  0%,
  100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(-12rpx);
  }
}
@keyframes pulse {
  0%,
  100% {
    opacity: 0.55;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 0.95;
    transform: translate(-50%, -50%) scale(1.08);
  }
}
@keyframes spinRays {
  from {
    transform: translate(-50%, -50%) rotate(0deg);
  }
  to {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}
</style>

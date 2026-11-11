<template>
  <view v-if="show" class="mask" @click="onClose">
    <view class="panel" @click.stop>
      <view class="box-stage">
        <image class="box-bg" src="/static/ui/lottery/win-box.png" mode="aspectFit" />
        <view class="prize-float">
          <CmsImage
            class="prize-img"
            :src="imageUrl || ''"
            mode="aspectFill"
            placeholder="/static/ui/ico-gift.png"
            :show-placeholder="true"
          />
          <text class="prize-name">{{ name || '神秘奖品' }}</text>
        </view>
      </view>
      <text class="hint">{{ canRedeem ? '恭喜获得 · 可去兑换填写地址领取' : '奖励已到账 · 可继续抽奖' }}</text>
      <view class="actions">
        <button class="ghost" :class="{ alone: !canRedeem }" @click="onClose">继续抽奖</button>
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
  background: rgba(0, 0, 0, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}
.panel {
  width: 640rpx;
  text-align: center;
}
.box-stage {
  position: relative;
  width: 560rpx;
  height: 560rpx;
  margin: 0 auto;
}
.box-bg {
  width: 100%;
  height: 100%;
  display: block;
}
.prize-float {
  position: absolute;
  left: 50%;
  top: 18%;
  transform: translateX(-50%);
  width: 220rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}
.prize-img {
  width: 148rpx;
  height: 148rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12rpx 28rpx rgba(190, 18, 60, 0.35);
  overflow: hidden;
}
.prize-name {
  max-width: 280rpx;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.92);
  color: #be123c;
  font-size: 24rpx;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hint {
  display: block;
  margin-top: 8rpx;
  color: rgba(255, 255, 255, 0.82);
  font-size: 24rpx;
}
.actions {
  margin-top: 28rpx;
  display: flex;
  gap: 20rpx;
  justify-content: center;
}
.ghost,
.primary {
  margin: 0;
  min-width: 240rpx;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 800;
  border: none;
}
.ghost {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}
.ghost.alone {
  min-width: 360rpx;
}
.primary {
  background: linear-gradient(90deg, #fb7185, #e11d48);
  color: #fff;
}
.ghost::after,
.primary::after {
  border: none;
}
</style>

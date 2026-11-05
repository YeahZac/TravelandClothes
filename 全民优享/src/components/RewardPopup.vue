<template>
  <view v-if="session.popup" class="mask" @click="onMask">
    <view class="panel" @click.stop>
      <image class="hero" src="/static/ui/ico-coin.png" mode="aspectFit" />
      <text class="title">{{ session.popup.title }}</text>
      <view class="amount-row">
        <text class="amount yx-num">{{ amountMain }}</text>
        <text v-if="amountUnit" class="unit">{{ amountUnit }}</text>
      </view>
      <text class="tip">{{ session.popup.tip }}</text>
      <button class="ok" @click="close">{{ cta }}</button>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { session, hidePopup } from '../store/session.js'

const amountMain = computed(() => {
  const a = (session.popup && session.popup.amount) || ''
  return String(a).replace(/(能量|积分|次)$/, '') || a
})
const amountUnit = computed(() => {
  const a = String((session.popup && session.popup.amount) || '')
  if (a.includes('能量')) return '能量'
  if (a.includes('积分')) return '积分'
  if (a.includes('次')) return '次'
  return ''
})
const cta = computed(() => {
  if (session.popup && session.popup.type === 'ticket') return '知道了'
  return '收下能量'
})

function close() {
  hidePopup()
}
function onMask() {
  if (session.popup && session.popup.type === 'reward') return
  close()
}
</script>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(10, 16, 32, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
}
.panel {
  position: relative;
  width: 600rpx;
  background: #fff;
  border-radius: 32rpx;
  padding: 120rpx 40rpx 40rpx;
  text-align: center;
}
.hero {
  position: absolute;
  left: 50%;
  top: -48rpx;
  width: 200rpx;
  height: 200rpx;
  margin-left: -100rpx;
}
.title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: #121826;
}
.amount-row {
  margin-top: 16rpx;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 8rpx;
}
.amount {
  font-size: 64rpx;
  font-weight: 700;
  color: #e25a00;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.unit {
  font-size: 24rpx;
  color: #5e6977;
  margin-bottom: 10rpx;
}
.tip {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #5e6977;
}
.ok {
  margin-top: 32rpx;
  width: 100%;
  height: 80rpx;
  border: none;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #ff8a2a, #f06400);
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
  box-shadow: 0 6rpx 0 #c44800;
}
.ok::after {
  border: none;
}
</style>

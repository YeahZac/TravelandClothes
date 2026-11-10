/* Hallmark · genre: playful · macrostructure: app-shell · theme: cream-amber-sage · designed-as-app */
<template>
  <view v-if="session.popup" class="mask" @click="onMask">
    <view class="panel" @click.stop>
      <view class="hero-ico">
        <VIcon name="coin" :size="96" color="#C9A36B" />
      </view>
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
import VIcon from './VIcon.vue'

const amountMain = computed(() => {
  const a = (session.popup && session.popup.amount) || ''
  return String(a).replace(/(能量值|能量|积分|次)$/, '') || a
})
const amountUnit = computed(() => {
  const a = String((session.popup && session.popup.amount) || '')
  if (a.includes('能量值') || a.includes('能量')) return '能量值'
  if (a.includes('积分')) return '能量值'
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
  background: rgba(43, 37, 32, 0.56);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
}
.panel {
  position: relative;
  width: 600rpx;
  background: var(--paper-2);
  border-radius: var(--radius-card-lg);
  padding: 132rpx 40rpx 40rpx;
  text-align: center;
  box-shadow: var(--shadow-stage);
  border: 1rpx solid var(--line-soft);
}
.hero-ico {
  position: absolute;
  left: 50%;
  top: -56rpx;
  width: 160rpx;
  height: 160rpx;
  margin-left: -80rpx;
  background: var(--gold-soft);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 6rpx solid var(--paper-2);
  box-shadow: var(--shadow-soft);
}
.title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--ink);
}
.amount-row {
  margin-top: 16rpx;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 8rpx;
}
.amount {
  font-size: 68rpx;
  font-weight: 800;
  color: var(--accent-deep);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -1rpx;
}
.unit {
  font-size: 24rpx;
  color: var(--ink-3);
  margin-bottom: 12rpx;
}
.tip {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: var(--ink-2);
}
.ok {
  margin-top: 36rpx;
  width: 100%;
  height: 88rpx;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--ink-on-accent);
  font-size: 30rpx;
  font-weight: 600;
  line-height: 88rpx;
}
.ok::after {
  border: none;
}
.ok:active {
  background: var(--accent-deep);
  transform: scale(0.98);
}
</style>

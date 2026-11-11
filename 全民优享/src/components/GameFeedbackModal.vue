<template>
  <view v-if="visible" class="mask" :style="{ opacity: maskOpacity }" @click="onMask">
    <view class="card" @click.stop>
      <view class="ribbon-wrap">
        <view class="confetti c1" />
        <view class="confetti c2" />
        <view class="confetti c3" />
        <view class="ribbon">
          <text class="ribbon-t">{{ title }}</text>
        </view>
      </view>

      <image
        v-if="variant === 'checkin'"
        class="hero-img"
        src="/static/ui/lottery/checkin-ok.png"
        mode="aspectFit"
      />
      <view v-else class="face">🙂</view>

      <text class="msg">{{ message }}</text>
      <text v-if="subMessage" class="sub">{{ subMessage }}</text>

      <button v-if="primaryText" class="btn" @click="onPrimary">{{ primaryText }}</button>
    </view>
    <view v-if="showClose" class="x" @click.stop="emitClose">✕</view>
  </view>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '未中奖' },
  message: { type: String, default: '' },
  subMessage: { type: String, default: '' },
  primaryText: { type: String, default: '' },
  /** lose | fail | checkin */
  variant: { type: String, default: 'lose' },
  showClose: { type: Boolean, default: true },
  /** >0 时自动淡出关闭（毫秒） */
  autoHideMs: { type: Number, default: 0 },
})

const emit = defineEmits(['close', 'primary', 'update:show'])

const visible = ref(false)
const maskOpacity = ref(1)
let hideTimer = null
let fadeTimer = null

const showClose = computed(() => props.showClose && props.autoHideMs <= 0)

watch(
  () => props.show,
  (v) => {
    clearTimers()
    if (v) {
      visible.value = true
      maskOpacity.value = 1
      if (props.autoHideMs > 0) {
        const fadeStart = Math.max(200, props.autoHideMs - 600)
        fadeTimer = setTimeout(() => {
          maskOpacity.value = 0
        }, fadeStart)
        hideTimer = setTimeout(() => {
          emitClose()
        }, props.autoHideMs)
      }
    } else if (visible.value) {
      maskOpacity.value = 0
      setTimeout(() => {
        visible.value = false
      }, 280)
    }
  },
  { immediate: true }
)

function clearTimers() {
  if (hideTimer) clearTimeout(hideTimer)
  if (fadeTimer) clearTimeout(fadeTimer)
  hideTimer = null
  fadeTimer = null
}

function emitClose() {
  clearTimers()
  maskOpacity.value = 0
  setTimeout(() => {
    visible.value = false
    emit('update:show', false)
    emit('close')
  }, 220)
}

function onPrimary() {
  emit('primary')
  emitClose()
}

function onMask() {
  if (props.autoHideMs > 0) return
  if (props.showClose) emitClose()
}

onUnmounted(clearTimers)
</script>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
  transition: opacity 0.55s ease;
}
.card {
  position: relative;
  width: 560rpx;
  background: #fff;
  border-radius: 28rpx;
  padding: 72rpx 40rpx 40rpx;
  text-align: center;
  box-shadow: 0 24rpx 60rpx rgba(0, 0, 0, 0.28);
}
.ribbon-wrap {
  position: absolute;
  left: 50%;
  top: -36rpx;
  transform: translateX(-50%);
  width: 360rpx;
  height: 72rpx;
}
.ribbon {
  height: 64rpx;
  background: linear-gradient(180deg, #ff6b6b, #e11d48);
  clip-path: polygon(8% 0, 92% 0, 100% 50%, 92% 100%, 8% 100%, 0 50%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 16rpx rgba(225, 29, 72, 0.35);
}
.ribbon-t {
  color: #fff;
  font-size: 32rpx;
  font-weight: 800;
  letter-spacing: 2rpx;
}
.confetti {
  position: absolute;
  width: 10rpx;
  height: 28rpx;
  border-radius: 4rpx;
  top: -8rpx;
}
.c1 {
  left: 40rpx;
  background: #fbbf24;
  transform: rotate(-28deg);
}
.c2 {
  right: 48rpx;
  background: #fb7185;
  transform: rotate(22deg);
}
.c3 {
  left: 50%;
  top: -18rpx;
  background: #34d399;
  transform: translateX(-50%) rotate(8deg);
}
.face {
  margin: 24rpx auto 8rpx;
  width: 120rpx;
  height: 120rpx;
  line-height: 120rpx;
  font-size: 88rpx;
}
.hero-img {
  width: 280rpx;
  height: 280rpx;
  margin: 8rpx auto 0;
  display: block;
}
.msg {
  display: block;
  margin-top: 8rpx;
  font-size: 28rpx;
  font-weight: 700;
  color: #111827;
  line-height: 1.45;
}
.sub {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #6b7280;
}
.btn {
  margin-top: 36rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 20rpx;
  background: linear-gradient(180deg, #ff6b6b, #e11d48);
  color: #fff;
  font-size: 30rpx;
  font-weight: 800;
  border: none;
  box-shadow: 0 10rpx 20rpx rgba(225, 29, 72, 0.28);
}
.btn::after {
  border: none;
}
.x {
  margin-top: 36rpx;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  border: 3rpx solid rgba(255, 255, 255, 0.85);
  color: #fff;
  font-size: 28rpx;
  line-height: 58rpx;
  text-align: center;
}
</style>

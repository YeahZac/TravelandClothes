<template>
  <view class="strip">
    <view class="head">
      <text class="title">{{ mod.title || '连续签到' }}</text>
      <text class="mute">{{ streakText }}</text>
    </view>
    <view class="days">
      <view
        v-for="r in rewards"
        :key="r.day"
        class="day"
        :class="{
          done: isDone(r.day),
          today: isToday(r.day),
        }"
      >
        <view class="ring">
          <image
            class="ico"
            :class="{ dim: !isDone(r.day) && !isToday(r.day) }"
            :src="r.day === 7 ? chestSrc : coinSrc"
            mode="aspectFit"
          />
        </view>
        <text class="lab">{{ r.label }}</text>
      </view>
    </view>
    <button
      class="cta"
      :class="{ done: session.checkin.todayDone }"
      @click="onTap"
    >
      {{ ctaLabel }}
    </button>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { session, doCheckin } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'

const props = defineProps({ mod: Object })
const rewards = computed(() => (props.mod.payload && props.mod.payload.rewards) || [])
const coinSrc = computed(
  () =>
    (props.mod.payload && props.mod.payload.coinUrl) ||
    appConfig.assets.coin ||
    '/static/ui/ico-coin.png'
)
const chestSrc = computed(
  () =>
    (props.mod.payload && props.mod.payload.chestUrl) ||
    appConfig.assets.chest ||
    '/static/ui/ico-chest.png'
)

const streakText = computed(() => {
  const tpl = (props.mod.payload && props.mod.payload.streakLabel) || '已连签 {streak} 天'
  return tpl.replace('{streak}', String(session.checkin.streak))
})

const todayReward = computed(() => {
  const r = rewards.value.find((x) => x.day === session.checkin.dayIndex)
  return r ? r.label : ''
})

const ctaLabel = computed(() => {
  if (session.checkin.todayDone) {
    return (props.mod.payload && props.mod.payload.ctaDone) || '已签到 · 明天再来'
  }
  const base = (props.mod.payload && props.mod.payload.ctaTodo) || '签到'
  return todayReward.value ? `${base} ${todayReward.value}` : base
})

function isDone(day) {
  return day < session.checkin.dayIndex || (day === session.checkin.dayIndex && session.checkin.todayDone)
}
function isToday(day) {
  return day === session.checkin.dayIndex && !session.checkin.todayDone
}
function onTap() {
  if (session.checkin.todayDone) return
  doCheckin()
}
</script>

<style scoped>
.strip {
  background: #fff;
  border-radius: 24rpx;
  padding: 32rpx;
  box-shadow: 0 8rpx 24rpx rgba(18, 24, 38, 0.06);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 24rpx;
}
.title {
  font-size: 32rpx;
  font-weight: 600;
  color: #121826;
  line-height: 1.25;
}
.mute {
  font-size: 22rpx;
  font-weight: 400;
  color: #5e6977;
}
.days {
  display: flex;
  justify-content: space-between;
  margin-bottom: 24rpx;
}
.day {
  width: 84rpx;
  text-align: center;
}
.ring {
  width: 80rpx;
  height: 80rpx;
  margin: 0 auto 8rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.day.today .ring {
  box-shadow: 0 0 0 4rpx #245bdb;
}
.ico {
  width: 72rpx;
  height: 72rpx;
}
.ico.dim {
  opacity: 0.4;
}
.day:nth-child(7) .ico {
  width: 80rpx;
  height: 80rpx;
}
.lab {
  display: block;
  font-size: 20rpx;
  font-weight: 500;
  color: #5e6977;
  font-variant-numeric: tabular-nums;
}
.day.done .lab {
  color: #c8880a;
}
.cta {
  width: 100%;
  height: 80rpx;
  border-radius: 999rpx;
  border: none;
  background: linear-gradient(180deg, #ff8a2a, #f06400);
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
  box-shadow: 0 6rpx 0 #c44800;
  line-height: 80rpx;
}
.cta::after {
  border: none;
}
.cta:active {
  transform: scale(0.98);
}
.cta.done {
  background: #fff;
  color: #5e6977;
  border: 2rpx solid #e6e8ee;
  box-shadow: none;
  line-height: 76rpx;
}
</style>

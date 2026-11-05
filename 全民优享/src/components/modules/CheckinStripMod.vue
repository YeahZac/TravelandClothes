/* Hallmark · genre: playful · macrostructure: app-shell · theme: cream-rose · designed-as-app */
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
          <VIcon
            class="ico"
            :class="{ dim: !isDone(r.day) && !isToday(r.day) }"
            :name="r.day === 7 ? 'chest' : 'coin'"
            :size="r.day === 7 ? 56 : 52"
            :color="r.day === 7 ? '#C9A36B' : '#E5A23E'"
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
import VIcon from '../VIcon.vue'

const props = defineProps({ mod: Object })
const rewards = computed(() => (props.mod.payload && props.mod.payload.rewards) || [])

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
  background: var(--paper-2);
  border-radius: var(--radius-card);
  padding: var(--card-pad-y) var(--card-pad);
  box-shadow: var(--shadow);
  border: 1rpx solid var(--line-soft);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 32rpx;
}
.title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.25;
}
.mute {
  font-size: 22rpx;
  font-weight: 400;
  color: var(--ink-3);
}
.days {
  display: flex;
  justify-content: space-between;
  margin-bottom: 36rpx;
}
.day {
  width: 84rpx;
  text-align: center;
}
.ring {
  width: 88rpx;
  height: 88rpx;
  margin: 0 auto 12rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--paper-3);
}
.day.done .ring {
  background: var(--gold-soft);
}
.day.today .ring {
  background: var(--accent-soft);
  box-shadow: 0 0 0 4rpx var(--accent);
}
.ico {
  display: block;
}
.ico.dim {
  opacity: 0.45;
}
.day:nth-child(7) .ico {
  /* chest slightly bigger, handled by :size prop */
}
.lab {
  display: block;
  font-size: 20rpx;
  font-weight: 500;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
.day.done .lab {
  color: var(--gold);
  font-weight: 600;
}
.day.today .lab {
  color: var(--accent-deep);
  font-weight: 700;
}
.cta {
  width: 100%;
  height: 88rpx;
  border-radius: var(--radius-pill);
  border: none;
  background: var(--accent);
  color: var(--ink-on-accent);
  font-size: 30rpx;
  font-weight: 600;
  line-height: 88rpx;
  letter-spacing: 0.5rpx;
}
.cta::after {
  border: none;
}
.cta:active {
  transform: scale(0.98);
  background: var(--accent-deep);
}
.cta.done {
  background: var(--paper-3);
  color: var(--ink-3);
  border: 1rpx solid var(--line);
  line-height: 86rpx;
}
</style>

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
          <CmsImage
            class="ico"
            :class="{ dim: !isDone(r.day) && !isToday(r.day) }"
            :src="iconFor(r)"
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
    <GameFeedbackModal
      v-model:show="okShow"
      title="签到成功"
      :message="okMessage"
      sub-message="奖励已到账"
      variant="checkin"
      :show-close="false"
      :auto-hide-ms="2000"
      primary-text=""
    />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { session, doCheckin } from '../../store/session.js'
import { USE_REMOTE, getToken } from '../../api/request.js'
import { apiCheckin } from '../../api/growth.js'
import { resolveIconSrc, resolveImageSrc } from '../../utils/resolveMedia.js'
import CmsImage from '../CmsImage.vue'
import GameFeedbackModal from '../GameFeedbackModal.vue'

const props = defineProps({ mod: Object })
const rewards = computed(() => (props.mod.payload && props.mod.payload.rewards) || [])
const payload = computed(() => props.mod.payload || {})
const okShow = ref(false)
const okMessage = ref('签到成功')

const streakText = computed(() => {
  const tpl = payload.value.streakLabel || '已连签 {streak} 天'
  return tpl.replace('{streak}', String(session.checkin.streak))
})

const todayReward = computed(() => {
  const r = rewards.value.find((x) => x.day === session.checkin.dayIndex)
  return r ? r.label : ''
})

const ctaLabel = computed(() => {
  if (session.checkin.todayDone) {
    return payload.value.ctaDone || '今日已签到'
  }
  const base = payload.value.ctaTodo || '签到'
  return todayReward.value ? `${base} ${todayReward.value}` : base
})

function iconFor(r) {
  const isChest = r.day === 7 || r.type === 'gift' || (r.label || '').includes('宝箱')
  const fromItem = resolveIconSrc(r)
  if (fromItem) return fromItem
  if (isChest) {
    return (
      resolveImageSrc(payload.value.chestUrl) ||
      resolveIconSrc({ iconKey: 'chest' }) ||
      '/static/ui/ico-chest.png'
    )
  }
  return (
    resolveImageSrc(payload.value.coinUrl) ||
    resolveIconSrc({ iconKey: 'coin' }) ||
    '/static/ui/ico-coin.png'
  )
}

function isDone(day) {
  return day < session.checkin.dayIndex || (day === session.checkin.dayIndex && session.checkin.todayDone)
}
function isToday(day) {
  return day === session.checkin.dayIndex && !session.checkin.todayDone
}
function applyCheckinResult(r) {
  if (!r) return
  session.checkin.todayDone = true
  if (r.streak != null) session.checkin.streak = r.streak
  if (r.dayIndex) session.checkin.dayIndex = r.dayIndex
  if (Array.isArray(r.rewards) && r.rewards.length) {
    session.checkin.rewards = r.rewards.map((x) => ({
      day: x.day,
      label: x.label,
      type: x.type || 'energy',
      value: Number(x.value != null ? x.value : x.amount) || 0,
      amount: Number(x.amount != null ? x.amount : x.value) || 0,
    }))
  }
  if (r.wallet) {
    session.user.energy = r.wallet.energy
    if (r.wallet.lotteryChance != null) session.user.lotteryChance = r.wallet.lotteryChance
  }
}

function showOk(msg) {
  okMessage.value = msg || `连签 ${session.checkin.streak || 1} 天`
  okShow.value = true
}

async function onTap() {
  if (session.checkin.todayDone) return
  if (USE_REMOTE && getToken()) {
    try {
      const r = await apiCheckin()
      applyCheckinResult(r)
      showOk(r.msg || `签到成功 · 连签 ${session.checkin.streak} 天`)
      return
    } catch (e) {
      uni.showToast({ title: e.message || '签到失败', icon: 'none' })
      return
    }
  }
  const r = doCheckin({ silent: true })
  showOk((r && r.msg) || `签到成功 · 连签 ${session.checkin.streak} 天`)
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
  margin-bottom: 28rpx;
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
  align-items: flex-start;
  gap: 8rpx;
  margin-bottom: 32rpx;
}
.day {
  flex: 1;
  min-width: 0;
  max-width: 72rpx;
  text-align: center;
}
.ring {
  width: 56rpx;
  height: 56rpx;
  margin: 0 auto 8rpx;
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
  background: var(--sage-soft);
  box-shadow: 0 0 0 3rpx var(--sage);
}
.ico {
  width: 32rpx;
  height: 32rpx;
  display: block;
}
.ico.dim {
  opacity: 0.4;
}
.lab {
  display: block;
  font-size: 18rpx;
  font-weight: 500;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.day.done .lab {
  color: var(--gold);
  font-weight: 600;
}
.day.today .lab {
  color: var(--sage-deep);
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

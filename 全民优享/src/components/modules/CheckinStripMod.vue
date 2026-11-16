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
        :key="'ck-d-' + r.day"
        class="day"
        :class="{
          done: isDone(r.day),
          today: isToday(r.day),
          gift: isGift(r),
        }"
      >
        <view class="ring">
          <CmsImage
            class="ico"
            :class="{ dim: !isDone(r.day) && !isToday(r.day), gift: isGift(r) }"
            :src="iconFor(r)"
            mode="aspectFit"
          />
        </view>
        <text class="lab">{{ displayLabel(r) }}</text>
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
import { isLoggedIn } from '../../api/auth.js'
import { requireAuth } from '../../utils/loginGate.js'
import { resolveIconSrc, resolveImageSrc } from '../../utils/resolveMedia.js'
import { appConfig } from '../../store/appConfig.js'
import CmsImage from '../CmsImage.vue'
import GameFeedbackModal from '../GameFeedbackModal.vue'

const props = defineProps({ mod: Object })
const payload = computed(() => props.mod.payload || {})
const okShow = ref(false)
const okMessage = ref('签到成功')
const authed = computed(() => isLoggedIn() || (!USE_REMOTE && !!session.user.loggedIn))

/** 首页模块 + game.rewards + session，类型/文案/礼品图对齐运营台 */
const rewards = computed(() => {
  const fromMod = (payload.value.rewards || []).slice()
  const fromGame =
    (appConfig.game && appConfig.game.rewards && appConfig.game.rewards.checkin) || []
  const fromSession = session.checkin.rewards || []
  const byDay = {}
  fromGame.forEach((x, i) => {
    const day = Number(x.day) || i + 1
    byDay[day] = { ...(byDay[day] || {}), ...x, day }
  })
  fromSession.forEach((x, i) => {
    const day = Number(x.day) || i + 1
    byDay[day] = { ...(byDay[day] || {}), ...x, day }
  })
  fromMod.forEach((x, i) => {
    const day = Number(x.day) || i + 1
    const base = byDay[day] || {}
    byDay[day] = {
      ...base,
      ...x,
      day,
      type: x.type || base.type || 'energy',
      label: x.label || base.label || '',
      amount: x.amount != null ? x.amount : base.amount,
      giftId: x.giftId || base.giftId || '',
      imageUrl: x.imageUrl || base.imageUrl || '',
      iconUrl: x.iconUrl || base.iconUrl || '',
    }
  })
  const days = Object.keys(byDay)
    .map(Number)
    .sort((a, b) => a - b)
  if (!days.length) return fromMod
  return days.map((d) => byDay[d])
})

const streakText = computed(() => {
  const streak = authed.value ? Number(session.checkin.streak) || 0 : 0
  const tpl = payload.value.streakLabel || '已连签 {streak} 天'
  return tpl.replace('{streak}', String(streak))
})

const todayReward = computed(() => {
  const r = rewards.value.find((x) => x.day === session.checkin.dayIndex)
  return r ? displayLabel(r) : ''
})

const ctaLabel = computed(() => {
  if (session.checkin.todayDone) {
    return payload.value.ctaDone || '今日已签到'
  }
  const base = payload.value.ctaTodo || '签到'
  return todayReward.value ? `${base} ${todayReward.value}` : base
})

function isGift(r) {
  return (r && r.type) === 'gift'
}

function displayLabel(r) {
  if (!r) return ''
  if (r.label) return r.label
  if (isGift(r)) return `礼物+${Number(r.amount) > 0 ? r.amount : 1}`
  const n = Number(r.amount != null ? r.amount : r.value) || 0
  return `能量+${n}`
}

function iconFor(r) {
  const fromItem = resolveIconSrc(r)
  if (fromItem) return fromItem
  if (isGift(r)) {
    const giftImg =
      resolveImageSrc(r.imageUrl) ||
      resolveImageSrc(r.coverUrl) ||
      resolveImageSrc(payload.value.chestUrl) ||
      resolveIconSrc({ iconKey: 'chest' })
    return giftImg || '/static/ui/ico-chest.png'
  }
  return (
    resolveImageSrc(payload.value.coinUrl) ||
    resolveIconSrc({ iconKey: 'coin' }) ||
    '/static/ui/ico-coin.png'
  )
}

function isDone(day) {
  if (!authed.value) return false
  return day < session.checkin.dayIndex || (day === session.checkin.dayIndex && session.checkin.todayDone)
}
function isToday(day) {
  if (!authed.value) return day === 1
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
      giftId: x.giftId || '',
      imageUrl: x.imageUrl || '',
      iconUrl: x.iconUrl || '',
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
  if (session.checkin.todayDone && authed.value) return
  if (USE_REMOTE) {
    if (!requireAuth()) return
    if (!getToken()) return
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
  if (!r || !r.ok) {
    uni.showToast({ title: (r && r.msg) || '请先登录', icon: 'none' })
    return
  }
  showOk(r.msg || `签到成功 · 连签 ${session.checkin.streak} 天`)
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
  margin-bottom: 24rpx;
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
  gap: 6rpx;
  margin-bottom: 28rpx;
}
.day {
  flex: 1;
  min-width: 0;
  max-width: 96rpx;
  text-align: center;
}
.ring {
  width: 72rpx;
  height: 72rpx;
  margin: 0 auto 10rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  overflow: visible;
}
.day.gift .ring {
  border-radius: 18rpx;
}
.day.done .ring {
  background: transparent;
}
.day.today .ring {
  background: transparent;
  box-shadow: none;
}
.ico {
  width: 56rpx;
  height: 56rpx;
  display: block;
  background: transparent;
}
.ico.gift {
  width: 64rpx;
  height: 64rpx;
  border-radius: 12rpx;
}
.ico.dim {
  opacity: 0.4;
}
.lab {
  display: block;
  font-size: 20rpx;
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

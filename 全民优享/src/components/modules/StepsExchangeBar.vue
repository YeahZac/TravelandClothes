<template>
  <view class="card">
    <view class="progress-track">
      <view class="progress-fill" :style="{ width: progressPct + '%' }" />
    </view>

    <view class="main">
      <view class="left" @click="onSync">
        <view class="steps-row">
          <text class="steps-n yx-num">{{ steps }}</text>
          <text class="steps-u">步</text>
        </view>
        <text class="tier">{{ tierLabel }}</text>
      </view>
      <button class="cta" :class="{ hist: cta === '领取历史' }" :loading="busy" @click="onCta">
        {{ cta }}
      </button>
    </view>

    <view class="week">
      <view v-for="d in week" :key="d.dayKey" class="day" :class="{ on: d.reached, claimed: d.claimed, today: d.isToday }">
        <view class="dot" />
        <text class="wd">{{ d.weekday }}</text>
      </view>
      <text class="hist-link" @click="goHistory">历史 ›</text>
    </view>

    <text v-if="hint" class="hint">{{ hint }}</text>
  </view>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { session } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { USE_REMOTE, getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { fetchStepsStatus, apiStepsSync, apiStepsClaim } from '../../api/growth.js'
import { getWeRunPayload, openWeRunSetting, platformHint } from '../../utils/werun.js'

defineProps({ mod: Object })

const busy = ref(false)
const state = reactive({
  steps: session.user.stepsToday || 0,
  claimableEnergy: 0,
  cta: '兑换',
  progressPct: 0,
  tierLabel: '目标 6000 步',
  primaryTierSteps: 6000,
  week: [],
  requireCheckin: true,
  checkedIn: false,
  todayClaimed: false,
  source: '',
  tip: '',
})

const steps = computed(() => state.steps || 0)
const progressPct = computed(() => Math.max(0, Math.min(100, Number(state.progressPct) || 0)))
const cta = computed(() => state.cta || '兑换')
const tierLabel = computed(() => state.tierLabel || `目标 ${state.primaryTierSteps || 6000} 步`)
const week = computed(() => state.week || [])
const hint = computed(() => {
  if (state.tip) return state.tip
  const src = String(state.source || '')
  if (src === 'werun' || src === 'werun_health') return '已同步微信运动（含健康步数）'
  if (src.includes('mock')) return '开发态模拟步数 · 真机请授权微信运动'
  return ''
})

function apply(r) {
  if (!r) return
  state.steps = r.steps || 0
  state.claimableEnergy = r.claimableEnergy || 0
  state.cta = r.cta || (r.claimableEnergy > 0 ? '领取' : r.todayClaimed ? '领取历史' : '兑换')
  state.progressPct = r.progressPct || 0
  state.tierLabel = r.tierLabel || ''
  state.primaryTierSteps = r.primaryTierSteps || 6000
  state.week = r.week || []
  state.requireCheckin = r.requireCheckin !== false
  state.checkedIn = !!r.checkedIn
  state.todayClaimed = !!r.todayClaimed
  state.source = r.source || state.source
  session.user.stepsToday = state.steps
  if (r.wallet && r.wallet.energy != null) session.user.energy = r.wallet.energy
}

async function refreshStatus() {
  if (!(USE_REMOTE && getToken())) {
    const cfg = (appConfig.game && appConfig.game.steps) || {}
    const tiers = cfg.tiers || [
      { steps: 3000, energy: 30 },
      { steps: 6000, energy: 80 },
      { steps: 10000, energy: 120 },
    ]
    const primary = cfg.primaryTierSteps || 6000
    const s = state.steps
    state.progressPct = Math.min(100, Math.round((s / primary) * 100))
    state.tierLabel = s >= primary ? `已达 ${primary} 档` : `目标 ${primary} 步`
    state.primaryTierSteps = primary
    const claimable = tiers.filter((t) => s >= t.steps).reduce((n, t) => n + t.energy, 0)
    state.claimableEnergy = claimable
    state.cta = claimable > 0 ? '领取' : state.todayClaimed ? '领取历史' : '兑换'
    const today = new Date()
    state.week = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() - (6 - i))
      return {
        dayKey: d.toISOString().slice(0, 10),
        weekday: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()],
        reached: i === 6 && s >= primary,
        claimed: false,
        isToday: i === 6,
      }
    })
    return
  }
  try {
    const r = await fetchStepsStatus()
    apply(r)
  } catch (e) {}
}

async function syncSteps() {
  const wr = await getWeRunPayload()
  state.tip = wr.tip || platformHint().tip || ''
  if (wr.needSetting) {
    uni.showModal({
      title: '需要步数权限',
      content: (wr.msg || '请开启微信运动') + (wr.isIOS ? '\n\niPhone：请在系统「健康」中允许微信读取步数，并打开微信运动同步。' : ''),
      confirmText: '去设置',
      success: async (res) => {
        if (res.confirm) {
          const s = await openWeRunSetting()
          if (s.ok) syncSteps()
        }
      },
    })
  }
  if (!(USE_REMOTE && getToken() && isLoggedIn())) {
    state.steps = wr.steps || state.steps || 6200
    state.source = wr.source || 'werun_mock'
    apply({
      steps: state.steps,
      claimableEnergy: state.steps >= 6000 ? 80 : state.steps >= 3000 ? 30 : 0,
      progressPct: Math.min(100, Math.round((state.steps / 6000) * 100)),
      tierLabel: state.steps >= 6000 ? '已达 6000 档' : '目标 6000 步',
      primaryTierSteps: 6000,
      cta: state.steps >= 3000 ? '领取' : '兑换',
      week: state.week,
    })
    return { ok: true }
  }
  const payload = wr.ok
    ? { encryptedData: wr.encryptedData, iv: wr.iv, source: wr.source || 'werun' }
    : { steps: wr.steps, source: wr.source || 'werun_mock' }
  const synced = await apiStepsSync(payload)
  apply(synced)
  return synced
}

function goHistory() {
  uni.navigateTo({ url: '/pages/steps/history' })
}

async function onCta() {
  if (busy.value) return
  if (cta.value === '领取历史') {
    goHistory()
    return
  }
  if (!(USE_REMOTE && getToken() && isLoggedIn())) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => uni.navigateTo({ url: '/pages/login/index' }), 400)
    return
  }
  busy.value = true
  try {
    if (cta.value === '领取') {
      if (state.requireCheckin && !state.checkedIn) {
        uni.showToast({ title: '请先完成今日签到', icon: 'none' })
        return
      }
      const r = await apiStepsClaim()
      apply(r)
      if (r.wallet && r.wallet.energy != null) session.user.energy = r.wallet.energy
      else if (r.reward && r.reward.energy) session.user.energy = (session.user.energy || 0) + r.reward.energy
      uni.showToast({ title: r.msg || '领取成功', icon: 'none' })
      return
    }
    // 兑换 = 先同步步数
    const synced = await syncSteps()
    if (synced && synced.claimableEnergy > 0) {
      uni.showToast({ title: `可领 +${synced.claimableEnergy} 能量值`, icon: 'none' })
    } else {
      uni.showToast({ title: synced && synced.msg ? synced.msg : '已同步步数', icon: 'none' })
    }
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

async function onSync() {
  if (busy.value) return
  busy.value = true
  try {
    await syncSteps()
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '同步失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

onMounted(refreshStatus)
onShow(refreshStatus)
</script>

<style scoped>
.card {
  position: relative;
  background: #f4efe6;
  border-radius: 24rpx;
  overflow: hidden;
  padding: 28rpx 28rpx 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(43, 37, 32, 0.06);
}
.progress-track {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 8rpx;
  background: rgba(127, 166, 122, 0.18);
}
.progress-fill {
  height: 100%;
  background: #7fa67a;
  transition: width 0.35s ease;
}
.main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-top: 8rpx;
}
.left {
  min-width: 0;
}
.steps-row {
  display: flex;
  align-items: baseline;
  gap: 6rpx;
}
.steps-n {
  font-size: 56rpx;
  font-weight: 800;
  color: #1c1917;
  line-height: 1;
}
.steps-u {
  font-size: 26rpx;
  color: #8a8178;
  font-weight: 600;
}
.tier {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #8a8178;
}
.cta {
  margin: 0;
  min-width: 160rpx;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  border: 2rpx solid #1c1917;
  background: transparent;
  color: #1c1917;
  font-size: 26rpx;
  font-weight: 700;
}
.cta.hist {
  border-color: #9c958c;
  color: #6e6258;
}
.cta::after {
  border: none;
}
.week {
  margin-top: 22rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  width: 44rpx;
}
.dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #d6d0c6;
}
.day.on .dot {
  background: #7fa67a;
}
.day.claimed .dot {
  background: #c9a36b;
}
.day.today .wd {
  color: #1c1917;
  font-weight: 700;
}
.wd {
  font-size: 18rpx;
  color: #9c958c;
}
.hist-link {
  margin-left: auto;
  font-size: 22rpx;
  color: #6e6258;
  font-weight: 600;
  padding: 8rpx 4rpx;
}
.hint {
  display: block;
  margin-top: 12rpx;
  font-size: 20rpx;
  color: #9c958c;
  line-height: 1.4;
}
</style>

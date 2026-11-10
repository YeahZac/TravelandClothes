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
      <button
        class="cta"
        :class="{ hist: cta === '领取历史', ready: cta === '领取' && claimableEnergy > 0 }"
        :loading="busy"
        @click="onCta"
      >
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
  cta: '领取',
  progressPct: 0,
  tierLabel: '需 6000 步 · +80 能量值',
  primaryTierSteps: 6000,
  progressTarget: 6000,
  progressTargetEnergy: 80,
  needSteps: 6000,
  week: [],
  requireCheckin: true,
  checkedIn: false,
  todayClaimed: false,
  source: '',
  tip: '',
  tiers: [],
})

const steps = computed(() => state.steps || 0)
const progressPct = computed(() => Math.max(0, Math.min(100, Number(state.progressPct) || 0)))
const cta = computed(() => state.cta || '领取')
const claimableEnergy = computed(() => Number(state.claimableEnergy) || 0)
const tierLabel = computed(() => state.tierLabel || `需 ${state.progressTarget || 6000} 步 · +${state.progressTargetEnergy || 0} 能量值`)
const week = computed(() => state.week || [])
const hint = computed(() => {
  if (state.tip) return state.tip
  const src = String(state.source || '')
  if (src === 'werun' || src === 'werun_health') return '已同步微信运动（含健康步数）'
  if (src.includes('mock')) return '开发态模拟步数 · 真机请授权微信运动'
  return ''
})

function localCfg() {
  const cfg = (appConfig.game && appConfig.game.steps) || {}
  const tiers = (cfg.tiers && cfg.tiers.length
    ? cfg.tiers
    : [
        { steps: 3000, energy: 30 },
        { steps: 6000, energy: 80 },
        { steps: 10000, energy: 120 },
      ]
  ).map((t) => ({ steps: Number(t.steps) || 0, energy: Number(t.energy) || 0 }))
  const primary = Number(cfg.primaryTierSteps) || (tiers[1] && tiers[1].steps) || 6000
  return { tiers, primary, requireCheckin: cfg.requireCheckin !== false }
}

function buildLocalLabel(s, tiers, claimed = []) {
  const claimable = tiers.filter((t) => s >= t.steps && !claimed.includes(t.steps))
  const energy = claimable.reduce((n, t) => n + t.energy, 0)
  const next = tiers.find((t) => !claimed.includes(t.steps))
  if (energy > 0) {
    const hit = claimable[claimable.length - 1]
    return {
      claimableEnergy: energy,
      progressTarget: hit.steps,
      progressTargetEnergy: hit.energy,
      needSteps: 0,
      progressPct: 100,
      tierLabel: `已达 ${hit.steps} 档 · 可领 +${energy} 能量值`,
      cta: '领取',
    }
  }
  if (!next) {
    return {
      claimableEnergy: 0,
      progressTarget: tiers[tiers.length - 1].steps,
      progressTargetEnergy: tiers[tiers.length - 1].energy,
      needSteps: 0,
      progressPct: 100,
      tierLabel: '今日档位已领完',
      cta: '领取历史',
    }
  }
  return {
    claimableEnergy: 0,
    progressTarget: next.steps,
    progressTargetEnergy: next.energy,
    needSteps: Math.max(0, next.steps - s),
    progressPct: Math.min(100, Math.round((s / next.steps) * 100)),
    tierLabel: `需 ${next.steps} 步 · +${next.energy} 能量值`,
    cta: '领取',
  }
}

function apply(r) {
  if (!r) return
  state.steps = r.steps || 0
  state.claimableEnergy = r.claimableEnergy || 0
  state.cta = r.cta === '领取历史' ? '领取历史' : '领取'
  state.progressPct = r.progressPct || 0
  state.tierLabel = r.tierLabel || ''
  state.primaryTierSteps = r.primaryTierSteps || 6000
  state.progressTarget = r.progressTarget || state.progressTarget
  state.progressTargetEnergy = r.progressTargetEnergy != null ? r.progressTargetEnergy : state.progressTargetEnergy
  state.needSteps = r.needSteps != null ? r.needSteps : state.needSteps
  state.week = r.week || []
  state.requireCheckin = r.requireCheckin !== false
  state.checkedIn = !!r.checkedIn
  state.todayClaimed = !!r.todayClaimed
  state.source = r.source || state.source
  state.tiers = r.tiers || state.tiers
  session.user.stepsToday = state.steps
  if (r.wallet && r.wallet.energy != null) session.user.energy = r.wallet.energy
}

async function refreshStatus() {
  if (!(USE_REMOTE && getToken())) {
    const { tiers, primary, requireCheckin } = localCfg()
    const s = state.steps
    const local = buildLocalLabel(s, tiers)
    state.tiers = tiers
    state.primaryTierSteps = primary
    state.requireCheckin = requireCheckin
    Object.assign(state, local)
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
    state.steps = wr.steps || state.steps || 0
    state.source = wr.source || 'werun_mock'
    const { tiers, primary } = localCfg()
    const local = buildLocalLabel(state.steps, tiers)
    apply({
      steps: state.steps,
      source: state.source,
      primaryTierSteps: primary,
      tiers,
      week: state.week,
      ...local,
    })
    return { ok: true, ...local, steps: state.steps }
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
    // 先同步步数，再按可领态领取
    let cur = state
    if (state.claimableEnergy <= 0) {
      const synced = await syncSteps()
      cur = synced || state
    }
    if ((cur.claimableEnergy || state.claimableEnergy) <= 0) {
      const need = cur.needSteps != null ? cur.needSteps : state.needSteps
      const target = cur.progressTarget || state.progressTarget
      const energy = cur.progressTargetEnergy || state.progressTargetEnergy
      uni.showToast({
        title: need > 0 ? `再走 ${need} 步可领 +${energy} 能量` : `需达 ${target} 步 · +${energy} 能量`,
        icon: 'none',
      })
      return
    }
    if (state.requireCheckin && !state.checkedIn) {
      uni.showToast({ title: '请先完成今日签到', icon: 'none' })
      return
    }
    const r = await apiStepsClaim()
    apply(r)
    if (r.wallet && r.wallet.energy != null) session.user.energy = r.wallet.energy
    else if (r.reward && r.reward.energy) session.user.energy = (session.user.energy || 0) + r.reward.energy
    uni.showToast({ title: r.msg || '领取成功', icon: 'none' })
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
  flex: 1;
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
  line-height: 1.35;
}
.cta {
  margin: 0;
  flex-shrink: 0;
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
.cta.ready {
  background: #1c1917;
  color: #f4efe6;
}
.cta.hist {
  border-color: #9c958c;
  color: #6e6258;
  background: transparent;
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

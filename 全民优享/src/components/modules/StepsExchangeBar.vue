<template>
  <view class="card">
    <view class="bar-head">
      <view class="head-l" @click="onSync">
        <text class="bar-t">今日步数</text>
        <text class="bar-meta yx-num">{{ steps }} / {{ targetSteps }} 步</text>
      </view>
      <text class="hist-link" @click="goHistory">历史 ›</text>
    </view>

    <view class="track">
      <view class="fill" :style="{ width: progressPct + '%' }" />
    </view>

    <view class="foot">
      <text class="tier">{{ tierLabel }}</text>
      <button class="cta" :loading="busy" size="mini" @click="onCta">{{ ctaLabel }}</button>
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
import { goLogin } from '../../utils/loginGate.js'
import { applyWalletEnergy, flashEnergyDelta } from '../../utils/energyFx.js'

defineProps({ mod: Object })

const busy = ref(false)
const state = reactive({
  steps: session.user.stepsToday || 0,
  progressPct: 0,
  tierLabel: '需 3000 步达标',
  primaryTierSteps: 3000,
  progressTarget: 3000,
  progressTargetEnergy: 30,
  needSteps: 3000,
  claimableEnergy: 0,
  claimablePhysical: [],
  canClaimToday: false,
  cta: '',
  checkedIn: false,
  requireCheckin: true,
  todayClaimed: false,
  source: '',
  tip: '',
  tiers: [],
})

const steps = computed(() => state.steps || 0)
const targetSteps = computed(
  () => Number(state.primaryTierSteps || state.progressTarget || 3000) || 3000
)
const progressPct = computed(() => {
  const t = targetSteps.value
  if (!t) return 0
  return Math.max(0, Math.min(100, Math.round((steps.value / t) * 100)))
})
const tierLabel = computed(
  () =>
    state.tierLabel ||
    `达标 ${targetSteps.value} 步 · +${state.progressTargetEnergy || 0} 能量值`
)
const canClaim = computed(
  () =>
    state.canClaimToday ||
    state.claimableEnergy > 0 ||
    (Array.isArray(state.claimablePhysical) && state.claimablePhysical.length > 0)
)
const ctaLabel = computed(() => {
  if (state.cta) return state.cta
  if (canClaim.value) {
    if (state.requireCheckin && !state.checkedIn) return '先签到'
    if (state.claimableEnergy > 0) return `领 +${state.claimableEnergy}`
    return '领礼品'
  }
  if (state.todayClaimed) return '已领取'
  if (!state.source && !state.steps) return '同步步数'
  if (state.needSteps > 0) return '再走走'
  return '同步步数'
})
const hint = computed(() => {
  if (state.tip) return state.tip
  if (canClaim.value) {
    if (state.requireCheckin && !state.checkedIn) return '先完成今日签到，再领步数奖励'
    return '已达标 · 点击领取能量值（或礼品）'
  }
  if (state.todayClaimed) return '今日步数奖励已领取'
  const need = Number(state.needSteps) || 0
  if (need > 0 && state.steps > 0) return `还差 ${need} 步到下一档 · 走走后再点同步`
  const src = String(state.source || '')
  if (src === 'werun' || src === 'werun_health') return '已同步微信运动 · 点按钮可刷新步数'
  if (src.includes('mock')) return '开发态模拟步数 · 真机请授权微信运动'
  return '授权微信运动后同步今日步数，达标领能量'
})

function softSyncMsg(err) {
  const raw = String((err && (err.message || err.errMsg || err.msg)) || err || '')
  if (/重新登录|session|解密|needRelogin/i.test(raw)) return '密钥失效，请重新登录后再同步'
  if (/502|503|timeout|超时|ECONN|云托管|繁忙|Maximum call stack/i.test(raw)) {
    return '同步繁忙，请稍后再试'
  }
  return raw || '同步失败'
}

function localCfg() {
  const cfg = (appConfig.game && appConfig.game.steps) || {}
  const tiers = (
    cfg.tiers && cfg.tiers.length
      ? cfg.tiers
      : [
          { steps: 3000, energy: 30 },
          { steps: 6000, energy: 80 },
          { steps: 10000, energy: 120 },
        ]
  ).map((t) => ({ steps: Number(t.steps) || 0, energy: Number(t.energy) || 0 }))
  const primary = Number(cfg.primaryTierSteps) || (tiers[0] && tiers[0].steps) || 3000
  return { tiers, primary }
}

function buildLocalLabel(s, tiers, primary) {
  const target = primary || (tiers[0] && tiers[0].steps) || 3000
  const hit = tiers.find((t) => t.steps === target) || tiers[0] || { steps: target, energy: 0 }
  const pct = Math.min(100, Math.round((s / target) * 100))
  if (s >= target) {
    return {
      progressTarget: target,
      progressTargetEnergy: hit.energy,
      needSteps: 0,
      progressPct: 100,
      claimableEnergy: hit.energy || 0,
      tierLabel: `已达 ${target} 步 · 可领 +${hit.energy} 能量值`,
    }
  }
  return {
    progressTarget: target,
    progressTargetEnergy: hit.energy,
    needSteps: Math.max(0, target - s),
    progressPct: pct,
    claimableEnergy: 0,
    tierLabel: `达标 ${target} 步 · +${hit.energy} 能量值`,
  }
}

function apply(r) {
  if (!r) return
  state.steps = r.steps || 0
  state.progressPct = r.progressPct != null ? r.progressPct : state.progressPct
  state.tierLabel = r.tierLabel || state.tierLabel
  state.primaryTierSteps = r.primaryTierSteps || state.primaryTierSteps
  state.progressTarget = r.progressTarget || state.progressTarget
  state.progressTargetEnergy =
    r.progressTargetEnergy != null ? r.progressTargetEnergy : state.progressTargetEnergy
  state.needSteps = r.needSteps != null ? r.needSteps : state.needSteps
  state.claimableEnergy = r.claimableEnergy != null ? r.claimableEnergy : state.claimableEnergy
  state.claimablePhysical = Array.isArray(r.claimablePhysical)
    ? r.claimablePhysical
    : state.claimablePhysical
  state.canClaimToday = r.canClaimToday != null ? !!r.canClaimToday : state.canClaimToday
  state.cta = r.cta != null ? r.cta : state.cta
  state.checkedIn = r.checkedIn != null ? !!r.checkedIn : state.checkedIn
  state.requireCheckin = r.requireCheckin != null ? !!r.requireCheckin : state.requireCheckin
  state.todayClaimed = r.todayClaimed != null ? !!r.todayClaimed : state.todayClaimed
  state.source = r.source || state.source
  state.tiers = r.tiers || state.tiers
  session.user.stepsToday = state.steps
  if (r.wallet && r.wallet.energy != null) {
    // 状态刷新不播动效，避免进页闪一下
    session.user.energy = r.wallet.energy
  }
}

async function refreshStatus() {
  if (!(USE_REMOTE && getToken())) {
    const { tiers, primary } = localCfg()
    const local = buildLocalLabel(state.steps, tiers, primary)
    state.tiers = tiers
    state.primaryTierSteps = primary
    Object.assign(state, local)
    return
  }
  try {
    const r = await fetchStepsStatus()
    apply(r)
    if (!state.primaryTierSteps) {
      const { primary } = localCfg()
      state.primaryTierSteps = primary
    }
  } catch (e) {}
}

function askWeRunSetting(wr) {
  uni.showModal({
    title: '需要步数权限',
    content:
      (wr.msg || '请开启微信运动') +
      (wr.isIOS ? '\n\niPhone：请在系统「健康」中允许微信读取步数，并打开微信运动同步。' : ''),
    confirmText: '去设置',
    success: async (res) => {
      if (res.confirm) {
        const s = await openWeRunSetting()
        if (s.ok) onSync()
      }
    },
  })
}

async function syncSteps() {
  if (!(USE_REMOTE && getToken() && isLoggedIn()) && USE_REMOTE) {
    requireLogin()
    return { ok: false, needLogin: true }
  }
  const wr = await getWeRunPayload({ allowMock: true })
  state.tip = wr.tip || platformHint().tip || ''
  if (wr.needSetting) {
    askWeRunSetting(wr)
    return { ok: false, needSetting: true }
  }
  if (!wr.ok && !wr.mock) {
    return { ok: false, msg: wr.msg || '未获取到步数' }
  }
  if (!(USE_REMOTE && getToken() && isLoggedIn())) {
    if (!wr.steps) return { ok: false, msg: '未获取到步数' }
    state.steps = wr.steps
    state.source = wr.source || 'werun_mock'
    const { tiers, primary } = localCfg()
    const local = buildLocalLabel(state.steps, tiers, primary)
    apply({
      steps: state.steps,
      source: state.source,
      primaryTierSteps: primary,
      tiers,
      ...local,
    })
    return { ok: true, ...local, steps: state.steps, mock: !!wr.mock }
  }
  const payload = wr.ok
    ? { encryptedData: wr.encryptedData, iv: wr.iv, source: wr.source || 'werun' }
    : { steps: Number(wr.steps) || 0, source: wr.source || 'werun_mock' }
  if (!wr.ok && !(Number(wr.steps) > 0)) {
    return { ok: false, msg: wr.msg || '未获取到步数，请授权微信运动' }
  }
  // 附带最新 login code，服务端可刷新 session_key 再解密
  try {
    // #ifdef MP-WEIXIN
    const wxLogin = await new Promise((resolve) => {
      uni.login({ provider: 'weixin', success: resolve, fail: () => resolve(null) })
    })
    if (wxLogin && wxLogin.code) payload.code = wxLogin.code
    // #endif
  } catch (e) {}
  const synced = await apiStepsSync(payload)
  if (!synced || synced.ok === false) {
    return { ok: false, msg: (synced && synced.msg) || '同步失败' }
  }
  apply(synced)
  if (!(Number(synced.steps) > 0)) {
    return {
      ok: false,
      msg: wr.mock
        ? '同步异常：步数仍为 0，请真机授权微信运动后重试'
        : '未读到今日步数，请确认已开启微信运动',
      steps: 0,
    }
  }
  return { ...synced, ok: true, mock: !!wr.mock }
}

async function claimSteps() {
  const before = Number(session.user.energy || 0)
  const r = await apiStepsClaim()
  apply(r)
  if (r.wallet && r.wallet.energy != null) {
    applyWalletEnergy(r.wallet.energy)
  } else {
    const got = Number((r.reward && r.reward.energy) || 0)
    if (got > 0) {
      session.user.energy = before + got
      flashEnergyDelta(got)
    }
  }
  return r
}

function goHistory() {
  uni.navigateTo({ url: '/pages/steps/history' })
}

function requireLogin() {
  uni.showToast({ title: '请先登录', icon: 'none' })
  setTimeout(() => goLogin('/pages/home/index'), 400)
}

/** 同步结果文案：达标可领 / 还差 N 步（再走走主路径） */
function toastAfterSync(r) {
  const stepsN = Number(r && r.steps) || 0
  const need = Number(r && r.needSteps != null ? r.needSteps : state.needSteps) || 0
  const energy = Number(r && r.claimableEnergy) || 0
  if (energy > 0) {
    uni.showToast({ title: `已同步 ${stepsN} 步 · 可领 +${energy}`, icon: 'none' })
    return
  }
  if (Array.isArray(r.claimablePhysical) && r.claimablePhysical.length) {
    uni.showToast({ title: `已同步 ${stepsN} 步 · 可领礼品`, icon: 'none' })
    return
  }
  if (r.mock) {
    uni.showToast({ title: `测试步数 ${stepsN}（请用真机授权）`, icon: 'none' })
    return
  }
  if (need > 0) {
    uni.showToast({ title: `已同步 ${stepsN} 步 · 还差 ${need} 步`, icon: 'none' })
    return
  }
  uni.showToast({ title: `已同步 ${stepsN} 步`, icon: 'none' })
}

async function handleSyncTap() {
  try {
    const r = await syncSteps()
    if (r && (r.needSetting || r.needLogin)) return
    if (!r || r.ok === false) {
      const msg = softSyncMsg(r && r.msg)
      if (/重新登录|密钥失效/i.test(msg)) {
        uni.showModal({
          title: '需要重新登录',
          content: '微信运动密钥失效，请重新登录后再同步步数',
          confirmText: '去登录',
          success: (res) => {
            if (res.confirm) requireLogin()
          },
        })
        return
      }
      uni.showToast({ title: msg, icon: 'none' })
      return
    }
    toastAfterSync(r)
  } catch (e) {
    const msg = softSyncMsg(e)
    if (/重新登录|密钥失效/i.test(msg)) {
      uni.showModal({
        title: '需要重新登录',
        content: '微信运动密钥失效，请重新登录后再同步步数',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) requireLogin()
        },
      })
      return
    }
    uni.showToast({ title: msg, icon: 'none' })
  }
}

async function onCta() {
  if (busy.value) return
  if (canClaim.value || ctaLabel.value === '先签到') {
    if (!(USE_REMOTE && getToken() && isLoggedIn()) && USE_REMOTE) {
      requireLogin()
      return
    }
  }
  busy.value = true
  try {
    if (canClaim.value) {
      if (!(USE_REMOTE && getToken() && isLoggedIn())) {
        requireLogin()
        return
      }
      if (state.requireCheckin && !state.checkedIn) {
        uni.showToast({ title: '先签到再领步数奖励', icon: 'none' })
        return
      }
      const r = await claimSteps()
      uni.showToast({ title: (r && r.msg) || '领取成功', icon: 'none' })
      await refreshStatus()
      return
    }
    // 再走走 / 同步步数：拉微信运动刷新进度（总纲：步数按档兑能量）
    await handleSyncTap()
  } catch (e) {
    uni.showToast({ title: softSyncMsg(e), icon: 'none' })
  } finally {
    busy.value = false
  }
}

async function onSync() {
  if (busy.value) return
  busy.value = true
  try {
    await handleSyncTap()
  } finally {
    busy.value = false
  }
}

onMounted(refreshStatus)
onShow(refreshStatus)
</script>

<style scoped>
.card {
  background: var(--paper-2);
  border-radius: var(--radius-card);
  border: 1rpx solid var(--line-soft);
  box-shadow: var(--shadow);
  padding: 32rpx 36rpx 28rpx;
  box-sizing: border-box;
}
.bar-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 16rpx;
  gap: 16rpx;
}
.head-l {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
  min-width: 0;
  flex: 1;
}
.bar-t {
  font-size: 28rpx;
  font-weight: 800;
  color: var(--ink);
  flex-shrink: 0;
}
.bar-meta {
  font-size: 24rpx;
  color: var(--ink-3);
}
.hist-link {
  font-size: 22rpx;
  color: var(--ink-2);
  font-weight: 600;
  flex-shrink: 0;
}
.track {
  height: 16rpx;
  border-radius: 999rpx;
  background: var(--paper-3);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #c9a36b, #e0bf7a);
  transition: width 0.35s ease;
}
.foot {
  margin-top: 16rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.tier {
  flex: 1;
  min-width: 0;
  font-size: 22rpx;
  color: var(--ink-3);
  line-height: 1.35;
}
.cta {
  margin: 0;
  flex-shrink: 0;
  min-width: 96rpx;
  height: 48rpx;
  line-height: 48rpx;
  padding: 0 22rpx;
  border-radius: var(--radius-pill);
  border: none;
  background: var(--ink);
  color: #fff;
  font-size: 22rpx;
  font-weight: 700;
}
.cta::after {
  border: none;
}
.hint {
  display: block;
  margin-top: 12rpx;
  font-size: 20rpx;
  color: var(--ink-3);
  line-height: 1.4;
}
</style>

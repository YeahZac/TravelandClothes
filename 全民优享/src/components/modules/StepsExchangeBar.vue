<template>
  <view class="card">
    <view class="bar-head">
      <view class="head-l" @click="onSync">
        <text class="bar-t">今日步数</text>
        <text class="bar-meta yx-num">{{ steps }} / {{ targetSteps }} 步</text>
      </view>
      <view class="head-links">
        <text class="hist-link" @click.stop="goExchange">全部档位 ›</text>
        <text class="hist-link" @click.stop="goHistory">历史 ›</text>
      </view>
    </view>

    <view class="track">
      <view class="fill" :style="{ width: progressPct + '%' }" />
    </view>

    <!-- 下一档真实奖励：有能量显示能量，有实物才显示礼物 -->
    <view class="reward-strip" @click="onCta">
      <view class="need-line">
        <text class="need-t">{{ needPrefix }}</text>
      </view>
      <view v-if="showEnergy || showGift" class="reward-row" :class="{ single: !(showEnergy && showGift) }">
        <view v-if="showEnergy" class="chip energy">
          <image class="chip-ico" src="/static/ui/ico-coin.jpg" mode="aspectFit" />
          <view class="chip-txt">
            <text class="chip-k">能量值</text>
            <text class="chip-v energy-v yx-num">+{{ displayEnergy }}</text>
          </view>
        </view>
        <view v-if="showGift" class="chip gift">
          <image
            class="chip-ico"
            :src="giftImageUrl || '/static/ui/ico-gift.jpg'"
            mode="aspectFit"
          />
          <view class="chip-txt">
            <text class="chip-k">实体礼物</text>
            <text class="chip-v gift-v">{{ giftName }}</text>
          </view>
        </view>
      </view>
      <view v-else class="empty-reward">
        <text class="empty-t">今日档位已领完</text>
      </view>
    </view>

    <view class="foot">
      <text class="hint-inline">{{ hint }}</text>
      <button class="cta" :class="{ claim: canClaim }" :loading="busy" size="mini" @click="onCta">
        {{ ctaLabel }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { session } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { USE_REMOTE, getToken, invalidateRequestCache } from '../../api/request.js'
import { isLoggedIn, fetchWxLoginCode } from '../../api/auth.js'
import { fetchStepsStatus, apiStepsSync, apiStepsClaim } from '../../api/growth.js'
import { getWeRunPayload, openWeRunSetting, platformHint } from '../../utils/werun.js'
import { maybeAutoSyncSteps } from '../../utils/stepsAutoSync.js'
import { goLogin } from '../../utils/loginGate.js'
import { applyWalletEnergy, flashEnergyDelta } from '../../utils/energyFx.js'
import { safeShowToast } from '../../utils/safeUi.js'

defineProps({ mod: Object })

const busy = ref(false)
const state = reactive({
  steps: session.user.stepsToday || 0,
  progressPct: 0,
  tierLabel: '',
  primaryTierSteps: 3000,
  progressTarget: 3000,
  progressTargetEnergy: 0,
  progressTargetGift: null,
  nextTier: null,
  needSteps: 3000,
  claimableEnergy: 0,
  claimablePhysical: [],
  canClaimToday: false,
  cta: '',
  checkedIn: false,
  requireCheckin: true,
  todayClaimed: false,
  allTiersDone: false,
  source: '',
  tip: '',
  tiers: [],
})

const steps = computed(() => state.steps || 0)

/** 进度条分母 = 下一档步数（未领完的最近档） */
const targetSteps = computed(() => {
  if (state.nextTier && state.nextTier.steps) return Number(state.nextTier.steps)
  return Number(state.progressTarget || state.primaryTierSteps || 3000) || 3000
})

const progressPct = computed(() => {
  const t = targetSteps.value
  if (!t) return 0
  if (state.allTiersDone) return 100
  return Math.max(0, Math.min(100, Math.round((steps.value / t) * 100)))
})

const giftFromClaimable = computed(() => {
  const list = state.claimablePhysical || []
  return list.length ? list[0] : null
})

/** 可领优先；否则下一档真实奖励 */
const displayEnergy = computed(() => {
  if (state.claimableEnergy > 0) return state.claimableEnergy
  const next = state.nextTier
  const rt = String((next && next.rewardType) || '')
  if (next && next.energy > 0 && (rt === 'energy' || rt === 'both' || !rt)) return next.energy
  return Number(state.progressTargetEnergy || 0) || 0
})

const giftName = computed(() => {
  const g = giftFromClaimable.value || (state.nextTier && state.nextTier.gift) || state.progressTargetGift
  if (!g || g.showcase) return ''
  return String(g.name || g.label || '').trim()
})

const giftImageUrl = computed(() => {
  const g = giftFromClaimable.value || (state.nextTier && state.nextTier.gift) || state.progressTargetGift
  if (!g || g.showcase) return ''
  return String(g.imageUrl || g.productImageUrl || '').trim()
})

const showEnergy = computed(() => displayEnergy.value > 0)
const showGift = computed(() => !!giftName.value)

const needPrefix = computed(() => {
  if (state.tierLabel) return state.tierLabel
  if (canClaim.value) {
    const parts = []
    if (displayEnergy.value > 0) parts.push(`+${displayEnergy.value} 能量值`)
    if (giftName.value) parts.push(giftName.value)
    return parts.length ? `已达标 · 可领 ${parts.join(' / ')}` : '已达标 · 立即领取'
  }
  if (state.allTiersDone || state.todayClaimed) return '今日档位已领完'
  const need = Number(state.needSteps) || 0
  const target = targetSteps.value
  if (need > 0) {
    if (giftName.value) return `还差 ${need} 步到 ${target} · 可领 ${giftName.value}`
    if (displayEnergy.value > 0) return `还差 ${need} 步到 ${target} · 可领 +${displayEnergy.value} 能量值`
    return `还差 ${need} 步到下一档（${target}）`
  }
  return `达标 ${target} 步可领`
})

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
    const hasGift = Array.isArray(state.claimablePhysical) && state.claimablePhysical.length > 0
    if (state.claimableEnergy > 0 && hasGift) return `领 +${state.claimableEnergy}·礼品`
    if (state.claimableEnergy > 0) return `领 +${state.claimableEnergy}`
    return '领礼品'
  }
  if (state.allTiersDone || state.todayClaimed) return '已领取'
  if (!state.source && !state.steps) return '同步步数'
  if (state.needSteps > 0) return '再走走'
  return '同步步数'
})

const hint = computed(() => {
  if (state.tip) return state.tip
  if (canClaim.value) {
    if (state.requireCheckin && !state.checkedIn) return '先完成今日签到，再领步数奖励'
    if (showGift.value && showEnergy.value) return '能量值与实体礼物可领'
    if (showGift.value) return '点击领取实体礼物'
    return '点击领取能量值'
  }
  if (state.allTiersDone || state.todayClaimed) return '今日步数奖励已领取'
  const need = Number(state.needSteps) || 0
  if (need > 0 && state.steps > 0) return `还差 ${need} 步到下一档 · 走走后再点同步`
  const src = String(state.source || '')
  if (src === 'werun' || src === 'werun_health') return '已同步运动步数 · 点按钮可刷新步数'
  if (src.includes('mock')) return '开发态模拟步数 · 真机请授权运动步数'
  return '授权运动步数后同步今日步数，达标领奖励'
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
  ).map((t) => ({
    steps: Number(t.steps) || 0,
    energy: Number(t.energy) || 0,
    rewardType: String(t.rewardType || '').toLowerCase() === 'physical' ? 'physical' : 'energy',
    productId: String(t.productId || '').trim(),
    label: String(t.label || '').trim(),
    productName: String(t.productName || t.label || '').trim(),
    productImageUrl: String(t.productImageUrl || t.imageUrl || '').trim(),
  }))
  const primary = Number(cfg.primaryTierSteps) || (tiers[0] && tiers[0].steps) || 3000
  return { tiers, primary }
}

/** 本地离线：按未领档位算下一档真实奖励 */
function buildLocalProgress(s, tiers, claimed = []) {
  const nextOpen = tiers.find((t) => !claimed.includes(t.steps))
  if (!nextOpen) {
    return {
      progressTarget: (tiers[tiers.length - 1] && tiers[tiers.length - 1].steps) || 3000,
      progressTargetEnergy: 0,
      progressTargetGift: null,
      nextTier: null,
      needSteps: 0,
      progressPct: 100,
      claimableEnergy: 0,
      claimablePhysical: [],
      allTiersDone: true,
      tierLabel: '今日档位已领完',
      canClaimToday: false,
      todayClaimed: true,
    }
  }
  const isPhysical = nextOpen.rewardType === 'physical' && !!nextOpen.productId
  const gift = isPhysical
    ? {
        productId: nextOpen.productId,
        name: nextOpen.productName || nextOpen.label || `达标${nextOpen.steps}步礼品`,
        imageUrl: nextOpen.productImageUrl || '',
      }
    : null
  const energy = isPhysical ? 0 : Number(nextOpen.energy) || 0
  const need = Math.max(0, nextOpen.steps - s)
  const unlocked = s >= nextOpen.steps
  const nextTier = {
    steps: nextOpen.steps,
    needSteps: need,
    rewardType: isPhysical ? 'physical' : 'energy',
    energy,
    gift,
    unlocked,
  }
  let tierLabel = ''
  if (unlocked) {
    tierLabel = gift
      ? `已达 ${nextOpen.steps} 步 · 可领 ${gift.name}`
      : `已达 ${nextOpen.steps} 步 · 可领 +${energy} 能量值`
  } else if (gift) {
    tierLabel = `还差 ${need} 步到 ${nextOpen.steps} · 可领 ${gift.name}`
  } else {
    tierLabel = `还差 ${need} 步到 ${nextOpen.steps} · 可领 +${energy} 能量值`
  }
  return {
    progressTarget: nextOpen.steps,
    progressTargetEnergy: energy,
    progressTargetGift: gift,
    nextTier,
    needSteps: need,
    progressPct: Math.min(100, Math.round((s / nextOpen.steps) * 100)),
    claimableEnergy: unlocked && !isPhysical ? energy : 0,
    claimablePhysical: unlocked && gift ? [{ ...gift, steps: nextOpen.steps, label: gift.name }] : [],
    allTiersDone: false,
    tierLabel,
    canClaimToday: unlocked,
    todayClaimed: false,
  }
}

function apply(r) {
  if (!r) return
  state.steps = r.steps || 0
  state.progressPct = r.progressPct != null ? r.progressPct : state.progressPct
  state.tierLabel = r.tierLabel != null ? r.tierLabel : state.tierLabel
  state.primaryTierSteps = r.primaryTierSteps || state.primaryTierSteps
  state.progressTarget = r.progressTarget || state.progressTarget
  state.progressTargetEnergy =
    r.progressTargetEnergy != null ? r.progressTargetEnergy : state.progressTargetEnergy
  state.progressTargetGift =
    r.progressTargetGift !== undefined ? r.progressTargetGift : state.progressTargetGift
  state.nextTier = r.nextTier !== undefined ? r.nextTier : state.nextTier
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
  state.allTiersDone = r.allTiersDone != null ? !!r.allTiersDone : state.allTiersDone
  state.source = r.source || state.source
  state.tiers = r.tiers || state.tiers
  session.user.stepsToday = state.steps
  if (r.wallet && r.wallet.energy != null) {
    session.user.energy = r.wallet.energy
  }
}

let statusInflight = null
let lastStatusAt = 0

async function refreshStatus(opts = {}) {
  // onMounted + onShow 首屏双刷：1.2s 内合并
  if (!opts.force && lastStatusAt && Date.now() - lastStatusAt < 1200) {
    return statusInflight
  }
  if (statusInflight) return statusInflight
  statusInflight = (async () => {
    if (!(USE_REMOTE && getToken())) {
      const { tiers, primary } = localCfg()
      const local = buildLocalProgress(state.steps, tiers)
      state.tiers = tiers
      state.primaryTierSteps = primary
      Object.assign(state, local)
      return
    }
    try {
      const r = await fetchStepsStatus()
      lastStatusAt = Date.now()
      apply(r)
      if (!state.primaryTierSteps) {
        const { primary } = localCfg()
        state.primaryTierSteps = primary
      }
    } catch (e) {}
  })().finally(() => {
    statusInflight = null
  })
  return statusInflight
}

function askWeRunSetting(wr) {
  uni.showModal({
    title: '需要步数权限',
    content:
      (wr.msg || '请开启运动步数') +
      (wr.isIOS ? '\n\niPhone：请在系统「健康」中允许读取步数，并打开步数同步。' : ''),
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
  // 顺序固定：先 wx.login 换 code，再取运动数据；反序会让服务端用新 session_key 解旧密文
  let loginCode = ''
  if (USE_REMOTE && getToken() && isLoggedIn()) {
    try {
      loginCode = await fetchWxLoginCode()
    } catch (_) {}
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
    const local = buildLocalProgress(state.steps, tiers)
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
    return { ok: false, msg: wr.msg || '未获取到步数，请授权运动步数' }
  }
  if (loginCode) payload.code = loginCode
  const synced = await apiStepsSync(payload)
  if (!synced || synced.ok === false) {
    return { ok: false, msg: (synced && synced.msg) || '同步失败' }
  }
  invalidateRequestCache('/api/traffic/v1/steps/status')
  apply(synced)
  if (!(Number(synced.steps) > 0)) {
    return {
      ok: false,
      msg: wr.mock
        ? '同步异常：步数仍为 0，请真机授权运动步数后重试'
        : '未读到今日步数，请确认已开启运动步数',
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

function goExchange() {
  uni.navigateTo({ url: '/pages/steps/exchange' })
}

function requireLogin() {
  safeShowToast({ title: '请先登录', icon: 'none' })
  setTimeout(() => goLogin('/pages/home/index'), 400)
}

function toastAfterSync(r) {
  const stepsN = Number(r && r.steps) || 0
  const need = Number(r && r.needSteps != null ? r.needSteps : state.needSteps) || 0
  const energy = Number(r && r.claimableEnergy) || 0
  if (energy > 0) {
    safeShowToast({ title: `已同步 ${stepsN} 步 · 可领 +${energy}`, icon: 'none' })
    return
  }
  if (Array.isArray(r.claimablePhysical) && r.claimablePhysical.length) {
    safeShowToast({ title: `已同步 ${stepsN} 步 · 可领礼品`, icon: 'none' })
    return
  }
  if (r.mock) {
    safeShowToast({ title: `测试步数 ${stepsN}（请用真机授权）`, icon: 'none' })
    return
  }
  if (need > 0) {
    safeShowToast({ title: `已同步 ${stepsN} 步 · 还差 ${need} 步`, icon: 'none' })
    return
  }
  safeShowToast({ title: `已同步 ${stepsN} 步`, icon: 'none' })
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
          content: '运动步数密钥失效，请重新登录后再同步步数',
          confirmText: '去登录',
          success: (res) => {
            if (res.confirm) requireLogin()
          },
        })
        return
      }
      safeShowToast({ title: msg, icon: 'none' })
      return
    }
    toastAfterSync(r)
  } catch (e) {
    const msg = softSyncMsg(e)
    if (/重新登录|密钥失效/i.test(msg)) {
      uni.showModal({
        title: '需要重新登录',
        content: '运动步数密钥失效，请重新登录后再同步步数',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) requireLogin()
        },
      })
      return
    }
    safeShowToast({ title: msg, icon: 'none' })
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
        safeShowToast({ title: '先签到再领步数奖励', icon: 'none' })
        return
      }
      const r = await claimSteps()
      if (r && r.claimToken && r.productId) {
        uni.showModal({
          title: '领取成功',
          content: (r.msg || '获得实物礼品') + '\n请填写地址完成兑奖',
          confirmText: '去兑奖',
          success: (res) => {
            if (!res.confirm) return
            const token = encodeURIComponent(r.claimToken)
            const pid = encodeURIComponent(r.productId)
            uni.navigateTo({
              url: `/pages/order/confirm?type=lottery&productId=${pid}&claimToken=${token}&entryFrom=steps`,
            })
          },
        })
      } else {
        safeShowToast({ title: (r && r.msg) || '领取成功', icon: 'none' })
      }
      await refreshStatus()
      return
    }
    await handleSyncTap()
  } catch (e) {
    safeShowToast({ title: softSyncMsg(e), icon: 'none' })
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

async function refreshAndAutoSync() {
  await refreshStatus()
  // 已授权用户进首页自动同步，不必每次点按钮；节流 10min / 跨天必同步
  if (!(USE_REMOTE && getToken() && isLoggedIn())) return
  try {
    const r = await maybeAutoSyncSteps({ silent: true, minIntervalMs: 10 * 60 * 1000 })
    if (r && r.ok) await refreshStatus({ force: true })
  } catch (_) {}
}

onMounted(refreshAndAutoSync)
onShow(refreshAndAutoSync)
</script>

<style scoped>
.card {
  background: var(--paper-2);
  border-radius: var(--radius-card);
  border: 1rpx solid var(--line-soft);
  box-shadow: var(--shadow);
  padding: 28rpx 28rpx 24rpx;
  box-sizing: border-box;
}
.bar-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 14rpx;
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
.head-links {
  display: flex;
  align-items: center;
  gap: 16rpx;
  flex-shrink: 0;
}
.hist-link {
  font-size: 22rpx;
  color: var(--ink-2);
  font-weight: 600;
  flex-shrink: 0;
}
.track {
  height: 14rpx;
  border-radius: 999rpx;
  background: var(--paper-3);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #c9a36b, #e8c57a);
  transition: width 0.35s ease;
}

.reward-strip {
  margin-top: 18rpx;
  padding: 18rpx 18rpx 16rpx;
  border-radius: 20rpx;
  background: linear-gradient(135deg, #fff8ef 0%, #fff1e4 55%, #ffe8d6 100%);
  border: 1rpx solid #f0d2b4;
}
.need-line {
  margin-bottom: 12rpx;
}
.need-t {
  font-size: 24rpx;
  font-weight: 700;
  color: #9a6b3c;
  line-height: 1.4;
}
.reward-row {
  display: flex;
  align-items: stretch;
  gap: 12rpx;
}
.reward-row.single .chip {
  flex: 1;
}
.chip {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 14rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.88);
}
.chip.gift {
  background: linear-gradient(145deg, #fff7f2, #ffe9de);
  border: 1rpx solid #ffc9a8;
}
.chip-ico {
  width: 56rpx;
  height: 56rpx;
  flex-shrink: 0;
}
.chip-txt {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}
.chip-k {
  font-size: 18rpx;
  color: #9a8b7c;
  font-weight: 600;
  line-height: 1.2;
}
.chip-v {
  font-weight: 800;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.energy-v {
  font-size: 30rpx;
  color: #c45c1a;
}
.gift-v {
  font-size: 28rpx;
  color: #e23d1f;
  letter-spacing: 0.5rpx;
}
.empty-reward {
  padding: 8rpx 4rpx 2rpx;
}
.empty-t {
  font-size: 24rpx;
  color: #9a8b7c;
  font-weight: 600;
}

.foot {
  margin-top: 16rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.hint-inline {
  flex: 1;
  min-width: 0;
  font-size: 20rpx;
  color: var(--ink-3);
  line-height: 1.35;
}
.cta {
  margin: 0;
  flex-shrink: 0;
  min-width: 120rpx;
  height: 52rpx;
  line-height: 52rpx;
  padding: 0 24rpx;
  border-radius: var(--radius-pill);
  border: none;
  background: var(--ink);
  color: #fff;
  font-size: 22rpx;
  font-weight: 700;
}
.cta.claim {
  background: linear-gradient(135deg, #ff6a2b, #e23d1f);
  box-shadow: 0 8rpx 18rpx rgba(226, 61, 31, 0.28);
}
.cta::after {
  border: none;
}
</style>

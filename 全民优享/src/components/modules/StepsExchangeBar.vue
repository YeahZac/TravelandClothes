<template>
  <view class="card">
    <view class="bar-head">
      <view class="head-l">
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

    <!-- 下一档真实奖励：礼品在前、能量在后 -->
    <view class="reward-strip">
      <view class="need-line">
        <text class="need-t">{{ needPrefix }}</text>
      </view>
      <view v-if="showGift || showEnergy" class="reward-row" :class="{ single: !(showGift && showEnergy) }">
        <view v-if="showGift" class="chip gift">
          <view class="chip-ico-wrap">
            <CmsImage
              class="chip-ico"
              :src="giftImageUrl || '/static/ui/ico-gift.jpg'"
              mode="aspectFill"
              placeholder="/static/ui/ico-gift.jpg"
              :show-placeholder="true"
            />
          </view>
          <view class="chip-txt">
            <text class="chip-k">实体礼物</text>
            <text class="chip-v gift-v">{{ giftNameShort }}</text>
          </view>
        </view>
        <view v-if="showEnergy" class="chip energy">
          <image class="chip-ico" src="/static/ui/ico-coin.jpg" mode="aspectFit" />
          <view class="chip-txt">
            <text class="chip-k">能量值</text>
            <text class="chip-v energy-v yx-num">+{{ displayEnergy }}</text>
          </view>
        </view>
      </view>
      <view v-else class="empty-reward">
        <text class="empty-t">今日档位已领完</text>
      </view>
    </view>

    <view class="foot">
      <text class="hint-inline">{{ hint }}</text>
      <button
        class="cta"
        :class="{ claim: canClaim, wait: !canClaim && !allDone }"
        :disabled="allDone || busy"
        :loading="busy"
        size="mini"
        @click="onCta"
      >
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
import { USE_REMOTE, getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { fetchStepsStatus, apiStepsClaim } from '../../api/growth.js'
import { openWeRunSetting, platformHint } from '../../utils/werun.js'
import { maybeAutoSyncSteps } from '../../utils/stepsAutoSync.js'
import { goLogin } from '../../utils/loginGate.js'
import { applyWalletEnergy, flashEnergyDelta } from '../../utils/energyFx.js'
import { safeShowToast } from '../../utils/safeUi.js'
import CmsImage from '../CmsImage.vue'

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

function normalizeRt(raw) {
  const s = String(raw || '').toLowerCase().trim()
  if (s === 'physical' || s === 'gift' || s === 'product') return 'physical'
  if (s === 'both' || s === 'all' || s === 'energy_physical' || s === 'energy+physical') return 'both'
  return 'energy'
}

/** 用 bootstrap/catalog 物料补全名称与图（服务端 enrich 失败时的兜底） */
function resolveCatalogProduct(productId) {
  const id = String(productId || '').trim()
  if (!id) return null
  const list = (appConfig.catalog && appConfig.catalog.products) || []
  return list.find((p) => String(p.id || p.productId || '') === id) || null
}

function isPlaceholderGiftName(name) {
  return !name || /^达标\d+步礼品$/.test(String(name).trim()) || name === '实物礼品'
}

/** 按配置实物名截取展示（约 6 字 + …） */
function shortGiftLabel(name, maxLen = 6) {
  const s = String(name || '').trim()
  if (!s) return ''
  const chars = Array.from(s)
  return chars.length > maxLen ? `${chars.slice(0, maxLen).join('')}…` : s
}

function enrichGift(raw, productIdHint) {
  if (!raw && !productIdHint) return null
  const productId = String((raw && raw.productId) || productIdHint || '').trim()
  const cat = resolveCatalogProduct(productId)
  let name = String((raw && (raw.name || raw.label)) || '').trim()
  let imageUrl = String((raw && (raw.imageUrl || raw.productImageUrl)) || '').trim()
  if (cat) {
    if (isPlaceholderGiftName(name) && cat.name) name = String(cat.name).trim()
    if (!imageUrl) {
      imageUrl = String(cat.imageUrl || cat.coverUrl || cat.thumbUrl || '').trim()
    }
  }
  if (!name && productId) name = '实物礼品'
  if (!name && !imageUrl && !productId) return null
  return { productId, name, imageUrl, showcase: raw && raw.showcase }
}

/** 当前未领档：API nextTier 优先，否则从 tiers 推算（兼容能量+实物） */
const activeTier = computed(() => {
  const next = state.nextTier
  const fromList = (state.tiers || []).find((t) => !t.claimed)
  const claimGift = (state.claimablePhysical || [])[0] || null
  const rt = normalizeRt((next && next.rewardType) || (fromList && fromList.rewardType) || 'energy')
  const energyFromNext =
    next && next.energy > 0
      ? Number(next.energy)
      : fromList && (rt === 'energy' || rt === 'both')
        ? Number(fromList.energy) || 0
        : 0
  const productId =
    (next && next.gift && next.gift.productId) ||
    (claimGift && claimGift.productId) ||
    (state.progressTargetGift && state.progressTargetGift.productId) ||
    (fromList && fromList.productId) ||
    ''
  const giftRaw =
    (next && next.gift) ||
    claimGift ||
    state.progressTargetGift ||
    (fromList && (rt === 'physical' || rt === 'both') && (fromList.productId || fromList.productName)
      ? {
          productId: fromList.productId || '',
          name: fromList.productName || fromList.label || fromList.name || '',
          imageUrl: fromList.productImageUrl || fromList.imageUrl || '',
        }
      : null)
  const gift = enrichGift(giftRaw, productId)
  return {
    steps: Number((next && next.steps) || (fromList && fromList.steps) || state.progressTarget || 0),
    needSteps: Number(
      next && next.needSteps != null
        ? next.needSteps
        : Math.max(0, Number((fromList && fromList.steps) || state.progressTarget || 0) - (state.steps || 0))
    ),
    rewardType: rt,
    energy: energyFromNext,
    gift: gift && !gift.showcase ? gift : null,
  }
})

const displayEnergy = computed(() => {
  if (state.claimableEnergy > 0) return state.claimableEnergy
  const a = activeTier.value
  if (a.energy > 0 && (a.rewardType === 'energy' || a.rewardType === 'both')) return a.energy
  return Number(state.progressTargetEnergy || 0) || 0
})

const giftName = computed(() => {
  const g = activeTier.value.gift
  if (!g) return ''
  return String(g.name || '').trim()
})

const giftNameShort = computed(() => shortGiftLabel(giftName.value, 6))

const giftImageUrl = computed(() => {
  const g = activeTier.value.gift
  if (!g) return ''
  return String(g.imageUrl || '').trim()
})

const showEnergy = computed(() => displayEnergy.value > 0)
const showGift = computed(() => !!(activeTier.value.gift && (giftName.value || giftImageUrl.value || activeTier.value.gift.productId)))

const allDone = computed(() => !!(state.allTiersDone || (state.todayClaimed && !state.canClaimToday && !state.nextTier)))

const needPrefix = computed(() => {
  const giftPart = giftNameShort.value
  if (canClaim.value) {
    const parts = []
    if (giftPart) parts.push(giftPart)
    if (displayEnergy.value > 0) parts.push(`+${displayEnergy.value} 能量值`)
    return parts.length ? `已达标 · 可领 ${parts.join(' / ')}` : '已达标 · 立即领取'
  }
  if (allDone.value) return '今日档位已领完'
  const need = Number(state.needSteps != null ? state.needSteps : activeTier.value.needSteps) || 0
  const target = targetSteps.value
  const parts = []
  if (giftPart) parts.push(giftPart)
  if (displayEnergy.value > 0) parts.push(`+${displayEnergy.value} 能量值`)
  const reward = parts.length ? parts.join(' / ') : '奖励'
  if (need > 0) return `还差 ${need} 步到 ${target} · 可领 ${reward}`
  return `达标 ${target} 步可领 ${reward}`
})

const canClaim = computed(
  () =>
    state.canClaimToday ||
    state.claimableEnergy > 0 ||
    (Array.isArray(state.claimablePhysical) && state.claimablePhysical.length > 0)
)

const ctaLabel = computed(() => {
  if (allDone.value) return '已领完'
  if (canClaim.value) {
    if (state.requireCheckin && !state.checkedIn) return '先签到'
    return '立即领取'
  }
  const need = Number(state.needSteps != null ? state.needSteps : activeTier.value.needSteps) || 0
  return need > 0 ? `还差 ${need} 步` : '再走走'
})

const hint = computed(() => {
  if (canClaim.value) {
    if (state.requireCheckin && !state.checkedIn) return '先完成今日签到，再领步数奖励'
    if (showGift.value && showEnergy.value) return '礼品与能量值可一并领取'
    if (showGift.value) return '点击立即领取实体礼物'
    return '已达标，点击立即领取'
  }
  if (allDone.value) return '今日步数奖励已领完，明天再来'
  const need = Number(state.needSteps != null ? state.needSteps : activeTier.value.needSteps) || 0
  if (need > 0) return `还差 ${need} 步 · 打开小程序会自动更新步数`
  const src = String(state.source || '')
  if (src === 'werun' || src === 'werun_health') return '已自动同步运动步数'
  if (src.includes('mock')) return '开发态模拟步数 · 真机请授权微信运动'
  if (state.tip) return state.tip
  return platformHint().tip || '登录后将自动同步今日步数，达标可领奖励'
})

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
  ).map((t) => {
    const rewardType = normalizeRt(t.rewardType)
    return {
      steps: Number(t.steps) || 0,
      energy: Number(t.energy) || 0,
      rewardType,
      productId: String(t.productId || '').trim(),
      label: String(t.label || '').trim(),
      productName: String(t.productName || t.label || '').trim(),
      productImageUrl: String(t.productImageUrl || t.imageUrl || '').trim(),
      claimed: !!t.claimed,
    }
  })
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
  const rt = normalizeRt(nextOpen.rewardType)
  const wantGift = (rt === 'physical' || rt === 'both') && !!(nextOpen.productId || nextOpen.productName)
  const wantEnergy = (rt === 'energy' || rt === 'both') && Number(nextOpen.energy) > 0
  const gift = wantGift
    ? {
        productId: nextOpen.productId || '',
        name: nextOpen.productName || nextOpen.label || `达标${nextOpen.steps}步礼品`,
        imageUrl: nextOpen.productImageUrl || '',
      }
    : null
  const energy = wantEnergy ? Number(nextOpen.energy) || 0 : 0
  const need = Math.max(0, nextOpen.steps - s)
  const unlocked = s >= nextOpen.steps
  const nextTier = {
    steps: nextOpen.steps,
    needSteps: need,
    rewardType: rt,
    energy,
    gift,
    unlocked,
  }
  const rewardParts = []
  if (gift) rewardParts.push(gift.name)
  if (energy > 0) rewardParts.push(`+${energy} 能量值`)
  const rewardText = rewardParts.join(' / ') || '奖励'
  const tierLabel = unlocked
    ? `已达 ${nextOpen.steps} 步 · 可领 ${rewardText}`
    : `还差 ${need} 步到 ${nextOpen.steps} · 可领 ${rewardText}`
  return {
    progressTarget: nextOpen.steps,
    progressTargetEnergy: energy,
    progressTargetGift: gift,
    nextTier,
    needSteps: need,
    progressPct: Math.min(100, Math.round((s / nextOpen.steps) * 100)),
    claimableEnergy: unlocked && wantEnergy ? energy : 0,
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
    title: '需要微信运动权限',
    content:
      (wr && wr.msg ? wr.msg : '请开启微信运动步数') +
      (wr && wr.isIOS ? '\n\niPhone：请在系统「健康」中允许读取步数，并打开步数同步。' : ''),
    confirmText: '去设置',
    success: async (res) => {
      if (!res.confirm) return
      const s = await openWeRunSetting()
      if (s.ok) refreshAndAutoSync({ requestAuth: true })
    },
  })
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

async function onCta() {
  if (busy.value || allDone.value) return
  if (!canClaim.value) {
    const need = Number(state.needSteps != null ? state.needSteps : activeTier.value.needSteps) || 0
    safeShowToast({
      title: need > 0 ? `还差 ${need} 步，走走再来领` : '暂未达标',
      icon: 'none',
    })
    return
  }
  if (!(USE_REMOTE && getToken() && isLoggedIn()) && USE_REMOTE) {
    requireLogin()
    return
  }
  busy.value = true
  try {
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
    await refreshStatus({ force: true })
  } catch (e) {
    safeShowToast({ title: (e && e.message) || '领取失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

let askedSettingOnce = false

async function refreshAndAutoSync(opts = {}) {
  await refreshStatus()
  if (!(USE_REMOTE && getToken() && isLoggedIn())) return
  try {
    const r = await maybeAutoSyncSteps({
      silent: true,
      minIntervalMs: 45 * 1000,
      requestAuth: !!opts.requestAuth,
      allowMock: false,
    })
    if (r && r.ok) {
      apply(r)
      await refreshStatus({ force: true })
      return
    }
    if (r && r.needSetting && !askedSettingOnce) {
      askedSettingOnce = true
      state.tip = platformHint().tip || '请授权微信运动以自动同步步数'
      askWeRunSetting(r)
    }
  } catch (_) {}
}

onMounted(() => refreshAndAutoSync({ requestAuth: false }))
onShow(() => refreshAndAutoSync({ requestAuth: false }))
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
.chip-ico-wrap {
  width: 56rpx;
  height: 56rpx;
  flex-shrink: 0;
  border-radius: 12rpx;
  overflow: hidden;
  background: #fff;
}
.chip-ico {
  width: 56rpx;
  height: 56rpx;
  flex-shrink: 0;
  display: block;
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
.cta.wait {
  background: #3a3f4b;
  opacity: 0.92;
}
.cta[disabled] {
  opacity: 0.55;
}
.cta::after {
  border: none;
}
</style>

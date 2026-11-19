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
      :sub-message="okSub"
      variant="checkin"
      :show-close="!!pendingClaim.claimToken"
      :auto-hide-ms="pendingClaim.claimToken ? 0 : 2000"
      :primary-text="pendingClaim.claimToken ? '去兑奖' : ''"
      @primary="goClaimGift"
    />
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { session, doCheckin } from '../../store/session.js'
import { USE_REMOTE, getToken } from '../../api/request.js'
import { apiCheckin, fetchCheckinStatus } from '../../api/growth.js'
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
const okSub = ref('奖励已到账')
const pendingClaim = ref({ claimToken: '', productId: '' })
const authed = computed(() => isLoggedIn() || (!USE_REMOTE && !!session.user.loggedIn))

function goClaimGift() {
  const token = encodeURIComponent(pendingClaim.value.claimToken || '')
  const pid = encodeURIComponent(pendingClaim.value.productId || '')
  if (!token || !pid) return
  okShow.value = false
  uni.navigateTo({
    url: `/pages/order/confirm?type=lottery&productId=${pid}&claimToken=${token}&entryFrom=checkin`,
  })
}

/** 进首页刷新待兑凭证，避免只显示「已签到」 */
onMounted(async () => {
  if (!USE_REMOTE || !authed.value || !getToken()) return
  try {
    const st = await fetchCheckinStatus()
    if (!st) return
    session.checkin.todayDone = !!st.todayDone
    if (st.streak != null) session.checkin.streak = Number(st.streak) || 0
    if (st.dayIndex != null) session.checkin.dayIndex = Number(st.dayIndex) || 1
    if (Array.isArray(st.rewards) && st.rewards.length) {
      session.checkin.rewards = st.rewards.map((x) => ({
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
    const todayR = (Array.isArray(st.rewards) ? st.rewards : []).find(
      (x) => Number(x.day) === Number(st.dayIndex || session.checkin.dayIndex || 1)
    )
    const todayGift =
      todayR &&
      (todayR.type === 'gift' || todayR.type === 'physical' || todayR.type === 'product') &&
      todayR.giftId
    if (
      todayGift &&
      st.pendingGiftClaim &&
      st.pendingGiftClaim.claimToken &&
      String(st.pendingGiftClaim.productId || '').trim() === String(todayR.giftId).trim()
    ) {
      session.checkin.pendingGiftClaim = {
        claimToken: st.pendingGiftClaim.claimToken || '',
        productId: st.pendingGiftClaim.productId || '',
        name: st.pendingGiftClaim.name || '',
      }
    } else {
      session.checkin.pendingGiftClaim = null
    }
  } catch (_) {}
})

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

function isGift(r) {
  return (r && r.type) === 'gift'
}

/** 仅当待兑 SKU 属于签到配置中的实物档，才当签到礼（防止准点/抽奖实物污染） */
function isCheckinGiftProduct(productId) {
  const pid = String(productId || '').trim()
  if (!pid) return false
  return rewards.value.some((r) => isGift(r) && String(r.giftId || '').trim() === pid)
}

const todayRewardRow = computed(() =>
  rewards.value.find((x) => x.day === session.checkin.dayIndex)
)

const todayIsGift = computed(() => isGift(todayRewardRow.value))

/** 仅「今日实物档 + 待兑 SKU 就是今日礼品」才顶主 CTA；能量日不劫持 */
const hasPendingGift = computed(() => {
  const p = session.checkin.pendingGiftClaim
  if (!(p && p.claimToken && p.productId)) return false
  if (!todayIsGift.value) return false
  const todayGid = String((todayRewardRow.value && todayRewardRow.value.giftId) || '').trim()
  if (!todayGid) return isCheckinGiftProduct(p.productId)
  return String(p.productId).trim() === todayGid
})

const ctaLabel = computed(() => {
  // 仅真实签到实物待兑才引导填地址；能量日绝不显示领礼品
  if (hasPendingGift.value) {
    return '去填写地址领礼品'
  }
  if (session.checkin.todayDone) {
    return payload.value.ctaDone || '今日已签到'
  }
  const base = payload.value.ctaTodo || '签到'
  return todayReward.value ? `${base} ${todayReward.value}` : base
})

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
    '/static/ui/ico-coin.jpg'
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
  if (r.pendingGiftClaim && (r.pendingGiftClaim.claimToken || r.claimToken)) {
    const pid = r.pendingGiftClaim.productId || r.productId || ''
    // 能量签到不应带上脏实物凭证
    if (pid && (isGift(r.reward) || isCheckinGiftProduct(pid))) {
      session.checkin.pendingGiftClaim = {
        claimToken: r.pendingGiftClaim.claimToken || r.claimToken || '',
        productId: pid,
        name: r.pendingGiftClaim.name || '',
      }
    } else {
      session.checkin.pendingGiftClaim = null
    }
  } else if (r.claimToken && r.productId && (isGift(r.reward) || isCheckinGiftProduct(r.productId))) {
    session.checkin.pendingGiftClaim = {
      claimToken: r.claimToken,
      productId: r.productId,
      name: (r.reward && r.reward.label) || '',
    }
  } else if (!isGift(r.reward)) {
    session.checkin.pendingGiftClaim = null
  }
  if (r.wallet) {
    session.user.energy = r.wallet.energy
    if (r.wallet.lotteryChance != null) session.user.lotteryChance = r.wallet.lotteryChance
  }
}

function showOk(msg, claim) {
  okMessage.value = msg || `连签 ${session.checkin.streak || 1} 天`
  pendingClaim.value = {
    claimToken: (claim && claim.claimToken) || '',
    productId: (claim && claim.productId) || '',
  }
  okSub.value = pendingClaim.value.claimToken
    ? '获得实物礼品，请填写地址兑奖'
    : '奖励已到账'
  okShow.value = true
}

async function refreshPendingFromServer() {
  if (!USE_REMOTE || !getToken()) return null
  try {
    const st = await fetchCheckinStatus()
    if (!st) return null
    session.checkin.todayDone = !!st.todayDone
    if (st.streak != null) session.checkin.streak = Number(st.streak) || 0
    if (st.dayIndex != null) session.checkin.dayIndex = Number(st.dayIndex) || 1
    const todayR = rewards.value.find((x) => x.day === session.checkin.dayIndex)
    const todayGid = todayR && isGift(todayR) ? String(todayR.giftId || '').trim() : ''
    if (
      todayGid &&
      st.pendingGiftClaim &&
      st.pendingGiftClaim.claimToken &&
      String(st.pendingGiftClaim.productId || '').trim() === todayGid
    ) {
      session.checkin.pendingGiftClaim = {
        claimToken: st.pendingGiftClaim.claimToken || '',
        productId: st.pendingGiftClaim.productId || '',
        name: st.pendingGiftClaim.name || '',
      }
    } else {
      session.checkin.pendingGiftClaim = null
    }
    return session.checkin.pendingGiftClaim
  } catch (_) {
    return null
  }
}

async function onTap() {
  if (authed.value && hasPendingGift.value) {
    // 有待兑签到实物：进确认页填地址
    const pending = session.checkin.pendingGiftClaim
    pendingClaim.value = {
      claimToken: pending.claimToken,
      productId: pending.productId,
    }
    goClaimGift()
    return
  }
  if (session.checkin.todayDone && authed.value) {
    // 能量日已签到：不要再去兑其它实物；仅今日是实物档才复查待兑
    if (todayIsGift.value) {
      uni.showLoading({ title: '查兑奖状态…', mask: true })
      const pending = await refreshPendingFromServer()
      uni.hideLoading()
      if (pending && pending.claimToken && pending.productId && isCheckinGiftProduct(pending.productId)) {
        pendingClaim.value = {
          claimToken: pending.claimToken,
          productId: pending.productId,
        }
        goClaimGift()
        return
      }
    }
    uni.showToast({
      title: todayIsGift.value
        ? '今日已签到。若有实物请到「中奖记录」领取'
        : '今日已签到，能量已到账',
      icon: 'none',
      duration: 2200,
    })
    return
  }
  if (USE_REMOTE) {
    if (!requireAuth()) return
    if (!getToken()) return
    try {
      const r = await apiCheckin()
      applyCheckinResult(r)
      const giftOk = isGift(r.reward)
      showOk(r.msg || `签到成功 · 连签 ${session.checkin.streak} 天`, giftOk
        ? {
            claimToken: r.claimToken || (r.pendingGiftClaim && r.pendingGiftClaim.claimToken) || '',
            productId: r.productId || (r.pendingGiftClaim && r.pendingGiftClaim.productId) || '',
          }
        : null)
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

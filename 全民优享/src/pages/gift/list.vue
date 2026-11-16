<template>
  <view class="yx-page gift-list yx-safe-bottom">
    <view class="intro">
      <text class="title">{{ pageName }}</text>
      <text class="lead">能量值不够？可「能量值+现金」组合兑，门槛更柔、礼更快到手</text>
      <view v-if="modes.length" class="modes">
        <text
          v-for="m in modes"
          :key="m.key"
          class="mode"
          :class="{ on: filter === m.key }"
          @click="filter = m.key"
        >{{ m.label }}</text>
      </view>
    </view>

    <view
      v-for="g in filtered"
      :key="g.id"
      class="gift"
      @click="goDetail(g.id)"
    >
      <view class="cover">
        <CmsImage
          v-if="g.imageUrl"
          :src="g.imageUrl"
          mode="aspectFill"
          placeholder="/static/ui/ico-gift.jpg"
          :show-placeholder="true"
        />
        <view v-else class="cover-fallback" :class="'tone-' + (g.coverTone || 'mint')">
          <text class="cover-letter">{{ (g.name || '?').slice(0, 1) }}</text>
        </view>
        <text v-if="g.firstWave" class="wave">首兑</text>
        <text v-if="mixOf(g).payMode === 'mix'" class="mix-flag">组合兑</text>
      </view>
      <view class="body">
        <view class="top">
          <text class="name">{{ g.name }}</text>
          <text v-if="g.tag" class="tag">{{ g.tag }}</text>
        </view>
        <text class="desc">{{ g.desc || gateExtra(g) }}</text>
        <view class="foot">
          <PriceMix :item="g" size="md" />
          <button
            class="cta"
            :class="{ mute: !!gateBlocked(g), busy: redeemingId === g.id }"
            :loading="redeemingId === g.id"
            @click.stop="onRedeem(g)"
          >{{ ctaText(g) }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { gifts as mockGifts } from '../../mock/data.js'
import { appConfig } from '../../store/appConfig.js'
import { session } from '../../store/session.js'
import { fetchGifts } from '../../api/commerce.js'
import { USE_REMOTE } from '../../api/request.js'
import { resolvePayMix } from '../../utils/payMix.js'
import { resolveLinkEntryTitle, LINK_TITLE_FALLBACK } from '../../utils/entrySlots.js'
import { assertLoginThenEnergy, currentEnergy } from '../../utils/energyGate.js'
import { currentPagePath } from '../../utils/loginGate.js'
import { loadAddresses, defaultAddress } from '../../store/address.js'
import { goConfirm, placeOrder, payOrder } from '../../store/order.js'
import CmsImage from '../../components/CmsImage.vue'
import PriceMix from '../../components/PriceMix.vue'
import { bindPullRefresh } from '../../utils/pullRefresh.js'
import { usePageShare } from '../../utils/share.js'

const filter = ref('all')
const remoteGifts = ref([])
const redeemingId = ref('')
const pageName = computed(
  () => resolveLinkEntryTitle('gift', appConfig.pages) || LINK_TITLE_FALLBACK.gift || '兑好礼'
)
usePageShare({ channel: 'share_gift' })
const MODE_LABEL = {
  growth: '养成',
  points: '能量值',
  points_invite: '邀人',
  points_streak: '连签',
  points_cash: '组合兑',
}
const MODE_ORDER = ['growth', 'points', 'points_invite', 'points_streak', 'points_cash']

/** 分类只来自兑好礼上架的 mode；不足两种时整条不展示 */
const modes = computed(() => {
  const present = new Set()
  for (const g of allGifts.value) {
    const key = g && g.mode && MODE_LABEL[g.mode] ? g.mode : ''
    if (key) present.add(key)
  }
  if (present.size < 2) return []
  return [
    { key: 'all', label: '全部' },
    ...MODE_ORDER.filter((k) => present.has(k)).map((k) => ({ key: k, label: MODE_LABEL[k] })),
  ]
})

const allGifts = computed(() => {
  if (remoteGifts.value.length) return remoteGifts.value
  if (appConfig.catalog && appConfig.catalog.gifts && appConfig.catalog.gifts.length) {
    return appConfig.catalog.gifts
  }
  return mockGifts
})

const filtered = computed(() => {
  if (filter.value === 'all') return allGifts.value
  if (filter.value === 'points_cash') {
    return allGifts.value.filter((g) => {
      const m = resolvePayMix(g)
      return m.payMode === 'mix' || g.mode === 'points_cash'
    })
  }
  return allGifts.value.filter((g) => g.mode === filter.value)
})

function applyNavTitle() {
  uni.setNavigationBarTitle({ title: pageName.value })
}

async function reloadGifts() {
  applyNavTitle()
  if (!USE_REMOTE) return
  try {
    const data = await fetchGifts()
    remoteGifts.value = data.list || []
  } catch (e) {}
}

watch(modes, (list) => {
  if (!list.some((m) => m.key === filter.value)) filter.value = 'all'
})

onMounted(reloadGifts)
onShow(applyNavTitle)
bindPullRefresh(reloadGifts)

function mixOf(g) {
  return resolvePayMix(g || {})
}

function gateExtra(g) {
  const parts = []
  if (g.needInvite) parts.push(`邀 ${g.needInvite} 人`)
  if (g.needStreak) parts.push(`连签 ${g.needStreak} 天`)
  if (g.costEnergy) parts.push('养成满兑')
  return parts.join(' · ')
}

function gateBlocked(g) {
  if (!g) return ''
  const streak = session.checkin.streak || 0
  const invites = session.user.validInviteCount || 0
  const energy = session.user.energy || session.user.points || 0
  const mix = resolvePayMix(g)
  if (g.mode === 'growth' && session.growth && session.growth.current < 100) {
    return `还差进度 ${100 - session.growth.current}%`
  }
  if (g.needStreak && streak < g.needStreak) return `还差连签 ${g.needStreak - streak} 天`
  if (g.needInvite && invites < g.needInvite) return `还差邀 ${g.needInvite - invites} 人`
  if (mix.payPoints && energy < mix.payPoints) {
    return `还差 ${mix.payPoints - energy} 能量值`
  }
  return ''
}

function ctaText(g) {
  if (redeemingId.value === g.id) return '兑换中'
  const blocked = gateBlocked(g)
  if (blocked) return blocked
  return '去兑换'
}

function goDetail(id) {
  uni.navigateTo({ url: `/pages/gift/detail?id=${id}&from=gift_center` })
}

/** 列表「去兑换」：有默认地址则直接下单+支付；否则只跳确认页选地址 */
async function onRedeem(g) {
  if (!g || redeemingId.value) return
  const blocked = gateBlocked(g)
  const need = Number(mixOf(g).payPoints || 0) || 0
  const gate = await assertLoginThenEnergy({
    need,
    redirectPath: currentPagePath() || '/pages/gift/list',
    action: '兑换',
    loginToast: '请先登录后再兑换',
  })
  if (!gate.ok) return
  if (blocked && !/能量/.test(blocked)) {
    uni.showToast({ title: blocked, icon: 'none' })
    return
  }
  if (need > 0 && currentEnergy() < need) return

  if (appConfig.risk && appConfig.risk.fused) {
    uni.showToast({
      title: (appConfig.risk && appConfig.risk.fuseToast) || '激励通道已熔断，暂不可兑礼',
      icon: 'none',
    })
    return
  }

  try {
    await loadAddresses()
  } catch (_) {}
  const addr = defaultAddress()
  if (!addr || !addr.id) {
    goConfirm({ type: 'gift', productId: g.id, entryFrom: 'gift_center' })
    return
  }

  const mix = mixOf(g)
  redeemingId.value = g.id
  uni.showLoading({ title: '兑换中', mask: true })
  try {
    const r = await placeOrder({
      orderType: 'gift',
      productId: g.id,
      productName: g.name,
      qty: 1,
      addressId: addr.id,
      address: addr,
      payPoints: mix.payPoints,
      payCashCent: mix.payCashCent,
      entryFrom: 'gift_center',
    })
    if (!r.ok) {
      uni.showToast({ title: r.msg || '兑换失败', icon: 'none' })
      return
    }
    const orderNo = r.orderNo || (r.order && (r.order.orderNo || r.order.id))
    const detailKey = orderNo || (r.order && r.order.id)
    if ((r.needWxPay || mix.payCashCent > 0) && orderNo) {
      const pay = await payOrder(orderNo)
      if (!pay.ok) {
        uni.showToast({ title: pay.msg || '未完成支付', icon: 'none' })
        setTimeout(() => {
          uni.navigateTo({ url: `/pages/order/detail?id=${encodeURIComponent(detailKey)}` })
        }, 600)
        return
      }
      if (pay.pendingConfirm) {
        uni.showToast({ title: pay.msg || '支付确认中', icon: 'none' })
      } else {
        uni.showToast({ title: '兑换成功', icon: 'success' })
      }
    } else {
      uni.showToast({ title: '兑换成功', icon: 'success' })
    }
    await reloadGifts()
    setTimeout(() => {
      uni.navigateTo({ url: `/pages/order/detail?id=${encodeURIComponent(detailKey)}` })
    }, 400)
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '兑换失败', icon: 'none' })
  } finally {
    uni.hideLoading()
    redeemingId.value = ''
  }
}
</script>

<style scoped lang="scss">
.gift-list {
  padding: 24rpx 28rpx 48rpx;
  background: #f6f7fb;
  min-height: 100vh;
}

.intro {
  margin-bottom: 20rpx;
  padding: 28rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #fff1f2 0%, #fff7ed 100%);
}

.title {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
  color: #111827;
}

.lead {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #9f1239;
  line-height: 1.45;
}

.modes {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}

.mode {
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.85);
  font-size: 22rpx;
  color: #6b7280;
}

.mode.on {
  background: #e11d48;
  color: #fff;
  font-weight: 700;
}

.gift {
  position: relative;
  display: flex;
  gap: 20rpx;
  margin-bottom: 16rpx;
  padding: 18rpx;
  background: #fff;
  border-radius: 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(17, 24, 39, 0.05);
}

.wave,
.mix-flag {
  position: absolute;
  font-size: 18rpx;
  font-weight: 700;
  padding: 4rpx 10rpx;
  border-radius: 8rpx;
  color: #fff;
}
.wave {
  left: 8rpx;
  top: 8rpx;
  background: #f97316;
}
.mix-flag {
  right: 8rpx;
  bottom: 8rpx;
  background: #e11d48;
}

.cover {
  width: 180rpx;
  height: 180rpx;
  border-radius: 16rpx;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
  background: #f3f4f6;
}
.cover :deep(.cms-img),
.cover :deep(.cms-ph) {
  width: 100%;
  height: 100%;
}

.cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tone-peach { background: #ffe0d4; }
.tone-mint { background: #d8f6f2; }
.tone-lilac { background: #ebe4ff; }
.tone-sun { background: #ffe9c9; }
.tone-coral { background: #ffd5cf; }

.cover-letter {
  font-size: 64rpx;
  font-weight: 800;
  color: rgba(43, 37, 32, 0.25);
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.top {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.name {
  font-size: 30rpx;
  font-weight: 700;
  color: #111827;
}

.tag {
  font-size: 18rpx;
  color: #e11d48;
  background: #fff1f2;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  font-weight: 700;
}

.desc {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #6b7280;
  line-height: 1.4;
  height: 60rpx;
  overflow: hidden;
}

.foot {
  margin-top: auto;
  padding-top: 12rpx;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12rpx;
}

.cta {
  flex-shrink: 0;
  margin: 0;
  padding: 0 22rpx;
  height: 56rpx;
  line-height: 56rpx;
  border-radius: 999rpx;
  background: #111827;
  color: #fff;
  font-size: 22rpx;
  font-weight: 700;
  border: none;
  max-width: 240rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cta::after {
  border: none;
}
.cta.mute {
  background: #e5e7eb;
  color: #6b7280;
  font-weight: 600;
}
.cta.busy {
  opacity: 0.85;
}
</style>

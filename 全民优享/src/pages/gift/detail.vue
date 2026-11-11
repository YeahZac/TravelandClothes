<template>
  <view class="yx-page detail yx-safe-bottom" v-if="gift">
    <view class="cover">
      <CmsImage
        v-if="gift.imageUrl"
        class="cover-img"
        :src="gift.imageUrl"
        mode="aspectFill"
        placeholder="/static/ui/ico-gift.png"
      />
      <view v-else class="cover-fallback" :class="'tone-' + (gift.coverTone || 'mint')">
        <text class="big">{{ (gift.name || '?').slice(0, 1) }}</text>
      </view>
    </view>
    <view class="panel">
      <view class="price-box">
        <PriceMix :item="gift" size="lg" :badge="gift.tag || ''" />
        <view v-if="mix.payMode === 'mix'" class="mix-tip">
          先扣能量值，差额微信支付，下单即锁库存
        </view>
      </view>
      <text class="name">{{ gift.name }}</text>
      <text class="desc">{{ gift.desc || '' }}</text>
      <view class="meta">
        <text v-if="!hideFlashStock && gift.stock != null">库存 {{ gift.stock }}</text>
        <text>公司代发 · 可查物流</text>
      </view>
      <view class="rules">
        <text class="rt">兑礼说明</text>
        <text class="rl">· 兑换价：{{ mix.label }}</text>
        <text v-if="gift.needInvite" class="rl">· 需有效邀请 {{ gift.needInvite }} 人</text>
        <text v-if="gift.needStreak" class="rl">· 需连续签到 {{ gift.needStreak }} 天</text>
        <text v-if="gift.costEnergy" class="rl">· 需养成进度满 / 能量满兑</text>
        <text class="rl">· 需填写收货地址，下单后「我的订单」可查发货</text>
        <text v-if="mix.payCashCent" class="rl">· 含现金部分将调起微信支付</text>
      </view>
      <button
        class="submit"
        :class="gateBlocked ? 'mute' : ''"
        @click="onRedeem"
      >{{ gateBlocked || (mix.payCashCent ? '能量值+微信支付兑换' : mix.ctaText) }}</button>
    </view>
  </view>
  <view v-else-if="loading" class="yx-page empty">加载中…</view>
  <view v-else class="yx-page empty">未找到该礼品</view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { gifts as mockGifts } from '../../mock/data.js'
import { session } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { fetchGifts, fetchOffer } from '../../api/commerce.js'
import { goConfirm } from '../../store/order.js'
import { USE_REMOTE, getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { resolvePayMix } from '../../utils/payMix.js'
import CmsImage from '../../components/CmsImage.vue'
import PriceMix from '../../components/PriceMix.vue'

const gift = ref(null)
const loading = ref(true)
const hideFlashStock = ref(false)
const payOverride = ref(null)
const mix = computed(() => {
  const base = gift.value || {}
  const ov = payOverride.value
  if (ov && (ov.payPoints > 0 || ov.payCashCent > 0 || ov.force)) {
    return resolvePayMix({
      ...base,
      payPoints: ov.payPoints,
      payCashCent: ov.payCashCent,
      costPoints: ov.payPoints,
      needCash: ov.payCashCent,
    })
  }
  return resolvePayMix(base)
})

function mapOffer(hit) {
  if (!hit) return null
  return {
    id: hit.id || hit.productId,
    name: hit.name || hit.productId || '',
    imageUrl: hit.imageUrl || '',
    desc: hit.desc || hit.tag || '',
    stock: hit.stock,
    tag: hit.tag || '',
    coverTone: hit.coverTone || 'mint',
    payPoints: hit.payPoints != null ? hit.payPoints : hit.costPoints,
    costPoints: hit.costPoints != null ? hit.costPoints : hit.payPoints,
    payCashCent: hit.payCashCent != null ? hit.payCashCent : hit.needCash,
    needCash: hit.needCash != null ? hit.needCash : hit.payCashCent,
    listPriceCent: hit.listPriceCent,
    listPriceYuan: hit.listPriceYuan,
    payMode: hit.payMode,
    payLabel: hit.payLabel || hit.priceText,
    needInvite: hit.needInvite,
    needStreak: hit.needStreak,
    costEnergy: hit.costEnergy,
    mode: hit.mode,
  }
}

async function resolveById(id) {
  if (!id) return null
  const catalog = appConfig.catalog || {}
  const gifts = catalog.gifts || []
  const products = catalog.products || []
  let hit =
    gifts.find((g) => String(g.id) === String(id)) ||
    products.find((p) => String(p.id) === String(id)) ||
    mockGifts.find((g) => String(g.id) === String(id))
  if (hit) return mapOffer(hit)

  if (USE_REMOTE) {
    try {
      const data = await fetchOffer(id)
      const o = data && data.offer
      if (o && o.found !== false && (o.name || o.imageUrl) && String(o.name) !== String(o.id || id)) {
        return mapOffer(o)
      }
      if (o && o.found === true) return mapOffer(o)
    } catch (e) {}
    try {
      const data = await fetchGifts()
      hit = (data.list || []).find((g) => String(g.id) === String(id))
      if (hit) return mapOffer(hit)
    } catch (e) {}
  }
  return null
}

onLoad(async (q) => {
  loading.value = true
  hideFlashStock.value = String(q.from || '') === 'flash'
  if (q.payPoints != null || q.payCashCent != null) {
    payOverride.value = {
      payPoints: Math.max(0, Number(q.payPoints) || 0),
      payCashCent: Math.max(0, Number(q.payCashCent) || 0),
      force: true,
    }
  }
  const id = q.id || q.productId || ''
  gift.value = await resolveById(id)
  // 禁止回落到「列表第一件」——对不上入口礼品
  loading.value = false
  if (!gift.value) {
    uni.showToast({ title: '礼品不存在或已下架', icon: 'none' })
  }
})

const gateBlocked = computed(() => {
  const g = gift.value
  if (!g) return ''
  const streak = session.checkin.streak || 0
  const invites = session.user.validInviteCount || 0
  const energy = session.user.energy || session.user.points || 0
  const m = mix.value
  if (g.mode === 'growth' && session.growth.current < 100) {
    return `还差进度 ${100 - session.growth.current}%`
  }
  if (g.needStreak && streak < g.needStreak) return `还差连签 ${g.needStreak - streak} 天`
  if (g.needInvite && invites < g.needInvite) return `还差邀 ${g.needInvite - invites} 人`
  if (m.payPoints && energy < m.payPoints) return `还差 ${m.payPoints - energy} 能量值`
  return ''
})

function onRedeem() {
  const g = gift.value
  if (!g) return
  if (USE_REMOTE && !(getToken() && isLoggedIn())) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => uni.navigateTo({ url: '/pages/login/index' }), 400)
    return
  }
  if (gateBlocked.value) {
    uni.showToast({ title: gateBlocked.value, icon: 'none' })
    return
  }
  const q = { type: 'gift', productId: g.id }
  if (payOverride.value) {
    q.payPoints = payOverride.value.payPoints
    q.payCashCent = payOverride.value.payCashCent
  }
  goConfirm(q)
}
</script>

<style scoped lang="scss">
.detail {
  padding-bottom: 48rpx;
  background: #f6f7fb;
  min-height: 100vh;
}
.empty {
  padding: 120rpx;
  text-align: center;
  color: #9ca3af;
}
.cover {
  height: 560rpx;
  background: #fff;
  overflow: hidden;
}
.cover-img {
  width: 100%;
  height: 100%;
}
.cover-fallback {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e8f5ef;
}
.big {
  font-size: 120rpx;
  font-weight: 800;
  color: #059669;
}
.panel {
  margin: -40rpx 24rpx 0;
  padding: 32rpx 28rpx 48rpx;
  background: #fff;
  border-radius: 28rpx;
  position: relative;
  z-index: 1;
}
.price-box {
  margin-bottom: 16rpx;
}
.mix-tip {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #9ca3af;
}
.name {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  color: #111827;
}
.desc {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #6b7280;
  line-height: 1.5;
}
.meta {
  margin-top: 16rpx;
  display: flex;
  gap: 24rpx;
  font-size: 22rpx;
  color: #9ca3af;
}
.rules {
  margin-top: 28rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid #f3f4f6;
}
.rt {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  margin-bottom: 12rpx;
}
.rl {
  display: block;
  font-size: 24rpx;
  color: #6b7280;
  line-height: 1.6;
  margin-bottom: 6rpx;
}
.submit {
  margin-top: 36rpx;
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 999rpx;
  background: #e11d48;
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
  border: none;
}
.submit::after {
  border: none;
}
.submit.mute {
  background: #d1d5db;
  color: #6b7280;
}
</style>

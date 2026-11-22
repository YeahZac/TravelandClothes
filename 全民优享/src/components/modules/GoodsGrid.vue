<template>
  <view>
    <view class="head">
      <text class="title">{{ mod.title || '优享好物' }}</text>
      <text class="sub">能量值可抵 · 现金可补 · 组合更划算</text>
    </view>
    <view v-if="!items.length" class="empty">商品上架后显示在这里</view>
    <view v-else class="grid">
      <view v-for="g in items" :key="g.id" class="goods" @click="onOpen(g)">
        <view class="cover">
          <CmsImage
            :src="coverRaw(g)"
            mode="aspectFill"
            placeholder="/static/ui/ico-gift.jpg"
            :show-placeholder="true"
          />
          <text v-if="g.tag" class="tag">{{ g.tag }}</text>
          <text v-if="mixOf(g).payMode === 'mix'" class="ribbon">组合兑</text>
        </view>
        <text class="name">{{ g.name }}</text>
        <view class="price-wrap">
          <PriceMix :item="g" size="sm" />
          <button
            class="buy-tag"
            :class="{ busy: redeemingId === g.id }"
            :loading="redeemingId === g.id"
            @click.stop="onBuy(g)"
          >{{ redeemingId === g.id ? '兑换中' : mixOf(g).ctaText }}</button>
        </view>
      </view>
    </view>
    <view v-if="browseCta" class="browse-bar">
      <text class="browse-t">浏览 15 秒，养成 +3%</text>
      <button class="yx-btn-ghost" @click="onBrowse">{{ browseCta }}</button>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { browseMallDone } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { resolveImageSrc } from '../../utils/resolveMedia.js'
import { resolvePayMix } from '../../utils/payMix.js'
import { assertLoginThenEnergy, currentEnergy } from '../../utils/energyGate.js'
import { currentPagePath } from '../../utils/loginGate.js'
import { loadAddresses, defaultAddress } from '../../store/address.js'
import { goConfirm, placeOrder, payOrder } from '../../store/order.js'
import { safeShowToast, safeShowLoading, safeHideLoading } from '../../utils/safeUi.js'
import CmsImage from '../CmsImage.vue'
import PriceMix from '../PriceMix.vue'

const props = defineProps({ mod: Object })
const p = computed(() => props.mod.payload || {})
const items = computed(() => p.value.items || [])
const browseCta = computed(() => p.value.browseCta || '')
const redeemingId = ref('')

function coverRaw(g) {
  return resolveImageSrc(g && g.imageUrl)
}

function mixOf(g) {
  return resolvePayMix(g || {})
}

function onBrowse() {
  uni.showLoading({ title: '浏览中…' })
  setTimeout(() => {
    uni.hideLoading()
    uni.showToast({ title: browseMallDone().msg, icon: 'none' })
  }, 1000)
}

function onOpen(g) {
  if (!g || !g.id) return
  uni.navigateTo({ url: `/pages/mall/detail?id=${encodeURIComponent(g.id)}` })
}

/** 列表 CTA：有默认地址则直接扣能量+支付；否则进确认页选地址（不进详情） */
async function onBuy(g) {
  if (!g || !g.id || redeemingId.value) return
  const mix = mixOf(g)
  const need = Number(mix.payPoints || 0) || 0
  // 立刻给反馈，避免云调用卡住时像「按钮没反应」；本地余额秒开，服务端下单仍校验
  redeemingId.value = g.id
  const gate = await assertLoginThenEnergy({
    need,
    redirectPath: currentPagePath() || '/pages/mall/index',
    action: '下单',
    loginToast: '请先登录后再下单',
    preferLocal: true,
  })
  if (!gate.ok) {
    redeemingId.value = ''
    return
  }
  if (need > 0 && currentEnergy() < need) {
    redeemingId.value = ''
    return
  }

  if (appConfig.risk && appConfig.risk.fused && need > 0) {
    redeemingId.value = ''
    safeShowToast({
      title: (appConfig.risk && appConfig.risk.fuseToast) || '激励通道已熔断，暂不可兑',
      icon: 'none',
    })
    return
  }

  try {
    await loadAddresses()
  } catch (_) {}
  const addr = defaultAddress()
  if (!addr || !addr.id) {
    redeemingId.value = ''
    goConfirm({ type: 'mall', productId: g.id, qty: 1, entryFrom: 'mall' })
    return
  }

  safeShowLoading({ title: '下单中', mask: true })
  try {
    const r = await placeOrder({
      orderType: 'mall',
      productId: g.id,
      productName: g.name,
      qty: 1,
      addressId: addr.id,
      address: addr,
      payPoints: mix.payPoints,
      payCashCent: mix.payCashCent,
      entryFrom: 'mall',
    })
    if (!r.ok) {
      safeShowToast({ title: r.msg || '下单失败', icon: 'none' })
      return
    }
    const orderNo = r.orderNo || (r.order && (r.order.orderNo || r.order.id))
    const detailKey = orderNo || (r.order && r.order.id)
    if ((r.needWxPay || mix.payCashCent > 0) && orderNo) {
      const pay = await payOrder(orderNo)
      if (!pay.ok) {
        safeShowToast({ title: pay.msg || '未完成支付', icon: 'none' })
        setTimeout(() => {
          uni.navigateTo({ url: `/pages/order/detail?id=${encodeURIComponent(detailKey)}` })
        }, 600)
        return
      }
      if (pay.pendingConfirm) {
        safeShowToast({ title: pay.msg || '支付确认中', icon: 'none' })
      } else {
        safeShowToast({ title: '下单成功', icon: 'success' })
      }
    } else {
      safeShowToast({ title: '下单成功', icon: 'success' })
    }
    setTimeout(() => {
      uni.navigateTo({ url: `/pages/order/detail?id=${encodeURIComponent(detailKey)}` })
    }, 400)
  } catch (e) {
    safeShowToast({ title: (e && e.message) || '下单失败', icon: 'none' })
  } finally {
    safeHideLoading()
    redeemingId.value = ''
  }
}
</script>

<style scoped>
.head {
  margin-bottom: 16rpx;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}
.title {
  font-size: 32rpx;
  font-weight: 700;
  color: #111827;
}
.sub {
  font-size: 20rpx;
  color: #e11d48;
  font-weight: 600;
}
.empty {
  padding: 28rpx 8rpx 8rpx;
  font-size: 24rpx;
  color: #6b7280;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx 14rpx;
}
.goods {
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  padding-bottom: 18rpx;
  box-shadow: 0 6rpx 20rpx rgba(17, 24, 39, 0.06);
}
.cover {
  height: 340rpx;
  background: #f3f4f6;
  position: relative;
  overflow: hidden;
}
.cover :deep(.cms-img),
.cover :deep(.cms-ph) {
  width: 100%;
  height: 100%;
  display: block;
}
.tag {
  position: absolute;
  left: 0;
  top: 16rpx;
  padding: 6rpx 14rpx;
  border-radius: 0 999rpx 999rpx 0;
  background: linear-gradient(90deg, #e11d48, #f97316);
  color: #fff;
  font-size: 20rpx;
  font-weight: 700;
}
.ribbon {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 6rpx 12rpx;
  background: rgba(17, 24, 39, 0.82);
  color: #fff;
  font-size: 18rpx;
  font-weight: 700;
}
.name {
  display: block;
  margin: 14rpx 14rpx 0;
  font-size: 26rpx;
  font-weight: 600;
  color: #111827;
  line-height: 1.35;
  height: 70rpx;
  overflow: hidden;
}
.price-wrap {
  margin: 8rpx 14rpx 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 8rpx;
}
.buy-tag {
  flex-shrink: 0;
  margin: 0;
  font-size: 18rpx;
  color: #fff;
  background: #e11d48;
  padding: 0 12rpx;
  height: 44rpx;
  line-height: 44rpx;
  border-radius: 8rpx;
  font-weight: 700;
  border: none;
  max-width: 180rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.buy-tag::after {
  border: none;
}
.buy-tag.busy {
  opacity: 0.85;
}
.browse-bar {
  margin-top: 48rpx;
  height: 96rpx;
  background: #fff;
  border-top: 1rpx solid #e6e8ee;
  border-radius: 20rpx;
  padding: 0 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.browse-t {
  font-size: 26rpx;
  color: #121826;
}
.yx-btn-ghost {
  margin: 0;
  height: 56rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  border: 2rpx solid #121826;
  background: transparent;
  color: #121826;
  font-size: 22rpx;
  font-weight: 600;
  line-height: 52rpx;
}
.yx-btn-ghost::after {
  border: none;
}
</style>

<template>
  <view class="page" v-if="ready">
    <view class="card addr" @click="pickAddress">
      <view v-if="addr">
        <view class="row1">
          <text class="name">{{ addr.name }}</text>
          <text class="phone">{{ addr.phone }}</text>
        </view>
        <text class="full">{{ addr.full || addr.detail }}</text>
      </view>
      <view v-else class="addr-empty">
        <text class="ae">请选择收货地址</text>
      </view>
      <text class="chev">›</text>
    </view>

    <view class="card goods">
      <CmsImage class="cover" :src="product.imageUrl" mode="aspectFit" placeholder="/static/ui/ico-gift.png" />
      <view class="gbody">
        <text class="gname">{{ product.name }}</text>
        <text class="gsub">{{ typeLabel }} · 数量 ×{{ qty }}</text>
        <PriceMix :item="product" :qty="qty" size="md" />
        <view class="stepper" v-if="orderType === 'mall'">
          <text class="sp" @click="qty = Math.max(1, qty - 1)">－</text>
          <text class="n">{{ qty }}</text>
          <text class="sp" @click="qty = Math.min(99, qty + 1)">＋</text>
        </view>
      </view>
    </view>

    <view class="card bill">
      <view class="line" v-if="mix.showList">
        <text>划线原价</text>
        <text class="strike">¥{{ mix.listPriceYuan.toFixed(mix.listPriceYuan % 1 ? 2 : 0) }}</text>
      </view>
      <view class="line" v-if="mix.payPoints">
        <text>能量值支付</text>
        <text class="em">{{ mix.payPoints }} 能量值</text>
      </view>
      <view class="line" v-if="mix.payCashCent">
        <text>微信支付</text>
        <text class="em">¥{{ (mix.payCashCent / 100).toFixed(2) }}</text>
      </view>
      <view class="line" v-if="!mix.payPoints && !mix.payCashCent">
        <text>应付</text>
        <text class="em">免费</text>
      </view>
      <view class="line tip"><text>履约</text><text>公司代发 · 后台可改状态</text></view>
      <view v-if="mix.payMode === 'mix'" class="mix-note">组合支付：先扣能量值，再拉起微信支付补差价</view>
    </view>

    <view class="dock">
      <view class="dock-l">
        <text class="pay">{{ dockPay }}</text>
        <text class="mute">{{ submitHint }}</text>
      </view>
      <button class="cta" :loading="submitting" @click="submit">{{ submitLabel }}</button>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { appConfig } from '../../store/appConfig.js'
import { session } from '../../store/session.js'
import { addressState, loadAddresses, defaultAddress } from '../../store/address.js'
import { placeOrder, payOrder } from '../../store/order.js'
import { gifts as mockGifts, mallGoods as mockMall } from '../../mock/data.js'
import { fetchGifts } from '../../api/commerce.js'
import { redeemStage } from '../../store/jar.js'
import { request, USE_REMOTE, actionId, getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { resolvePayMix } from '../../utils/payMix.js'
import CmsImage from '../../components/CmsImage.vue'
import PriceMix from '../../components/PriceMix.vue'

const ready = ref(false)
const orderType = ref('mall')
const productId = ref('')
const claimToken = ref('')
const qty = ref(1)
const fromCart = ref(false)
const product = ref({})
const giftMeta = ref(null)
const addr = ref(null)
const submitting = ref(false)
/** 准点等渠道覆盖兑价（query 传入） */
const payOverride = ref(null)

const typeLabel = computed(() => {
  return (
    {
      mall: '商城购买',
      gift: '能量值兑礼',
      jar: '能量罐兑礼',
      lottery: '抽奖实物',
    }[orderType.value] || '兑换'
  )
})

const mix = computed(() => {
  if (orderType.value === 'lottery') {
    return resolvePayMix({ payPoints: 0, payCashCent: 0, listPriceCent: 0 })
  }
  const base = product.value || giftMeta.value || {}
  const ov = payOverride.value
  if (ov && (ov.payPoints > 0 || ov.payCashCent > 0 || ov.force)) {
    return resolvePayMix(
      {
        ...base,
        payPoints: ov.payPoints,
        payCashCent: ov.payCashCent,
        costPoints: ov.payPoints,
        needCash: ov.payCashCent,
      },
      { qty: qty.value }
    )
  }
  return resolvePayMix(base, { qty: qty.value })
})

const dockPay = computed(() => mix.value.label)
const willPayCash = computed(() => mix.value.payCashCent > 0)
const submitLabel = computed(() => {
  if (mix.value.payMode === 'mix') return '能量值+微信支付'
  if (willPayCash.value) return '微信支付'
  return orderType.value === 'lottery' ? '确认领取' : '确认兑换'
})
const submitHint = computed(() =>
  willPayCash.value ? '先扣能量值，再调起微信补差价' : '提交后生成待发货订单'
)

onLoad(async (q) => {
  orderType.value = q.type || 'mall'
  productId.value = q.productId || q.id || ''
  claimToken.value = q.claimToken || ''
  qty.value = Math.max(1, Number(q.qty || 1))
  fromCart.value = q.fromCart === '1'
  if (q.payPoints != null || q.payCashCent != null) {
    payOverride.value = {
      payPoints: Math.max(0, Number(q.payPoints) || 0),
      payCashCent: Math.max(0, Number(q.payCashCent) || 0),
      force: true,
    }
  }
  await resolveProduct()
  await loadAddresses()
  addr.value = defaultAddress()
  ready.value = true
})

onShow(async () => {
  const picked = uni.getStorageSync('qmyx_picked_address_id')
  if (picked) {
    if (!addressState.list.length) await loadAddresses()
    const a = addressState.list.find((x) => String(x.id) === String(picked))
    if (a) addr.value = a
    uni.removeStorageSync('qmyx_picked_address_id')
  } else if (!addr.value) {
    addr.value = defaultAddress()
  }
})

function mapOfferToProduct(hit) {
  if (!hit) return null
  return {
    id: hit.id || hit.productId,
    name: hit.name,
    imageUrl: hit.imageUrl || '',
    costPoints: hit.costPoints != null ? hit.costPoints : hit.payPoints,
    payPoints: hit.payPoints != null ? hit.payPoints : hit.costPoints,
    needCash: hit.needCash != null ? hit.needCash : hit.payCashCent,
    payCashCent: hit.payCashCent != null ? hit.payCashCent : hit.needCash,
    listPriceCent: hit.listPriceCent,
    listPriceYuan: hit.listPriceYuan,
    payMode: hit.payMode,
    payLabel: hit.payLabel || hit.priceText,
  }
}

async function resolveProduct() {
  const id = productId.value
  const catalog = appConfig.catalog || {}
  const gifts = catalog.gifts || []
  const products = catalog.products || []
  // 兑礼 / 罐兑 / 抽奖实物：优先 gifts，再 products（同源物料）
  let hit =
    gifts.find((g) => g.id === id) ||
    products.find((p) => p.id === id) ||
    (orderType.value === 'mall' ? mockMall.find((p) => p.id === id) : null) ||
    mockGifts.find((g) => g.id === id)

  if (!hit && USE_REMOTE && id) {
    try {
      if (!gifts.length) {
        const data = await fetchGifts()
        hit = (data.list || []).find((g) => g.id === id)
      }
    } catch (e) {}
  }
  if (!hit && USE_REMOTE && id) {
    try {
      const data = await request(`/api/traffic/v1/offers/${encodeURIComponent(id)}`)
      hit = data.offer || null
    } catch (e) {}
  }
  if (!hit && (orderType.value === 'gift' || orderType.value === 'jar')) {
    hit = gifts[0] || mockGifts[0]
  }
  if (!hit) {
    product.value = { id, name: id || '商品', price: 0, pointsOff: 0, imageUrl: '' }
    return
  }
  giftMeta.value = hit
  product.value = mapOfferToProduct(hit)
  productId.value = hit.id || hit.productId || id
}

function pickAddress() {
  uni.navigateTo({ url: '/pages/address/list?pick=1' })
}

function checkGiftGate() {
  const g = giftMeta.value
  if (!g) return ''
  if (g.mode === 'growth' && orderType.value !== 'jar') {
    if (session.growth.current < 100) {
      return `养成进度 ${session.growth.current}%，满后可兑`
    }
  }
  if (g.needStreak && session.checkin.streak < g.needStreak) {
    return `需连签 ${g.needStreak} 天（当前 ${session.checkin.streak}）`
  }
  if (g.needInvite) {
    const valid = Number(session.user.validInviteCount || 0)
    if (valid < g.needInvite) {
      return `需有效邀请 ${g.needInvite} 人（当前 ${valid}）`
    }
  }
  const m = resolvePayMix(g)
  const bal = Number(session.user.energy != null ? session.user.energy : session.user.points) || 0
  if (m.payPoints && bal < m.payPoints) {
    return `能量值不足（需 ${m.payPoints}）`
  }
  return ''
}

async function submit() {
  if (USE_REMOTE && !(getToken() && isLoggedIn())) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => uni.navigateTo({ url: '/pages/login/index' }), 400)
    return
  }
  if (!addr.value) {
    uni.showToast({ title: '请先选择收货地址', icon: 'none' })
    return pickAddress()
  }
  if (orderType.value !== 'mall' && appConfig.risk && appConfig.risk.fused) {
    uni.showToast({
      title: (appConfig.risk && appConfig.risk.fuseToast) || '激励通道已熔断，暂不可兑礼',
      icon: 'none',
    })
    return
  }
  const gate = checkGiftGate()
  if (gate && orderType.value !== 'jar') {
    uni.showToast({ title: gate, icon: 'none' })
    return
  }

  if (orderType.value === 'jar') {
    if (USE_REMOTE) {
      try {
        await request('/api/traffic/v1/jar/redeem', {
          method: 'POST',
          data: { actionId: actionId('redeem') },
        })
      } catch (e) {
        uni.showToast({ title: (e && e.message) || '能量罐兑换失败', icon: 'none' })
        return
      }
    } else {
      const r = redeemStage()
      if (!r.ok) {
        uni.showToast({ title: r.msg, icon: 'none' })
        return
      }
    }
  }

  if (orderType.value === 'lottery' && !claimToken.value) {
    uni.showToast({ title: '缺少中奖凭证，请重新抽奖', icon: 'none' })
    return
  }

  submitting.value = true
  try {
    const r = await placeOrder({
      orderType: orderType.value,
      productId: productId.value,
      productName: product.value.name,
      qty: qty.value,
      addressId: addr.value.id,
      address: addr.value,
      clearCartAfter: fromCart.value,
      // 展示用；服务端权威重算，防篡改
      payPoints: mix.value.payPoints,
      payCashCent: mix.value.payCashCent,
      claimToken: claimToken.value || undefined,
    })
    if (!r.ok) {
      uni.showToast({ title: r.msg || '下单失败', icon: 'none' })
      return
    }

    const orderNo = r.orderNo || (r.order && (r.order.orderNo || r.order.id))
    const orderId = (r.order && (r.order.id || r.order.orderNo)) || orderNo
    if ((r.needWxPay || willPayCash.value) && orderNo) {
      const pay = await payOrder(orderNo)
      if (!pay.ok) {
        uni.showToast({ title: pay.msg || '未完成支付', icon: 'none' })
        setTimeout(() => {
          uni.redirectTo({ url: `/pages/order/detail?id=${encodeURIComponent(orderId)}` })
        }, 600)
        return
      }
      uni.showToast({
        title: pay.pendingConfirm ? '支付确认中' : '支付成功',
        icon: 'none',
      })
    } else {
      uni.showToast({ title: '下单成功', icon: 'none' })
    }
    setTimeout(() => {
      uni.redirectTo({ url: `/pages/order/detail?id=${encodeURIComponent(orderId)}` })
    }, 500)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f6f7fb;
  padding: 24rpx 28rpx 180rpx;
}
.card {
  background: #fff;
  border-radius: 24rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(17, 24, 39, 0.04);
}
.addr {
  position: relative;
  padding-right: 48rpx;
}
.addr-empty .ae {
  font-size: 28rpx;
  font-weight: 700;
  color: #e11d48;
}
.row1 {
  display: flex;
  gap: 16rpx;
  align-items: baseline;
}
.name {
  font-size: 30rpx;
  font-weight: 700;
}
.phone {
  font-size: 26rpx;
  color: #6b7280;
}
.full {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #6b7280;
  line-height: 1.4;
}
.chev {
  position: absolute;
  right: 24rpx;
  top: 50%;
  transform: translateY(-50%);
  font-size: 40rpx;
  color: #9ca3af;
}
.goods {
  display: flex;
  gap: 20rpx;
}
.cover {
  width: 160rpx;
  height: 160rpx;
  border-radius: 16rpx;
  background: #f3f4f6;
  flex-shrink: 0;
}
.gname {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #111827;
}
.gsub {
  display: block;
  margin: 8rpx 0 12rpx;
  font-size: 22rpx;
  color: #9ca3af;
}
.stepper {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 16rpx;
}
.sp {
  width: 48rpx;
  height: 48rpx;
  text-align: center;
  line-height: 48rpx;
  background: #f3f4f6;
  border-radius: 12rpx;
  font-weight: 700;
}
.n {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.bill .line {
  display: flex;
  justify-content: space-between;
  padding: 14rpx 0;
  font-size: 26rpx;
  color: #374151;
}
.bill .em {
  color: #e11d48;
  font-weight: 800;
}
.bill .strike {
  color: #9ca3af;
  text-decoration: line-through;
}
.bill .tip {
  color: #9ca3af;
  font-size: 22rpx;
}
.mix-note {
  margin-top: 8rpx;
  padding: 12rpx 14rpx;
  background: #fff1f2;
  border-radius: 12rpx;
  font-size: 22rpx;
  color: #9f1239;
}
.dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -8rpx 24rpx rgba(17, 24, 39, 0.06);
}
.dock-l {
  min-width: 0;
  flex: 1;
  padding-right: 16rpx;
}
.pay {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  color: #e11d48;
}
.mute {
  display: block;
  font-size: 20rpx;
  color: #9ca3af;
  margin-top: 4rpx;
}
.cta {
  height: 84rpx;
  line-height: 84rpx;
  padding: 0 36rpx;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #e11d48, #f97316);
  color: #fff;
  font-size: 28rpx;
  font-weight: 700;
  border: none;
  flex-shrink: 0;
}
.cta::after {
  border: none;
}
</style>

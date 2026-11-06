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
      <image class="cover" :src="product.imageUrl || '/static/ui/ico-gift.png'" mode="aspectFit" />
      <view class="gbody">
        <text class="gname">{{ product.name }}</text>
        <text class="gsub">{{ typeLabel }} · 数量 ×{{ qty }}</text>
        <view class="stepper" v-if="orderType === 'mall'">
          <text class="sp" @click="qty = Math.max(1, qty - 1)">－</text>
          <text class="n">{{ qty }}</text>
          <text class="sp" @click="qty = Math.min(99, qty + 1)">＋</text>
        </view>
      </view>
    </view>

    <view class="card bill">
      <view class="line" v-if="payPoints"><text>积分抵扣</text><text>{{ payPoints }} 积分</text></view>
      <view class="line" v-if="needCash"><text>现金应付</text><text>¥{{ (needCash / 100).toFixed(2) }}</text></view>
      <view class="line" v-if="orderType === 'mall'"><text>商品金额</text><text>¥{{ mallPay.toFixed(2) }}</text></view>
      <view class="line tip"><text>履约</text><text>公司代发 · 后台可改状态</text></view>
    </view>

    <view class="dock">
      <view>
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
import { request, USE_REMOTE, actionId } from '../../api/request.js'

const ready = ref(false)
const orderType = ref('mall')
const productId = ref('')
const qty = ref(1)
const fromCart = ref(false)
const product = ref({})
const giftMeta = ref(null)
const addr = ref(null)
const submitting = ref(false)

const typeLabel = computed(() => {
  return (
    {
      mall: '商城购买',
      gift: '积分兑礼',
      jar: '能量罐兑礼',
      lottery: '抽奖实物',
    }[orderType.value] || '兑换'
  )
})

const payPoints = computed(() => {
  // 商城仅购买，不允许积分抵扣/兑换
  if (orderType.value === 'mall') return 0
  return Number((giftMeta.value && giftMeta.value.costPoints) || product.value.costPoints || 0)
})

const needCash = computed(() => {
  if (orderType.value === 'mall') return 0
  return Number((giftMeta.value && giftMeta.value.needCash) || product.value.needCash || 0)
})

const mallPay = computed(() => {
  return Math.max(0, Number(product.value.price || 0)) * qty.value
})

const dockPay = computed(() => {
  if (orderType.value === 'mall') return `¥${mallPay.value.toFixed(2)}`
  const parts = []
  if (payPoints.value) parts.push(`${payPoints.value}积分`)
  if (needCash.value) parts.push(`¥${(needCash.value / 100).toFixed(2)}`)
  if (!parts.length) parts.push('免费兑')
  return parts.join(' + ')
})

const willPayCash = computed(() => {
  if (orderType.value === 'mall') return mallPay.value > 0
  return needCash.value > 0
})

const submitLabel = computed(() => (willPayCash.value ? '微信支付' : '确认兑换'))
const submitHint = computed(() =>
  willPayCash.value ? '将调起微信支付，付款成功后进入待发货' : '提交后生成待发货订单'
)

onLoad(async (q) => {
  orderType.value = q.type || 'mall'
  productId.value = q.productId || q.id || ''
  qty.value = Math.max(1, Number(q.qty || 1))
  fromCart.value = q.fromCart === '1'
  await resolveProduct()
  await loadAddresses()
  addr.value = defaultAddress()
  ready.value = true
})

onShow(() => {
  const picked = uni.getStorageSync('qmyx_picked_address_id')
  if (picked) {
    const a = addressState.list.find((x) => String(x.id) === String(picked))
    if (a) addr.value = a
    uni.removeStorageSync('qmyx_picked_address_id')
  } else if (!addr.value) {
    addr.value = defaultAddress()
  }
})

async function resolveProduct() {
  const id = productId.value
  if (orderType.value === 'mall') {
    const remote = (appConfig.catalog && appConfig.catalog.products) || []
    const hit = remote.find((p) => p.id === id) || mockMall.find((p) => p.id === id)
    product.value = hit || { id, name: id, price: 0, pointsOff: 0 }
    return
  }
  // gift / jar / lottery
  let list = (appConfig.catalog && appConfig.catalog.gifts) || []
  if (!list.length && USE_REMOTE) {
    try {
      const data = await fetchGifts()
      list = data.list || []
    } catch (e) {}
  }
  if (!list.length) list = mockGifts
  const hit = list.find((g) => g.id === id) || list[0]
  giftMeta.value = hit
  product.value = {
    id: hit.id,
    name: hit.name,
    imageUrl: hit.imageUrl || '',
    costPoints: hit.costPoints,
    needCash: hit.needCash,
  }
  productId.value = hit.id
}

function pickAddress() {
  uni.navigateTo({ url: '/pages/address/list?pick=1' })
}

function checkGiftGate() {
  const g = giftMeta.value
  if (!g) return ''
  // 兑换门槛主配置在运营台「活动规则 / 能量罐」；SKU 上遗留 mode 仅兼容
  if (g.mode === 'growth' && orderType.value !== 'jar') {
    if (session.growth.current < 100) {
      return `养成进度 ${session.growth.current}%，满后可兑`
    }
  }
  if (g.needStreak && session.checkin.streak < g.needStreak) {
    return `需连签 ${g.needStreak} 天（当前 ${session.checkin.streak}）`
  }
  if (g.needInvite && (session.user.frozenInviteReward == null ? 0 : 0) < g.needInvite) {
    // 简化：用 invite 任务完成度不可靠时只 toast 提示，不阻断若没有权威字段
  }
  if (g.costPoints && session.user.points < g.costPoints) {
    return `积分不足（需 ${g.costPoints}）`
  }
  return ''
}

async function submit() {
  if (!addr.value) {
    uni.showToast({ title: '请先选择收货地址', icon: 'none' })
    return pickAddress()
  }
  // 激励熔断：非商城现金单拦截（运营后台风控）
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
    // 先服务端/本地罐兑，再下履约单
    if (USE_REMOTE) {
      try {
        await request('/api/traffic/v1/jar/redeem', {
          method: 'POST',
          data: { actionId: actionId('redeem') },
        })
      } catch (e) {
        // 本地兜底
        const r = redeemStage()
        if (!r.ok) {
          uni.showToast({ title: r.msg, icon: 'none' })
          return
        }
      }
    } else {
      const r = redeemStage()
      if (!r.ok) {
        uni.showToast({ title: r.msg, icon: 'none' })
        return
      }
    }
  }

  submitting.value = true
  try {
    const r = await placeOrder({
      orderType: orderType.value === 'lottery' ? 'gift' : orderType.value,
      productId: productId.value,
      productName: product.value.name,
      qty: qty.value,
      addressId: addr.value.id,
      address: addr.value,
      clearCartAfter: fromCart.value,
      payPoints: payPoints.value,
      payCashCent: orderType.value === 'mall' ? Math.round(mallPay.value * 100) : needCash.value,
    })
    if (!r.ok) {
      uni.showToast({ title: r.msg || '下单失败', icon: 'none' })
      return
    }

    const orderId = (r.order && (r.order.id || r.order.orderNo)) || r.orderNo
    if (r.needWxPay || willPayCash.value) {
      const pay = await payOrder(r.orderNo)
      if (!pay.ok) {
        uni.showToast({ title: pay.msg || '未完成支付', icon: 'none' })
        setTimeout(() => {
          uni.redirectTo({ url: `/pages/order/detail?id=${orderId}` })
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
      uni.redirectTo({ url: `/pages/order/detail?id=${orderId}` })
    }, 500)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--paper, #fbf8f4);
  padding: 24rpx 32rpx 180rpx;
}
.card {
  background: #fff;
  border-radius: 28rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  border: 1rpx solid var(--line, #eae0d5);
}
.addr {
  position: relative;
  padding-right: 48rpx;
}
.addr-empty .ae {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--accent, #d83068);
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
  color: #6e6258;
}
.full {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #6e6258;
  line-height: 1.4;
}
.chev {
  position: absolute;
  right: 24rpx;
  top: 50%;
  transform: translateY(-50%);
  font-size: 40rpx;
  color: #a89b91;
}
.goods {
  display: flex;
  gap: 20rpx;
}
.cover {
  width: 140rpx;
  height: 140rpx;
  border-radius: 16rpx;
  background: #f4ede6;
  flex-shrink: 0;
}
.gname {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
}
.gsub {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #a89b91;
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
  background: #f4ede6;
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
  padding: 12rpx 0;
  font-size: 26rpx;
}
.bill .tip {
  color: #a89b91;
  font-size: 22rpx;
}
.dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid var(--line, #eae0d5);
}
.pay {
  display: block;
  font-size: 32rpx;
  font-weight: 800;
}
.mute {
  display: block;
  font-size: 20rpx;
  color: #a89b91;
  margin-top: 4rpx;
}
.cta {
  height: 80rpx;
  line-height: 80rpx;
  padding: 0 36rpx;
  border-radius: 999rpx;
  background: var(--accent, #d83068);
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
  border: none;
}
.cta::after {
  border: none;
}
</style>

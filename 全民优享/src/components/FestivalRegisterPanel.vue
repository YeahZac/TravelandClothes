<template>
  <view class="reg">
    <view class="sec-head">
      <text class="sec-title">官方报名</text>
      <text class="sec-sub">选票 · 填写 · 微信支付出电子票</text>
    </view>

    <view v-if="loading" class="yx-muted tip">票种加载中…</view>
    <view v-else class="skus">
      <view
        v-for="t in tickets"
        :key="t.id"
        class="sku"
        :class="{ on: selectedId === t.id, ['tone-' + (t.tone || 'orange')]: true }"
        @click="selectedId = t.id"
      >
        <view class="sku-top">
          <text class="sku-tag">{{ t.tag || '票' }}</text>
          <text class="sku-day">{{ t.dayLabel }}</text>
        </view>
        <text class="sku-name">{{ t.name }}</text>
        <view class="sku-bot">
          <text class="sku-price">¥{{ t.priceYuan || t.price }}</text>
          <text class="sku-check">{{ selectedId === t.id ? '已选' : '选择' }}</text>
        </view>
      </view>
    </view>

    <view class="form">
      <view class="line">
        <text class="lab">数量</text>
        <view class="stepper">
          <text class="sp" @click="dec">－</text>
          <text class="num">{{ qty }}</text>
          <text class="sp" @click="inc">＋</text>
        </view>
      </view>
      <view class="line">
        <text class="lab">出行人</text>
        <input class="inp" v-model="visitor" placeholder="与证件姓名一致" />
      </view>
      <view class="line">
        <text class="lab">手机号</text>
        <input class="inp" type="number" maxlength="11" v-model="phone" placeholder="接收电子票通知" />
      </view>
    </view>

    <view v-if="freeNote" class="free">{{ freeNote }}</view>

    <view class="dock">
      <view class="dock-meta">
        <text class="dock-lab">应付</text>
        <text class="dock-pay">¥{{ payYuan }}</text>
      </view>
      <button class="pay-btn" :loading="busy" :disabled="!selected" @click="submit">
        微信支付 ¥{{ payYuan }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { USE_REMOTE, request } from '../api/request.js'
import { requireAuth } from '../utils/loginGate.js'
import { placeOrder, payOrder } from '../store/order.js'

const tickets = ref([])
const freeNote = ref('免报名费：符合岭南印象园免费入园政策者，按景区规定自行入园，无需报名缴费。')
const selectedId = ref('')
const qty = ref(1)
const visitor = ref('')
const phone = ref('')
const busy = ref(false)
const loading = ref(true)

const selected = computed(() => tickets.value.find((t) => t.id === selectedId.value) || null)
const payYuan = computed(() => {
  const t = selected.value
  if (!t) return 0
  // 与服务端微信支付一致：优先用分（payCashCent）
  const unitCent = Number(t.payCashCent)
  if (Number.isFinite(unitCent) && unitCent > 0) {
    return Number(((unitCent * qty.value) / 100).toFixed(2))
  }
  const p = Number(t.priceYuan || t.price || 0)
  return Number((p * qty.value).toFixed(2))
})

async function loadTickets() {
  loading.value = true
  try {
    if (USE_REMOTE) {
      const data = await request('/api/traffic/v1/festival/tickets')
      tickets.value = data.list || []
      if (data.freeNote) freeNote.value = data.freeNote
    }
  } catch (e) {
    console.warn('[FestivalRegisterPanel]', e && e.message)
  } finally {
    if (!selectedId.value && tickets.value.length) selectedId.value = tickets.value[0].id
    loading.value = false
  }
}

function inc() {
  if (qty.value < 5) qty.value += 1
}
function dec() {
  if (qty.value > 1) qty.value -= 1
}

async function submit() {
  if (busy.value || !selected.value) return
  if (!requireAuth('/pages/festival/index')) return
  if (!visitor.value.trim()) {
    uni.showToast({ title: '请填写出行人', icon: 'none' })
    return
  }
  if (!/^1\d{10}$/.test(String(phone.value || '').trim())) {
    uni.showToast({ title: '请填写有效手机号', icon: 'none' })
    return
  }
  busy.value = true
  try {
    const t = selected.value
    const created = await placeOrder({
      orderType: 'festival',
      ticketId: t.id,
      productId: t.id,
      qty: qty.value,
      visitor: visitor.value.trim(),
      phone: String(phone.value).trim(),
      address: {
        name: visitor.value.trim(),
        phone: String(phone.value).trim(),
        detail: `汉服节电子报名票 · ${t.dayLabel || ''}`,
      },
      entryFrom: 'festival',
    })
    if (!created || !created.ok) {
      uni.showToast({ title: (created && created.msg) || '下单失败', icon: 'none' })
      return
    }
    const orderNo = created.orderNo || (created.order && created.order.orderNo)
    if (created.needWxPay && orderNo) {
      const paid = await payOrder(orderNo)
      if (!paid.ok) {
        uni.showToast({ title: paid.msg || '支付未完成', icon: 'none' })
        return
      }
      uni.showToast({ title: '报名成功', icon: 'success' })
      setTimeout(() => {
        uni.navigateTo({ url: '/pages/festival/my-tickets' })
      }, 500)
      return
    }
    uni.showToast({ title: '已创建', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '支付失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

onMounted(loadTickets)

defineExpose({ reload: loadTickets })
</script>

<style scoped lang="scss">
.reg {
  padding-bottom: 160rpx;
}
.sec-head {
  margin-bottom: 20rpx;
}
.sec-title {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  color: #1f1814;
}
.sec-sub {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #8a7b6d;
}
.tip {
  font-size: 24rpx;
  padding: 12rpx 0;
}
.skus {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.sku {
  padding: 22rpx 24rpx;
  border-radius: 20rpx;
  background: #fffdf9;
  border: 2rpx solid #e8ddd0;
}
.sku.on {
  border-color: #c45c3e;
  background: #fff8f4;
  box-shadow: 0 8rpx 24rpx rgba(196, 92, 62, 0.12);
}
.sku-top {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
}
.sku-tag {
  font-size: 20rpx;
  font-weight: 700;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  background: #f3ebe3;
  color: #8a4b2e;
}
.tone-mint .sku-tag {
  background: #e6f2ea;
  color: #3d7a55;
}
.tone-blue .sku-tag {
  background: #e8eef6;
  color: #4a6d9a;
}
.tone-gold .sku-tag {
  background: #f6ecd8;
  color: #9a6b2a;
}
.sku-day {
  font-size: 22rpx;
  color: #9a8b7c;
}
.sku-name {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #2b2520;
  line-height: 1.4;
}
.sku-bot {
  margin-top: 12rpx;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.sku-price {
  font-size: 36rpx;
  font-weight: 800;
  color: #c45c3e;
}
.sku-check {
  font-size: 22rpx;
  color: #9a8b7c;
}
.sku.on .sku-check {
  color: #c45c3e;
  font-weight: 700;
}
.form {
  margin-top: 24rpx;
  padding: 8rpx 24rpx;
  background: #fffdf9;
  border-radius: 20rpx;
  border: 1rpx solid #ebe3d8;
}
.line {
  display: flex;
  align-items: center;
  min-height: 88rpx;
  border-bottom: 1rpx solid #f0e8de;
}
.line:last-child {
  border-bottom: none;
}
.lab {
  width: 120rpx;
  font-size: 28rpx;
  color: #5c574f;
  flex-shrink: 0;
}
.inp {
  flex: 1;
  font-size: 28rpx;
  color: #2b2520;
  text-align: right;
}
.stepper {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.sp {
  width: 52rpx;
  height: 52rpx;
  line-height: 48rpx;
  text-align: center;
  border-radius: 12rpx;
  background: #f3ebe3;
  font-size: 32rpx;
  color: #5c574f;
}
.num {
  min-width: 40rpx;
  text-align: center;
  font-size: 30rpx;
  font-weight: 700;
}
.free {
  margin-top: 20rpx;
  padding: 16rpx 20rpx;
  font-size: 22rpx;
  line-height: 1.55;
  color: #8a7b6d;
  background: rgba(255, 255, 255, 0.65);
  border-radius: 14rpx;
}
.dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 16rpx 28rpx calc(16rpx + env(safe-area-inset-bottom));
  background: rgba(251, 247, 241, 0.96);
  border-top: 1rpx solid #e8ddd0;
  backdrop-filter: blur(12px);
}
.dock-meta {
  flex: 1;
  min-width: 0;
}
.dock-lab {
  display: block;
  font-size: 22rpx;
  color: #9a8b7c;
}
.dock-pay {
  font-size: 40rpx;
  font-weight: 800;
  color: #c45c3e;
}
.pay-btn {
  flex-shrink: 0;
  margin: 0;
  padding: 0 36rpx;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 42rpx;
  background: linear-gradient(135deg, #d4684a, #c45c3e);
  color: #fff;
  font-size: 28rpx;
  font-weight: 700;
  border: none;
}
.pay-btn[disabled] {
  opacity: 0.45;
}
</style>

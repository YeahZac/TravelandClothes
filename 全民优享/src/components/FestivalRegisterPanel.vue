<template>
  <view class="reg">
    <view class="sec-head">
      <text class="sec-title">官方报名</text>
      <text class="sec-sub">选票种 · 多选活动日 · 微信支付出电子票</text>
    </view>

    <view v-if="loading" class="yx-muted tip">票种加载中…</view>
    <block v-else>
      <view class="seg">
        <view
          class="seg-i"
          :class="{ on: audience === 'adult' }"
          @click="audience = 'adult'"
        >成人票</view>
        <view
          class="seg-i"
          :class="{ on: audience === 'child' }"
          @click="audience = 'child'"
        >儿童/学生票</view>
      </view>

      <view class="days">
        <text class="days-lab">活动日（可多选）</text>
        <view class="day-row">
          <view
            class="day-chip"
            :class="{ on: day28 }"
            @click="day28 = !day28"
          >
            <text class="d-t">11月28日</text>
            <text class="d-p">¥{{ priceOf(dayKey28) }}</text>
          </view>
          <view
            class="day-chip"
            :class="{ on: day29 }"
            @click="day29 = !day29"
          >
            <text class="d-t">11月29日</text>
            <text class="d-p">¥{{ priceOf(dayKey29) }}</text>
          </view>
        </view>
        <text v-if="day28 && day29" class="combo">已选两日 · 合计 ¥{{ daySumYuan }}（¥{{ priceOf(dayKey28) }}+¥{{ priceOf(dayKey29) }}）</text>
      </view>

      <view class="rule">
        合计按所选日期单价相加；两日同选将分别出两张日票。当日可无限次进出。
      </view>

      <view class="form">
        <view class="line">
          <text class="lab">份数</text>
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
    </block>

    <view class="dock">
      <view class="dock-meta">
        <text class="dock-lab">应付</text>
        <text class="dock-pay">¥{{ payYuan }}</text>
      </view>
      <button class="pay-btn" :loading="busy" :disabled="!selectedTicketIds.length" @click="submit">
        微信支付 ¥{{ payYuan }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { USE_REMOTE, request } from '../api/request.js'
import { requireAuth } from '../utils/loginGate.js'
import { placeOrder, payOrder } from '../store/order.js'

const tickets = ref([])
const freeNote = ref('免报名费：符合岭南印象园免费入园政策者，按景区规定自行入园，无需报名缴费。')
const audience = ref('adult')
const day28 = ref(true)
const day29 = ref(false)
const qty = ref(1)
const visitor = ref('')
const phone = ref('')
const busy = ref(false)
const loading = ref(true)

const dayKey28 = computed(() => (audience.value === 'child' ? 'fest_child_28' : 'fest_adult_28'))
const dayKey29 = computed(() => (audience.value === 'child' ? 'fest_child_29' : 'fest_adult_29'))

function ticketById(id) {
  return tickets.value.find((t) => t.id === id) || null
}

function unitCentOf(id) {
  const t = ticketById(id)
  if (!t) return 0
  const c = Number(t.payCashCent)
  if (Number.isFinite(c) && c > 0) return c
  return Math.round(Number(t.priceYuan || t.price || 0) * 100)
}

function priceOf(id) {
  const c = unitCentOf(id)
  return c > 0 ? String(c / 100) : '—'
}

/** 所选日票 id 列表（多选相加，不套联报折扣） */
const selectedTicketIds = computed(() => {
  const ids = []
  if (day28.value) ids.push(dayKey28.value)
  if (day29.value) ids.push(dayKey29.value)
  return ids
})

const selectedSkuId = computed(() => selectedTicketIds.value[0] || '')

const daySumYuan = computed(() => {
  const cents = selectedTicketIds.value.reduce((s, id) => s + unitCentOf(id), 0)
  return Number((cents / 100).toFixed(2))
})

const payYuan = computed(() => Number((daySumYuan.value * qty.value).toFixed(2)))

watch(audience, () => {
  // 切换成人/儿童时保留已选日期
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
  if (!selectedTicketIds.value.length) {
    uni.showToast({ title: '请至少选择一天', icon: 'none' })
    return
  }
  if (busy.value) return
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
    const ids = selectedTicketIds.value
    const dayText = ids.map((id) => (ticketById(id) && ticketById(id).dayLabel) || id).join(' + ')
    const created = await placeOrder({
      orderType: 'festival',
      ticketId: ids.length === 1 ? ids[0] : ids[0].includes('child') ? 'fest_child_both' : 'fest_adult_both',
      ticketIds: ids,
      productId: ids.length === 1 ? ids[0] : ids[0].includes('child') ? 'fest_child_both' : 'fest_adult_both',
      qty: qty.value,
      visitor: visitor.value.trim(),
      phone: String(phone.value).trim(),
      address: {
        name: visitor.value.trim(),
        phone: String(phone.value).trim(),
        detail: `汉服节电子报名票 · ${dayText}`,
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
      uni.showToast({
        title: paid.pendingConfirm ? '支付成功，出票确认中' : '报名成功',
        icon: paid.pendingConfirm ? 'none' : 'success',
      })
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
.seg {
  display: flex;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.seg-i {
  flex: 1;
  text-align: center;
  padding: 18rpx 0;
  border-radius: 16rpx;
  background: #fffdf9;
  border: 2rpx solid #e8ddd0;
  font-size: 28rpx;
  font-weight: 700;
  color: #5c574f;
}
.seg-i.on {
  border-color: #c45c3e;
  background: #fff8f4;
  color: #c45c3e;
}
.days-lab {
  display: block;
  font-size: 24rpx;
  color: #8a7b6d;
  margin-bottom: 12rpx;
}
.day-row {
  display: flex;
  gap: 16rpx;
}
.day-chip {
  flex: 1;
  padding: 22rpx 20rpx;
  border-radius: 18rpx;
  background: #fffdf9;
  border: 2rpx solid #e8ddd0;
}
.day-chip.on {
  border-color: #c45c3e;
  background: #fff8f4;
  box-shadow: 0 8rpx 20rpx rgba(196, 92, 62, 0.1);
}
.d-t {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #1f1814;
}
.d-p {
  display: block;
  margin-top: 8rpx;
  font-size: 30rpx;
  font-weight: 800;
  color: #c45c3e;
}
.combo {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #8a4b2e;
  font-weight: 600;
}
.rule {
  margin: 16rpx 0 8rpx;
  padding: 14rpx 18rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #5c574f;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 12rpx;
}
.form {
  margin-top: 16rpx;
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

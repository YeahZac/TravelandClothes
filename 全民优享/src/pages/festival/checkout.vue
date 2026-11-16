<template>
  <view class="yx-page checkout yx-safe-bottom" v-if="ticket">
    <view class="yx-card row">
      <view class="cover" :class="'tc-' + (ticket.tone || 'orange')">
        {{ (ticket.tag || ticket.name || '票').slice(0, 1) }}
      </view>
      <view class="meta">
        <text class="name">{{ ticket.name }}</text>
        <text class="yx-muted">{{ ticket.desc }}</text>
      </view>
    </view>

    <view class="yx-card block">
      <view class="line">
        <text>场次</text>
        <text class="val">{{ ticket.dayLabel || '—' }}</text>
      </view>
      <view class="line">
        <text>购买数量</text>
        <view class="stepper">
          <text class="sp" @click="dec">－</text>
          <text class="num">{{ qty }}</text>
          <text class="sp" @click="inc">＋</text>
        </view>
      </view>
    </view>

    <view class="yx-card block">
      <view class="line">
        <text>出行人</text>
        <input class="inp" v-model="visitor" placeholder="与证件姓名一致" />
      </view>
      <view class="line">
        <text>手机号</text>
        <input class="inp" type="number" maxlength="11" v-model="phone" placeholder="接收电子票" />
      </view>
    </view>

    <view class="yx-card block">
      <view class="bill"><text>单价</text><text>¥{{ ticket.price }}</text></view>
      <view class="bill"><text>数量</text><text>×{{ qty }}</text></view>
      <view class="bill total"><text>应付</text><text>¥{{ pay }}</text></view>
      <text class="yx-muted tip">报名费已含入园福利 · 微信支付到账后记账为「{{ financeLabel }}」</text>
    </view>

    <view class="dock">
      <view>
        <text class="pay">¥{{ pay }}</text>
      </view>
      <button class="yx-btn yx-btn-orange" :loading="busy" @click="submit">微信支付</button>
    </view>
    <RewardPopup />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { tickets as mockTickets } from '../../mock/data.js'
import { USE_REMOTE, request } from '../../api/request.js'
import { requireAuth } from '../../utils/loginGate.js'
import { placeOrder, payOrder } from '../../store/order.js'
import RewardPopup from '../../components/RewardPopup.vue'

const ticket = ref(null)
const qty = ref(1)
const visitor = ref('')
const phone = ref('')
const busy = ref(false)

const pay = computed(() => Number(((ticket.value?.price || 0) * qty.value).toFixed(2)))
const financeLabel = computed(() =>
  ticket.value && ticket.value.audience === 'child' ? '汉服节儿童/学生票' : '汉服节成人票'
)

async function loadTicket(id) {
  if (USE_REMOTE) {
    try {
      const data = await request('/api/traffic/v1/festival/tickets')
      const hit = (data.list || []).find((t) => t.id === id)
      if (hit) {
        ticket.value = hit
        return
      }
    } catch (e) {
      console.warn('[festival checkout]', e && e.message)
    }
  }
  ticket.value = mockTickets.find((t) => t.id === id) || mockTickets[0]
}

onLoad(async (q) => {
  await loadTicket(q.id)
})

function inc() {
  if (qty.value < 5) qty.value += 1
}
function dec() {
  if (qty.value > 1) qty.value -= 1
}

async function submit() {
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
  if (!ticket.value) return
  busy.value = true
  try {
    const created = await placeOrder({
      orderType: 'festival',
      ticketId: ticket.value.id,
      productId: ticket.value.id,
      qty: qty.value,
      visitor: visitor.value.trim(),
      phone: String(phone.value).trim(),
      address: {
        name: visitor.value.trim(),
        phone: String(phone.value).trim(),
        detail: `汉服节电子报名票 · ${ticket.value.dayLabel || ''}`,
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
        if (!paid.cancelled && orderNo) {
          setTimeout(() => uni.navigateTo({ url: `/pages/order/detail?id=${orderNo}` }), 600)
        }
        return
      }
      uni.showToast({
        title: paid.pendingConfirm ? '支付成功，出票确认中' : '报名成功',
        icon: paid.pendingConfirm ? 'none' : 'success',
      })
      setTimeout(() => {
        uni.redirectTo({ url: '/pages/festival/my-tickets' })
      }, 600)
      return
    }
    uni.showToast({ title: '已创建', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '支付失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}
</script>

<style scoped lang="scss">
.checkout {
  padding: 24rpx 28rpx 160rpx;
}
.row {
  display: flex;
  gap: 20rpx;
  align-items: center;
  margin-bottom: 20rpx;
}
.meta {
  flex: 1;
  min-width: 0;
}
.cover {
  width: 100rpx;
  height: 100rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  font-weight: 800;
  color: rgba(28, 26, 23, 0.3);
  flex-shrink: 0;
}
.tc-blue {
  background: #dce9ff;
}
.tc-orange {
  background: #ffe4cc;
}
.tc-gold {
  background: #ffe9b8;
}
.tc-mint {
  background: #d8f6f2;
}
.name {
  display: block;
  font-size: 30rpx;
  font-weight: 800;
}
.block {
  margin-bottom: 20rpx;
}
.line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 22rpx 0;
  border-bottom: 1rpx solid rgba(28, 26, 23, 0.06);
  font-weight: 600;
}
.line:last-child {
  border-bottom: none;
}
.val {
  color: #c45c3e;
  font-weight: 700;
}
.stepper {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.sp {
  width: 48rpx;
  height: 48rpx;
  border-radius: 12rpx;
  background: #f6efe8;
  text-align: center;
  line-height: 48rpx;
  font-weight: 800;
}
.num {
  font-size: 30rpx;
  font-weight: 800;
  min-width: 40rpx;
  text-align: center;
}
.inp {
  text-align: right;
  font-size: 28rpx;
}
.bill {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 0;
  font-size: 26rpx;
}
.bill.total {
  margin-top: 8rpx;
  font-size: 32rpx;
  font-weight: 800;
  color: #ff5c4a;
}
.tip {
  display: block;
  margin-top: 12rpx;
}
.dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 -8rpx 24rpx rgba(47, 107, 255, 0.08);
}
.pay {
  font-size: 40rpx;
  font-weight: 800;
  color: #ff5c4a;
}
</style>

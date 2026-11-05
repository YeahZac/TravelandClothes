<template>
  <view class="yx-page checkout yx-safe-bottom" v-if="ticket">
    <view class="yx-card row">
      <view class="cover" :class="'tc-' + ticket.tone">{{ ticket.name.slice(0, 1) }}</view>
      <view>
        <text class="name">{{ ticket.name }}</text>
        <text class="yx-muted">{{ ticket.desc }}</text>
      </view>
    </view>

    <view class="yx-card block">
      <view class="line">
        <text>使用日期</text>
        <picker mode="date" :value="day" start="2026-11-21" end="2026-11-29" @change="onDay">
          <text class="val">{{ day }}</text>
        </picker>
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
      <text class="yx-muted tip">支付为前端模拟，不产生真实扣款</text>
    </view>

    <view class="dock">
      <view>
        <text class="pay">¥{{ pay }}</text>
      </view>
      <button class="yx-btn yx-btn-orange" @click="submit">立即支付</button>
    </view>
    <RewardPopup />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { tickets } from '../../mock/data.js'
import { buyTicket } from '../../store/session.js'
import RewardPopup from '../../components/RewardPopup.vue'

const ticket = ref(null)
const day = ref('2026-11-22')
const qty = ref(1)
const visitor = ref('阿柚')
const phone = ref('13800138000')

const pay = computed(() => ((ticket.value?.price || 0) * qty.value).toFixed(0))

onLoad((q) => {
  ticket.value = tickets.find((t) => t.id === q.id) || tickets[0]
})

function onDay(e) {
  day.value = e.detail.value
}
function inc() {
  if (qty.value < 5) qty.value += 1
}
function dec() {
  if (qty.value > 1) qty.value -= 1
}
function submit() {
  if (!visitor.value || phone.value.length < 11) {
    uni.showToast({ title: '请完善出行人与手机号', icon: 'none' })
    return
  }
  buyTicket(ticket.value, { day: day.value, qty: qty.value, visitor: visitor.value, phone: phone.value })
  setTimeout(() => {
    uni.switchTab({ url: '/pages/mine/index' })
  }, 1200)
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
}
.tc-blue { background: #dce9ff; }
.tc-orange { background: #ffe4cc; }
.tc-gold { background: #ffe9b8; }
.tc-mint { background: #d8f6f2; }
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
  color: #2f6bff;
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
  background: #eef3ff;
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

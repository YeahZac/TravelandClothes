<template>
  <view class="yx-page ticket-page yx-safe-bottom" v-if="ticket">
    <view class="cover" :class="'tc-' + ticket.tone">
      <text class="big">{{ ticket.name.slice(0, 1) }}</text>
      <text class="yx-tag yx-tag-hot">{{ ticket.tag }}</text>
    </view>
    <view class="panel yx-card">
      <text class="name">{{ ticket.name }}</text>
      <text class="desc">{{ ticket.desc }}</text>
      <view class="price-row">
        <text class="price">¥{{ ticket.price }}</text>
        <text class="market">门市 ¥{{ ticket.marketPrice }}</text>
      </view>
      <view class="bonus">购票赠 {{ ticket.energyBonus }} 能量（模拟）</view>
      <view class="rules">
        <text class="rt">购票须知</text>
        <text class="rl">· 电子票凭核销码入场，一人一码</text>
        <text class="rl">· 未核销可按规则申请退改（mock）</text>
        <text class="rl">· 主办方与出票说明以后台配置为准</text>
        <text class="rl">· 库存 {{ ticket.stock }} 张</text>
      </view>
      <button class="yx-btn yx-btn-orange buy" @click="goCheckout">立即购票</button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { tickets } from '../../mock/data.js'

const ticket = ref(null)
onLoad((q) => {
  ticket.value = tickets.find((t) => t.id === q.id) || tickets[0]
})

function goCheckout() {
  uni.navigateTo({ url: `/pages/festival/checkout?id=${ticket.value.id}` })
}
</script>

<style scoped lang="scss">
.cover {
  height: 360rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
}
.tc-blue { background: linear-gradient(160deg, #dce9ff, #9bb8ff); }
.tc-orange { background: linear-gradient(160deg, #ffe4cc, #ffb070); }
.tc-gold { background: linear-gradient(160deg, #ffe9b8, #ffd06a); }
.tc-mint { background: linear-gradient(160deg, #d8f6f2, #7ee0d4); }
.big {
  font-size: 120rpx;
  font-weight: 800;
  color: rgba(28, 26, 23, 0.2);
}
.panel {
  margin: -48rpx 28rpx 0;
  position: relative;
  z-index: 1;
}
.name {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
}
.desc {
  display: block;
  margin-top: 12rpx;
  color: #5c574f;
  font-size: 26rpx;
}
.price-row {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
  margin-top: 24rpx;
}
.price {
  font-size: 48rpx;
  font-weight: 800;
  color: #ff5c4a;
}
.market {
  font-size: 24rpx;
  color: #8b93a7;
  text-decoration: line-through;
}
.bonus {
  margin-top: 12rpx;
  font-size: 24rpx;
  font-weight: 700;
  color: #ff7a1a;
}
.rules {
  margin-top: 28rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: rgba(47, 107, 255, 0.06);
}
.rt {
  display: block;
  font-weight: 800;
  margin-bottom: 10rpx;
}
.rl {
  display: block;
  font-size: 24rpx;
  color: #5c574f;
  line-height: 1.7;
}
.buy {
  margin-top: 32rpx;
  width: 100%;
}
</style>

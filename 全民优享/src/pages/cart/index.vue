<template>
  <view class="page">
    <view v-if="!cart.items.length" class="empty">
      <text class="et">购物车是空的</text>
      <button class="ghost" @click="goMall">去逛商城</button>
    </view>
    <view v-for="it in cart.items" :key="it.id" class="card">
      <CmsImage class="cover" :src="it.imageUrl" mode="aspectFit" placeholder="/static/ui/ico-gift.png" />
      <view class="body">
        <text class="name">{{ it.name }}</text>
        <text class="price">¥{{ linePay(it).toFixed(2) }}</text>
        <view class="stepper">
          <text class="sp" @click="dec(it)">－</text>
          <text class="n">{{ it.qty }}</text>
          <text class="sp" @click="inc(it)">＋</text>
          <text class="rm" @click="removeFromCart(it.id)">删除</text>
        </view>
      </view>
    </view>
    <view v-if="cart.items.length" class="dock">
      <view>
        <text class="sum">合计 ¥{{ cartTotal().toFixed(2) }}</text>
        <text class="hint">支持多件合并下单 · 微信支付</text>
      </view>
      <button class="cta" @click="checkout">去结算</button>
    </view>
  </view>
</template>

<script setup>
import { onShow } from '@dcloudio/uni-app'
import { cart, setQty, removeFromCart, cartTotal, linePayYuan, syncCartFromServer } from '../../store/cart.js'
import { goConfirm } from '../../store/order.js'
import { getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { goLogin, currentPagePath } from '../../utils/loginGate.js'
import CmsImage from '../../components/CmsImage.vue'
import { bindPullRefresh } from '../../utils/pullRefresh.js'

onShow(() => {
  if (getToken() && isLoggedIn()) syncCartFromServer()
})

bindPullRefresh(async () => {
  if (getToken() && isLoggedIn()) await syncCartFromServer()
})

function linePay(it) {
  return linePayYuan(it)
}
function inc(it) {
  setQty(it.id, it.qty + 1)
}
function dec(it) {
  setQty(it.id, it.qty - 1)
}
function goMall() {
  uni.switchTab({ url: '/pages/mall/index' })
}
function checkout() {
  if (!(getToken() && isLoggedIn())) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => goLogin(currentPagePath() || '/pages/cart/index'), 400)
    return
  }
  if (!cart.items.length) return
  if (cart.items.length === 1) {
    const it = cart.items[0]
    goConfirm({ type: 'mall', productId: it.id, qty: it.qty, fromCart: '1' })
    return
  }
  goConfirm({ type: 'mall', fromCart: '1', cartCheckout: '1' })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--paper, #fbf8f4);
  padding: 24rpx 32rpx 180rpx;
}
.empty {
  padding: 160rpx 0;
  text-align: center;
}
.et {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  margin-bottom: 24rpx;
}
.ghost {
  display: inline-block;
  padding: 0 40rpx;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 999rpx;
  border: 2rpx solid var(--ink, #2b2520);
  background: transparent;
  font-size: 26rpx;
  font-weight: 600;
}
.ghost::after {
  border: none;
}
.card {
  display: flex;
  gap: 20rpx;
  background: #fff;
  border-radius: 28rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  border: 1rpx solid var(--line, #eae0d5);
}
.cover {
  width: 140rpx;
  height: 140rpx;
  background: #f4ede6;
  border-radius: 16rpx;
  flex-shrink: 0;
}
.body {
  flex: 1;
  min-width: 0;
}
.name {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
}
.price {
  display: block;
  margin-top: 8rpx;
  font-size: 30rpx;
  font-weight: 800;
  color: var(--accent, #d83068);
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
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
.rm {
  margin-left: auto;
  font-size: 24rpx;
  color: #a89b91;
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
.sum {
  display: block;
  font-size: 32rpx;
  font-weight: 800;
}
.hint {
  display: block;
  font-size: 20rpx;
  color: #a89b91;
  margin-top: 4rpx;
}
.cta {
  height: 80rpx;
  line-height: 80rpx;
  padding: 0 40rpx;
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

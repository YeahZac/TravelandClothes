<template>
  <view class="page">
    <view class="cart-entry" @click="goCart">
      <text class="ct">购物车</text>
      <text v-if="cartCount" class="badge">{{ cartCount > 99 ? '99+' : cartCount }}</text>
    </view>
    <view class="body">
      <ModuleRenderer v-for="mod in modules" :key="mod.id" :mod="mod" />
      <ShareEntry />
    </view>
    <RewardPopup />
    <LoginSheet />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import ModuleRenderer from '../../components/modules/ModuleRenderer.vue'
import RewardPopup from '../../components/RewardPopup.vue'
import LoginSheet from '../../components/LoginSheet.vue'
import ShareEntry from '../../components/ShareEntry.vue'
import {
  pageModules,
  refreshAppConfigIfNeeded,
  refreshMallCatalog,
  pageTitle,
  loadAppConfig,
} from '../../store/appConfig.js'
import { syncTabBar } from '../../utils/tabbar.js'
import { cartCount } from '../../store/cart.js'
import { reportTaskBrowse } from '../../utils/taskActionReport.js'
import { bindPullRefresh } from '../../utils/pullRefresh.js'
import { usePageShare } from '../../utils/share.js'

usePageShare({ channel: 'share_mall' })

const modules = computed(() => pageModules('mall'))

function goCart() {
  uni.navigateTo({ url: '/pages/cart/index' })
}

async function reloadMall() {
  await refreshAppConfigIfNeeded()
  await refreshMallCatalog()
  uni.setNavigationBarTitle({ title: pageTitle('mall') || '商城' })
  syncTabBar(1)
}

onShow(async () => {
  await refreshAppConfigIfNeeded()
  await refreshMallCatalog()
  uni.setNavigationBarTitle({ title: pageTitle('mall') || '商城' })
  syncTabBar(1)
  reportTaskBrowse('browse_mall')
})

bindPullRefresh(reloadMall)
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #fbf8f4;
  padding: 16rpx 32rpx 140rpx;
}
.cart-entry {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8rpx;
  margin-bottom: 8rpx;
  padding: 8rpx 4rpx;
}
.ct {
  font-size: 26rpx;
  font-weight: 600;
  color: #2b2520;
}
.badge {
  min-width: 32rpx;
  height: 32rpx;
  padding: 0 8rpx;
  border-radius: 999rpx;
  background: #d83068;
  color: #fff;
  font-size: 20rpx;
  font-weight: 700;
  text-align: center;
  line-height: 32rpx;
}
</style>

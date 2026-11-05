<template>
  <view class="page">
    <view class="body">
      <ModuleRenderer v-for="mod in modules" :key="mod.id" :mod="mod" />
    </view>
    <RewardPopup />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import ModuleRenderer from '../../components/modules/ModuleRenderer.vue'
import RewardPopup from '../../components/RewardPopup.vue'
import { pageModules, refreshAppConfigIfNeeded, pageTitle } from '../../store/appConfig.js'
import { syncTabBar } from '../../utils/tabbar.js'

const modules = computed(() => pageModules('mall'))

onShow(async () => {
  await refreshAppConfigIfNeeded()
  uni.setNavigationBarTitle({ title: pageTitle('mall') || '商城' })
  syncTabBar(1)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f6f8;
  padding: 16rpx 32rpx 140rpx;
}
</style>

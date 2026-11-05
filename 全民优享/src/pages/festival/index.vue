<template>
  <view class="page">
    <view class="body">
      <ModuleRenderer v-for="mod in modules" :key="mod.id" :mod="mod" />
    </view>
    <view class="safe" />
    <RewardPopup />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import ModuleRenderer from '../../components/modules/ModuleRenderer.vue'
import RewardPopup from '../../components/RewardPopup.vue'
import { pageModules, refreshAppConfigIfNeeded } from '../../store/appConfig.js'
import { visitFestivalDone } from '../../store/session.js'
import { syncTabBar } from '../../utils/tabbar.js'

const modules = computed(() => pageModules('festival'))

onShow(async () => {
  await refreshAppConfigIfNeeded()
  visitFestivalDone()
  syncTabBar(2)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f6f1ea;
  padding-bottom: 120rpx;
}
.body {
  padding: 0 32rpx 32rpx;
}
.safe {
  height: calc(48rpx + env(safe-area-inset-bottom));
}
</style>

<template>
  <view class="page">
    <view class="sky" :style="{ paddingTop: statusBar + 'px' }">
      <view class="body">
        <ModuleRenderer v-for="mod in modules" :key="mod.id" :mod="mod" />
      </view>
    </view>
    <RewardPopup />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import ModuleRenderer from '../../components/modules/ModuleRenderer.vue'
import RewardPopup from '../../components/RewardPopup.vue'
import { pageModules, refreshAppConfigIfNeeded } from '../../store/appConfig.js'
import { syncTabBar } from '../../utils/tabbar.js'

const statusBar = ref(20)
try {
  statusBar.value = uni.getSystemInfoSync().statusBarHeight || 20
} catch (e) {}

const modules = computed(() => pageModules('energy'))

onShow(async () => {
  await refreshAppConfigIfNeeded()
  syncTabBar(3)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f6f8;
  padding-bottom: 140rpx;
}
.sky {
  min-height: 640rpx;
  background: linear-gradient(180deg, #8ebeff 0%, #d7e8ff 42%, #f4f6f8 72%);
}
.body {
  padding: 0 32rpx 32rpx;
}
</style>

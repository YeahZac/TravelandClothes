<template>
  <view class="page">
    <view class="sky" :style="{ paddingTop: statusBar + 'px' }">
      <view class="body">
        <ModuleRenderer v-for="mod in modules" :key="mod.id" :mod="mod" />
        <view class="rules-foot" @click="goEnergyRules">
          <text class="rules-t">能量值是营销积分，不可提现 / 转赠 / 兑红包</text>
          <text class="rules-link">规则说明 ›</text>
        </view>
      </view>
    </view>
    <RewardPopup />
    <LoginSheet />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import ModuleRenderer from '../../components/modules/ModuleRenderer.vue'
import RewardPopup from '../../components/RewardPopup.vue'
import LoginSheet from '../../components/LoginSheet.vue'
import { pageModules, refreshAppConfigIfNeeded, loadAppConfig } from '../../store/appConfig.js'
import { syncTabBar } from '../../utils/tabbar.js'
import { usePageShare } from '../../utils/share.js'
import { getStatusBarHeight } from '../../utils/systemInfo.js'
import { bindPullRefresh } from '../../utils/pullRefresh.js'
import { goEnergyRules } from '../../utils/energyRulesCopy.js'

usePageShare({ channel: 'share_energy' })

const statusBar = ref(20)
try {
  statusBar.value = uni.getSystemInfoSync().statusBarHeight || 20
} catch (e) {}

const modules = computed(() => pageModules('energy'))

onShow(async () => {
  await refreshAppConfigIfNeeded()
  syncTabBar(3)
})

bindPullRefresh(async () => {
  await loadAppConfig(true)
  syncTabBar(3)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--paper);
  padding-bottom: 140rpx;
}
.sky {
  min-height: 640rpx;
  background: linear-gradient(180deg, #eef6ea 0%, #f7f1ea 48%, var(--paper) 78%);
}
.body {
  padding: 16rpx var(--page-x) 32rpx;
  display: flex;
  flex-direction: column;
  gap: var(--mod-gap);
}
.rules-foot {
  margin-top: 8rpx;
  padding: 20rpx 22rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.72);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.rules-t {
  flex: 1;
  font-size: 22rpx;
  color: #6b7280;
  line-height: 1.4;
}
.rules-link {
  flex-shrink: 0;
  font-size: 22rpx;
  font-weight: 700;
  color: #0f766e;
}
</style>

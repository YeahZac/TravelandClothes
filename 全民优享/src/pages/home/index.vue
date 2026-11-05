<template>
  <view class="page">
    <!-- A. 今日仪表盘 hero -->
    <view class="sky" :style="{ paddingTop: statusBar + 'px' }">
      <view class="nav">
        <view class="brand-wrap">
          <text class="brand">{{ appConfig.brand.name || '全民优享' }}</text>
          <text class="slogan">{{ appConfig.brand.slogan || '每天打开，攒能量兑好物' }}</text>
        </view>
        <view class="wallet" @click="openLink('energy')">
          <VIcon name="coin" :size="36" color="#F06400" />
          <view class="wallet-num">
            <text class="wn yx-num">{{ session.user.coins }}</text>
            <text class="we">能量 {{ session.user.energy }}</text>
          </view>
        </view>
      </view>

      <!-- 今日仪表盘 -->
      <view class="dash">
        <view class="dash-left">
          <text class="dash-label">今日能量</text>
          <text class="dash-num yx-num">{{ session.user.energy }}</text>
          <view class="dash-meta">
            <text class="dash-meta-item">连签 {{ session.checkin.streak }} 天</text>
            <text class="dot">·</text>
            <text class="dash-meta-item">步数 {{ session.user.stepsToday }}</text>
          </view>
        </view>
        <view class="ring-wrap">
          <ProgressRing :pct="session.growth.current" :size="140" :stroke="10" />
        </view>
        <view class="dash-right" @click="openLink('energy')">
          <image class="can" src="/static/ui/illu-can-shell.png" mode="aspectFit" />
          <view class="can-tag">
            <text class="can-tag-t">{{ session.growth.targetGift }}</text>
            <text class="can-tag-s">再 {{ 100 - session.growth.current }}% 可兑</text>
          </view>
        </view>
      </view>
    </view>

    <view class="body">
      <ModuleRenderer v-for="mod in modules" :key="mod.id" :mod="mod" />
    </view>
    <view class="safe" />
    <RewardPopup />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import ModuleRenderer from '../../components/modules/ModuleRenderer.vue'
import RewardPopup from '../../components/RewardPopup.vue'
import VIcon from '../../components/VIcon.vue'
import ProgressRing from '../../components/ProgressRing.vue'
import { appConfig, pageModules, refreshAppConfigIfNeeded } from '../../store/appConfig.js'
import { session } from '../../store/session.js'
import { openLink } from '../../utils/navigate.js'
import { syncTabBar } from '../../utils/tabbar.js'

const statusBar = ref(20)
try {
  statusBar.value = uni.getSystemInfoSync().statusBarHeight || 20
} catch (e) {}

const modules = computed(() => pageModules('home'))

onShow(async () => {
  await refreshAppConfigIfNeeded()
  syncTabBar(0)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f6f8;
  padding-bottom: 120rpx;
}
.sky {
  padding: 0 32rpx 32rpx;
  background: linear-gradient(180deg, #d7e8ff 0%, #eaf1fb 60%, #f4f6f8 100%);
  box-sizing: border-box;
}
.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 88rpx;
}
.brand-wrap {
  display: flex;
  flex-direction: column;
}
.brand {
  font-size: 36rpx;
  font-weight: 800;
  color: #121826;
  line-height: 1.2;
  letter-spacing: -0.5rpx;
}
.slogan {
  margin-top: 4rpx;
  font-size: 22rpx;
  font-weight: 400;
  color: #5e6977;
}
.wallet {
  height: 64rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 0 22rpx 0 14rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8rpx 24rpx rgba(18, 24, 38, 0.06);
  border: 1rpx solid rgba(18, 24, 38, 0.06);
}
.wallet:active {
  transform: scale(0.98);
}
.wallet-num {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}
.wn {
  font-size: 26rpx;
  font-weight: 700;
  color: #121826;
  font-variant-numeric: tabular-nums;
}
.we {
  font-size: 20rpx;
  color: #5e6977;
}

/* 仪表盘 */
.dash {
  margin-top: 24rpx;
  background: #fff;
  border-radius: 28rpx;
  padding: 28rpx 28rpx 28rpx 32rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
  box-shadow: 0 12rpx 32rpx rgba(18, 24, 38, 0.08);
  border: 1rpx solid rgba(18, 24, 38, 0.04);
}
.dash-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.dash-label {
  font-size: 22rpx;
  color: #5e6977;
  letter-spacing: 1rpx;
}
.dash-num {
  margin-top: 6rpx;
  font-size: 72rpx;
  font-weight: 800;
  color: #121826;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -1rpx;
}
.dash-meta {
  margin-top: 12rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.dash-meta-item {
  font-size: 22rpx;
  color: #3a4252;
  font-weight: 500;
}
.dot {
  color: #c0c6d0;
  font-size: 22rpx;
}

/* 进度环（SVG 内联实现，见 ProgressRing 组件） */
.ring-wrap {
  width: 140rpx;
  height: 140rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dash-right {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  flex-shrink: 0;
  width: 120rpx;
}
.can {
  width: 96rpx;
  height: 96rpx;
}
.can-tag {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.can-tag-t {
  font-size: 20rpx;
  font-weight: 700;
  color: #121826;
  line-height: 1.2;
}
.can-tag-s {
  font-size: 18rpx;
  color: #5e6977;
  margin-top: 2rpx;
}

.body {
  padding: 24rpx 32rpx 32rpx;
}
.safe {
  height: calc(48rpx + env(safe-area-inset-bottom));
}
</style>

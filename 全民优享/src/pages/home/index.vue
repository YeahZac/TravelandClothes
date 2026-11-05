/* Hallmark · genre: playful · macrostructure: app-shell · theme: cream-rose · designed-as-app */
<template>
  <view class="page">
    <view class="sky" :style="{ paddingTop: statusBar + 'px' }">
      <view class="nav">
        <view class="brand-wrap">
          <text class="brand">{{ appConfig.brand.name || '全民优享' }}</text>
          <text class="slogan">{{ appConfig.brand.slogan || '每天打开，攒能量兑好物' }}</text>
        </view>
        <view class="wallet" @click="openLink('energy')">
          <VIcon name="coin" :size="36" color="#E5A23E" />
          <view class="wallet-num">
            <text class="wn yx-num">{{ session.user.coins }}</text>
            <text class="we">能量 {{ session.user.energy }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="body">
      <!-- A. 今日仪表盘 hero -->
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
          <ProgressRing :pct="session.growth.current" :size="156" :stroke="11" />
        </view>
        <view class="dash-right" @click="openLink('energy')">
          <image class="can" src="/static/ui/illu-can-shell.png" mode="aspectFit" />
          <view class="can-tag">
            <text class="can-tag-t">{{ session.growth.targetGift }}</text>
            <text class="can-tag-s">再 {{ 100 - session.growth.current }}% 可兑</text>
          </view>
        </view>
      </view>

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
  background: var(--paper);
  padding-bottom: 140rpx;
}
.sky {
  padding: 0 var(--page-x) 8rpx;
  background: var(--paper);
  box-sizing: border-box;
}
.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 96rpx;
}
.brand-wrap {
  display: flex;
  flex-direction: column;
}
.brand {
  font-size: 38rpx;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.2;
  letter-spacing: -0.5rpx;
}
.slogan {
  margin-top: 6rpx;
  font-size: 22rpx;
  font-weight: 400;
  color: var(--ink-3);
}
.wallet {
  height: 72rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 0 24rpx 0 14rpx;
  border-radius: var(--radius-pill);
  background: var(--paper-2);
  box-shadow: var(--shadow-soft);
  border: 1rpx solid var(--line-soft);
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
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.we {
  font-size: 20rpx;
  color: var(--ink-3);
}

.body {
  padding: 24rpx var(--page-x) var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--mod-gap);
}

/* 仪表盘 — 比之前更高、更呼吸 */
.dash {
  background: var(--paper-2);
  border-radius: var(--radius-card-lg);
  padding: 44rpx 36rpx;
  display: flex;
  align-items: center;
  gap: 24rpx;
  box-shadow: var(--shadow-card);
  border: 1rpx solid var(--line-soft);
}
.dash-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.dash-label {
  font-size: 22rpx;
  color: var(--ink-3);
  letter-spacing: 1rpx;
}
.dash-num {
  margin-top: 10rpx;
  font-size: 88rpx;
  font-weight: 800;
  color: var(--ink);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -1.5rpx;
}
.dash-meta {
  margin-top: 18rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.dash-meta-item {
  font-size: 22rpx;
  color: var(--ink-2);
  font-weight: 500;
}
.dot {
  color: var(--ink-3);
  font-size: 22rpx;
}

.ring-wrap {
  width: 156rpx;
  height: 156rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dash-right {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  flex-shrink: 0;
  width: 132rpx;
}
.can {
  width: 104rpx;
  height: 104rpx;
}
.can-tag {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.can-tag-t {
  font-size: 20rpx;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.2;
}
.can-tag-s {
  font-size: 18rpx;
  color: var(--sage-deep);
  margin-top: 4rpx;
}

.safe {
  height: calc(48rpx + env(safe-area-inset-bottom));
}
</style>

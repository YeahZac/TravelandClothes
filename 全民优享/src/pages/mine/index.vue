<template>
  <view class="page">
    <!-- D. 我的页 hero：品牌色渐变 + 等级勋章 -->
    <view class="hero" :style="{ paddingTop: statusBar + 'px' }">
      <view class="hero-inner">
        <view class="profile">
          <view class="avatar">
            <view class="sil" />
            <view class="ring-deco" />
          </view>
          <view class="who">
            <view class="name-row">
              <text class="name">{{ session.user.nickName }}</text>
              <view class="medal">
                <VIcon name="medal" :size="32" color="#F5B942" stroke="#7A4A05" />
                <text class="medal-t">Lv.{{ session.user.level }}</text>
              </view>
            </view>
            <text class="meta">{{ session.user.levelName }} · 连签 {{ session.checkin.streak }} 天</text>
          </view>
        </view>
        <view class="stats">
          <view class="si">
            <text class="sn yx-num">{{ session.user.energy }}</text>
            <text class="mute">能量</text>
          </view>
          <view class="sep" />
          <view class="si">
            <text class="sn yx-num">{{ session.user.points }}</text>
            <text class="mute">积分</text>
          </view>
          <view class="sep" />
          <view class="si">
            <text class="sn yx-num">{{ session.ticketOrders.length }}</text>
            <text class="mute">门票</text>
          </view>
        </view>
      </view>
    </view>

    <view class="body">
      <ModuleRenderer v-for="mod in modules" :key="mod.id" :mod="mod" />
    </view>
    <RewardPopup />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import ModuleRenderer from '../../components/modules/ModuleRenderer.vue'
import RewardPopup from '../../components/RewardPopup.vue'
import VIcon from '../../components/VIcon.vue'
import { pageModules, refreshAppConfigIfNeeded } from '../../store/appConfig.js'
import { session } from '../../store/session.js'
import { syncTabBar } from '../../utils/tabbar.js'

const statusBar = ref(20)
try {
  statusBar.value = uni.getSystemInfoSync().statusBarHeight || 20
} catch (e) {}

const modules = computed(() => pageModules('mine'))

onShow(async () => {
  await refreshAppConfigIfNeeded()
  syncTabBar(4)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f6f8;
  padding-bottom: 140rpx;
}
.hero {
  background: linear-gradient(135deg, #f06400 0%, #f5b942 100%);
  padding: 0 32rpx 40rpx;
  border-bottom-left-radius: 32rpx;
  border-bottom-right-radius: 32rpx;
}
.hero-inner {
  display: flex;
  flex-direction: column;
}
.profile {
  display: flex;
  gap: 24rpx;
  align-items: center;
  min-height: 120rpx;
  padding: 16rpx 0 28rpx;
}
.avatar {
  position: relative;
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 8rpx 24rpx rgba(122, 74, 5, 0.25);
  border: 3rpx solid rgba(255, 255, 255, 0.7);
}
.sil {
  width: 56rpx;
  height: 64rpx;
  border-radius: 40rpx 40rpx 10rpx 10rpx;
  background: #c0c6d0;
  margin-bottom: 10rpx;
}
.ring-deco {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2rpx solid rgba(245, 185, 66, 0.5);
}
.who {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.name {
  font-size: 40rpx;
  font-weight: 800;
  color: #fff;
  line-height: 1.2;
  letter-spacing: -0.5rpx;
}
.medal {
  display: flex;
  align-items: center;
  gap: 4rpx;
  background: rgba(255, 255, 255, 0.22);
  padding: 4rpx 12rpx 4rpx 4rpx;
  border-radius: 999rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.35);
}
.medal-t {
  font-size: 22rpx;
  font-weight: 700;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.meta {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.92);
}
.stats {
  background: rgba(255, 255, 255, 0.16);
  border-radius: 24rpx;
  padding: 24rpx 0;
  display: flex;
  align-items: center;
  border: 1rpx solid rgba(255, 255, 255, 0.22);
}
.si {
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.sep {
  width: 1rpx;
  height: 48rpx;
  background: rgba(255, 255, 255, 0.3);
}
.sn {
  font-size: 40rpx;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #fff;
  line-height: 1.1;
}
.mute {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.85);
}
.body {
  padding: 28rpx 32rpx;
  margin-top: -8rpx;
}
</style>

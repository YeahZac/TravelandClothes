/* Hallmark · genre: playful · macrostructure: app-shell · theme: cream-rose · designed-as-app */
<template>
  <view class="page">
    <view class="hero" :style="{ paddingTop: statusBar + 'px' }">
      <view class="hero-inner">
        <view class="profile">
          <view class="avatar">
            <view class="sil" />
          </view>
          <view class="who">
            <view class="name-row">
              <text class="name">{{ session.user.nickName }}</text>
              <view class="medal">
                <VIcon name="medal" :size="30" color="#C9A36B" stroke="#7A5A1F" />
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
  background: var(--paper);
  padding-bottom: 140rpx;
}
.hero {
  background: var(--accent-soft);
  padding: 0 var(--page-x) 40rpx;
  border-bottom-left-radius: 36rpx;
  border-bottom-right-radius: 36rpx;
}.hero-inner {
  display: flex;
  flex-direction: column;
}
.profile {
  display: flex;
  gap: 24rpx;
  align-items: center;
  min-height: 132rpx;
  padding: 20rpx 0 32rpx;
}
.avatar {
  position: relative;
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: var(--paper-2);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
  box-shadow: var(--shadow-soft);
  border: 3rpx solid var(--paper-2);
}
.sil {
  width: 60rpx;
  height: 68rpx;
  border-radius: 40rpx 40rpx 12rpx 12rpx;
  background: var(--line);
  margin-bottom: 12rpx;
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
  gap: 14rpx;
}
.name {
  font-size: 42rpx;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.2;
  letter-spacing: -0.5rpx;
}
.medal {
  display: flex;
  align-items: center;
  gap: 6rpx;
  background: var(--paper-2);
  padding: 6rpx 16rpx 6rpx 6rpx;
  border-radius: var(--radius-pill);
  border: 1rpx solid var(--gold-soft);
}
.medal-t {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--gold);
  font-variant-numeric: tabular-nums;
}
.meta {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: var(--ink-2);
}
.stats {
  background: var(--paper-2);
  border-radius: var(--radius-card);
  padding: 32rpx 0;
  display: flex;
  align-items: center;
  box-shadow: var(--shadow-soft);
  border: 1rpx solid var(--line-soft);
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
  height: 56rpx;
  background: var(--line);
}
.sn {
  font-size: 44rpx;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  line-height: 1.1;
  letter-spacing: -0.5rpx;
}
.mute {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: var(--ink-3);
}
.body {
  padding: 36rpx var(--page-x);
  display: flex;
  flex-direction: column;
  gap: var(--mod-gap);
}
</style>

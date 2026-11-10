/* Hallmark · genre: playful · macrostructure: app-shell · theme: brand-magenta · designed-as-app */
<template>
  <view class="page">
    <view class="sky" :style="{ paddingTop: statusBar + 'px' }">
      <view class="nav">
        <view class="brand-wrap">
          <view class="brand-row">
            <image class="brand-logo" :src="logoUrl" mode="aspectFit" />
            <text class="brand">{{ appConfig.brand.name || '全民优享' }}</text>
          </view>
          <text class="slogan">{{ appConfig.brand.slogan || '每天打开，攒能量兑好物' }}</text>
        </view>
        <view class="wallet" @click="openLink('energy')">
          <image class="wallet-ico" :src="coinUrl" mode="aspectFit" />
          <view class="wallet-num">
            <text class="wn yx-num">{{ session.user.energy || session.user.points || 0 }}</text>
            <text class="we">能量值</text>
          </view>
        </view>
      </view>
    </view>

    <view class="body">
      <!-- 1. Banner → 2. 金刚区 → 3. 步数兑换 → 4. 准点兑换 → 5. 动态 → 其余 -->
      <ModuleRenderer v-for="mod in bannerMods" :key="'b-' + mod.id" :mod="mod" />
      <ModuleRenderer v-for="mod in quickMods" :key="'q-' + mod.id" :mod="mod" />
      <StepsExchangeBar v-if="!stepsMods.length" />
      <ModuleRenderer v-for="mod in stepsMods" :key="'s-' + mod.id" :mod="mod" />
      <ModuleRenderer v-for="mod in flashMods" :key="'f-' + mod.id" :mod="mod" />
      <ModuleRenderer v-for="mod in feedMods" :key="'a-' + mod.id" :mod="mod" />
      <ModuleRenderer v-for="mod in restMods" :key="'r-' + mod.id" :mod="mod" />
    </view>
    <view class="safe" />
    <RewardPopup />
    <HomeEntryPopup />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow, onShareAppMessage } from '@dcloudio/uni-app'
import ModuleRenderer from '../../components/modules/ModuleRenderer.vue'
import StepsExchangeBar from '../../components/modules/StepsExchangeBar.vue'
import RewardPopup from '../../components/RewardPopup.vue'
import HomeEntryPopup from '../../components/HomeEntryPopup.vue'
import { appConfig, pageModules, refreshAppConfigIfNeeded } from '../../store/appConfig.js'
import { session } from '../../store/session.js'
import { openLink } from '../../utils/navigate.js'
import { syncTabBar } from '../../utils/tabbar.js'
import { buildInvitePath, resolveShareMessage } from '../../utils/share.js'

onShareAppMessage(() =>
  resolveShareMessage({
    title: '帮我点一下，我差最后一口粮',
    path: buildInvitePath({ channel: 'share_home' }),
  })
)

const statusBar = ref(20)
try {
  statusBar.value = uni.getSystemInfoSync().statusBarHeight || 20
} catch (e) {}

const modules = computed(() => pageModules('home'))
const bannerMods = computed(() => modules.value.filter((m) => m.type === 'banner_swiper'))
const quickMods = computed(() => modules.value.filter((m) => m.type === 'quick_grid'))
const stepsMods = computed(() => modules.value.filter((m) => m.type === 'steps_exchange'))
const flashMods = computed(() =>
  modules.value.filter((m) => m.type === 'countdown_bar' || m.type === 'flash_redeem')
)
const feedMods = computed(() => modules.value.filter((m) => m.type === 'activity_ticker'))
const restMods = computed(() =>
  modules.value.filter(
    (m) =>
      m.type !== 'banner_swiper' &&
      m.type !== 'quick_grid' &&
      m.type !== 'steps_exchange' &&
      m.type !== 'countdown_bar' &&
      m.type !== 'flash_redeem' &&
      m.type !== 'activity_ticker' &&
      m.type !== 'checkin_strip' // 签到已迁到个人中心
  )
)

const icons = computed(() => (appConfig.catalog && appConfig.catalog.icons) || {})
const brand = computed(() => appConfig.brand || {})
const logoUrl = computed(
  () => brand.value.logoUrl || icons.value.logo || icons.value.brand || '/static/brand/logo.png'
)
const coinUrl = computed(() => icons.value.coin || icons.value.walletCoin || '/static/ui/ico-coin.png')

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
  align-items: flex-start;
  gap: 16rpx;
}
.brand-wrap {
  min-width: 0;
  flex: 1;
}
.brand-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.brand-logo {
  width: 48rpx;
  height: 48rpx;
  border-radius: 12rpx;
}
.brand {
  font-size: 34rpx;
  font-weight: 800;
  color: var(--ink);
}
.slogan {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: var(--mute);
}
.wallet {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 10rpx 16rpx;
  background: #fff;
  border-radius: 999rpx;
  box-shadow: var(--shadow);
}
.wallet-ico {
  width: 36rpx;
  height: 36rpx;
}
.wallet-num {
  display: flex;
  flex-direction: column;
}
.wn {
  font-size: 26rpx;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.1;
}
.we {
  font-size: 18rpx;
  color: var(--mute);
}
.body {
  padding: 8rpx var(--page-x) 0;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.safe {
  height: 24rpx;
}
</style>

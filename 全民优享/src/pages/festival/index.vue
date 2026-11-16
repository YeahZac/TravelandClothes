<template>
  <view class="page" :class="{ 'has-dock': registerOn }">
    <view class="body">
      <!-- CMS 介绍模块：跳过票务列表（改由原生报名面板支付） -->
      <ModuleRenderer
        v-for="mod in introMods"
        :key="mod.id"
        :mod="mod"
      />

      <view v-if="!hasHero" class="intro">
        <image
          class="hero-img"
          :src="heroImage"
          mode="widthFix"
        />
        <text class="title">{{ event.title }}</text>
        <text class="theme">{{ event.theme }}</text>
        <view class="meta-row">
          <text class="meta">{{ event.dates }}</text>
          <text class="meta">{{ event.venue }}</text>
        </view>
        <view class="price-card">
          <text class="pc-h">报名费用</text>
          <view class="pc-row"><text>成人</text><text>{{ priceBoard.adultLine }}</text></view>
          <view class="pc-row"><text>儿童/学生</text><text>{{ priceBoard.childLine }}</text></view>
        </view>
      </view>

      <FestivalRegisterPanel v-if="registerOn" />
    </view>
    <view class="safe" />
    <RewardPopup />
    <LoginSheet />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import ModuleRenderer from '../../components/modules/ModuleRenderer.vue'
import FestivalRegisterPanel from '../../components/FestivalRegisterPanel.vue'
import RewardPopup from '../../components/RewardPopup.vue'
import LoginSheet from '../../components/LoginSheet.vue'
import { appConfig, pageModules, refreshAppConfigIfNeeded } from '../../store/appConfig.js'
import { visitFestivalDone } from '../../store/session.js'
import { syncTabBar } from '../../utils/tabbar.js'
import { reportTaskBrowse } from '../../utils/taskActionReport.js'
import { USE_REMOTE, request } from '../../api/request.js'

const SKIP_TYPES = new Set(['ticket_list'])
const allMods = computed(() => pageModules('festival'))
const introMods = computed(() => (allMods.value || []).filter((m) => m && !SKIP_TYPES.has(m.type)))
const hasHero = computed(() => (introMods.value || []).some((m) => m.type === 'festival_hero' || m.type === 'rich_text'))

/** 后台 ops.festival.registerEnabled；默认开启 */
const registerOn = computed(() => {
  const f = (appConfig.ops && appConfig.ops.festival) || {}
  return f.registerEnabled !== false
})

const heroImage = ref(
  'https://yx.linyio.com/api/traffic/v1/media/file?key=qmyx%2Ffestival%2F1794794597285_festival-hero-2026.jpg'
)
const event = ref({
  title: '2026汉服节·中国广州',
  theme: '星火成炬，四海归衣',
  dates: '2026年11月28—29日',
  venue: '广州·岭南印象园',
})
const priceBoard = ref({
  adultLine: '28日 ¥30 · 29日 ¥42 · 联报 ¥60',
  childLine: '28/29日 ¥20 · 联报 ¥35',
})

async function loadEventMeta() {
  if (!USE_REMOTE) return
  try {
    const data = await request('/api/traffic/v1/festival/tickets')
    if (data && data.event) {
      event.value = { ...event.value, ...data.event }
      if (data.event.heroImage) heroImage.value = data.event.heroImage
    }
    const board = (data && data.priceBoard) || (data && data.event && data.event.priceBoard)
    if (board && board.adultLine) priceBoard.value = board
  } catch (_) {}
}

onShow(async () => {
  await refreshAppConfigIfNeeded()
  await loadEventMeta()
  visitFestivalDone()
  syncTabBar(2)
  reportTaskBrowse('browse_festival')
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f6f1ea;
  padding-bottom: 48rpx;
}
.page.has-dock {
  padding-bottom: 120rpx;
}
.body {
  padding: 0 32rpx 32rpx;
}
.intro {
  margin-bottom: 36rpx;
}
.hero-img {
  width: 100%;
  border-radius: 20rpx;
  margin-bottom: 20rpx;
  background: #f3ebe3;
}
.title {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
  color: #1f1814;
  letter-spacing: 1rpx;
}
.theme {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #8a4b2e;
}
.meta-row {
  margin-top: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.meta {
  font-size: 26rpx;
  color: #5c574f;
}
.price-card {
  margin-top: 24rpx;
  padding: 22rpx 24rpx;
  background: #fffdf9;
  border-radius: 18rpx;
  border: 1rpx solid #ebe3d8;
}
.pc-h {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #1f1814;
  margin-bottom: 12rpx;
}
.pc-row {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  font-size: 24rpx;
  color: #5c574f;
  line-height: 1.5;
  margin-bottom: 8rpx;
}
.safe {
  height: calc(24rpx + env(safe-area-inset-bottom));
}
</style>

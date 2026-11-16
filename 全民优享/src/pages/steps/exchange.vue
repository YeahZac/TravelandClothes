<template>
  <view class="yx-page gift-list yx-safe-bottom">
    <view class="intro">
      <text class="title">换步数</text>
      <text class="lead">今日 {{ steps }} 步。下面是后台配置的每一档，走满对应步数即可兑换。</text>
      <view class="modes">
        <text class="mode on" @click="onSync">{{ busy ? '同步中' : '同步步数' }}</text>
        <text class="mode" @click="goHistory">达标记录</text>
      </view>
    </view>

    <view v-if="!cards.length" class="empty">后台还没有配置步数档位</view>

    <view v-for="t in cards" :key="t.id" class="gift" @click="onTier(t)">
      <view class="cover" :class="t.photo ? '' : t.tone">
        <CmsImage
          v-if="t.photo"
          :src="t.photo"
          mode="aspectFill"
          placeholder="/static/ui/ico-gift.jpg"
          :show-placeholder="true"
        />
        <view v-else class="cover-fallback">
          <image class="cover-ico" :src="t.iconUrl" mode="aspectFit" />
          <text class="cover-cap">{{ t.coverLabel }}</text>
        </view>
        <text class="wave">第{{ t.index }}档</text>
      </view>
      <view class="body">
        <view class="top">
          <text class="name">{{ t.name }}</text>
          <text class="tag">{{ t.tag }}</text>
        </view>
        <text class="desc">{{ t.desc }}</text>
        <view class="foot">
          <text class="price">{{ t.rewardText }}</text>
          <text class="cta-hint" :class="{ done: t.claimed, ready: t.unlocked && !t.claimed }">{{ t.cta }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import CmsImage from '../../components/CmsImage.vue'
import { appConfig } from '../../store/appConfig.js'
import { session } from '../../store/session.js'
import { USE_REMOTE, getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { fetchStepsStatus, apiStepsSync, apiStepsClaim } from '../../api/growth.js'
import { getWeRunPayload, openWeRunSetting } from '../../utils/werun.js'
import { goLogin } from '../../utils/loginGate.js'
import { applyWalletEnergy, flashEnergyDelta } from '../../utils/energyFx.js'
import { bindPullRefresh } from '../../utils/pullRefresh.js'
import { resolveLinkEntryTitle, LINK_TITLE_FALLBACK } from '../../utils/entrySlots.js'
import { usePageShare } from '../../utils/share.js'

usePageShare({ channel: 'share_steps' })

const TONES = ['tone-peach', 'tone-mint', 'tone-lilac', 'tone-sun', 'tone-coral']
const coinUrl = computed(() => {
  const icons = (appConfig.catalog && appConfig.catalog.icons) || {}
  const assets = appConfig.assets || {}
  return icons.coin || icons.walletCoin || assets.coin || '/static/ui/ico-coin.jpg'
})
const giftIcon = computed(() => {
  const icons = (appConfig.catalog && appConfig.catalog.icons) || {}
  const assets = appConfig.assets || {}
  return icons.gift || icons.chest || assets.chest || '/static/ui/ico-gift.jpg'
})
const steps = ref(Number(session.user.stepsToday) || 0)
const remoteTiers = ref(null)
const requireCheckin = ref(true)
const checkedIn = ref(false)
const busy = ref(false)

function configTiers() {
  const list = (appConfig.game && appConfig.game.steps && appConfig.game.steps.tiers) || []
  if (Array.isArray(list) && list.length) return list
  return [
    { steps: 3000, energy: 30, rewardType: 'energy' },
    { steps: 6000, energy: 80, rewardType: 'energy' },
    { steps: 10000, energy: 120, rewardType: 'energy' },
  ]
}

const cards = computed(() => {
  const src = remoteTiers.value || configTiers()
  const walked = Number(steps.value) || 0
  return src.map((t, i) => {
    const n = Number(t.steps) || 0
    const physical = String(t.rewardType || '') === 'physical' && !!(t.productId || t.productName || t.name)
    const energy = Number(t.energy) || 0
    const name = physical
      ? t.productName || t.name || t.label || `达标 ${n} 步礼品`
      : `走满 ${n} 步`
    const claimed = !!t.claimed
    const unlocked = t.unlocked != null ? !!t.unlocked : walked >= n
    let cta = `还差 ${Math.max(0, n - walked)} 步`
    if (claimed) cta = '已领取'
    else if (unlocked) cta = '领取'
    return {
      id: `${n}-${i}`,
      index: i + 1,
      steps: n,
      name,
      tag: physical ? '实物' : '能量值',
      desc: physical
        ? `今日步数达到 ${n} 步，可兑换这件礼品`
        : `今日步数达到 ${n} 步，可兑换 ${energy} 能量值`,
      rewardText: physical ? t.productName || t.name || '实物礼品' : `+${energy} 能量值`,
      photo: physical ? t.productImageUrl || t.imageUrl || t.coverUrl || '' : '',
      iconUrl: physical ? giftIcon.value : coinUrl.value,
      coverLabel: physical ? '礼品' : `+${energy}`,
      tone: TONES[i % TONES.length],
      cta,
      claimed,
      unlocked,
    }
  })
})

function applyStatus(r) {
  if (!r) return
  if (r.steps != null) steps.value = Number(r.steps) || 0
  if (Array.isArray(r.tiers)) remoteTiers.value = r.tiers
  if (r.requireCheckin != null) requireCheckin.value = !!r.requireCheckin
  if (r.checkedIn != null) checkedIn.value = !!r.checkedIn
  session.user.stepsToday = steps.value
  if (r.wallet && r.wallet.energy != null) applyWalletEnergy(r.wallet.energy)
}

async function reload() {
  const title = resolveLinkEntryTitle('energy', appConfig.pages) || LINK_TITLE_FALLBACK.energy || '换步数'
  uni.setNavigationBarTitle({ title })
  if (!(USE_REMOTE && getToken() && isLoggedIn())) {
    remoteTiers.value = null
    return
  }
  try {
    applyStatus(await fetchStepsStatus())
  } catch (_) {}
}

async function onSync() {
  if (busy.value) return
  if (USE_REMOTE && !(getToken() && isLoggedIn())) {
    goLogin('/pages/steps/exchange')
    return
  }
  busy.value = true
  try {
    const wr = await getWeRunPayload({ allowMock: true })
    if (wr.needSetting) {
      uni.showModal({
        title: '需要步数权限',
        content: wr.msg || '请开启运动步数',
        confirmText: '去设置',
        success: async (res) => {
          if (res.confirm) await openWeRunSetting()
        },
      })
      return
    }
    if (!wr.ok && !wr.mock) {
      uni.showToast({ title: wr.msg || '未获取到步数', icon: 'none' })
      return
    }
    const payload = wr.ok
      ? { encryptedData: wr.encryptedData, iv: wr.iv, source: wr.source || 'werun' }
      : { steps: Number(wr.steps) || 0, source: wr.source || 'werun_mock' }
    // #ifdef MP-WEIXIN
    const wxLogin = await new Promise((resolve) => {
      uni.login({ provider: 'weixin', success: resolve, fail: () => resolve(null) })
    })
    if (wxLogin && wxLogin.code) payload.code = wxLogin.code
    // #endif
    const synced = await apiStepsSync(payload)
    applyStatus(synced)
    uni.showToast({ title: `已同步 ${steps.value} 步`, icon: 'none' })
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '同步失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

async function onTier(t) {
  if (t.claimed) {
    uni.showToast({ title: '这一档已经领取', icon: 'none' })
    return
  }
  if (!t.unlocked) {
    uni.showToast({ title: t.cta, icon: 'none' })
    return
  }
  if (USE_REMOTE && !(getToken() && isLoggedIn())) {
    goLogin('/pages/steps/exchange')
    return
  }
  if (requireCheckin.value && !checkedIn.value) {
    uni.showToast({ title: '先完成今日签到，再领步数奖励', icon: 'none' })
    return
  }
  if (busy.value) return
  busy.value = true
  try {
    const before = Number(session.user.energy || 0)
    const r = await apiStepsClaim()
    applyStatus(r)
    const got = Number((r.reward && r.reward.energy) || 0)
    if (!(r.wallet && r.wallet.energy != null) && got > 0) {
      session.user.energy = before + got
      flashEnergyDelta(got)
    }
    uni.showToast({ title: (r && r.msg) || '领取成功', icon: 'none' })
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '领取失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

function goHistory() {
  uni.navigateTo({ url: '/pages/steps/history' })
}

onShow(reload)
bindPullRefresh(reload)
</script>

<style scoped lang="scss">
.gift-list {
  padding: 24rpx 28rpx 48rpx;
  background: #f6f7fb;
  min-height: 100vh;
}
.intro {
  margin-bottom: 20rpx;
  padding: 28rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #fff1f2 0%, #fff7ed 100%);
}
.title {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
  color: #111827;
}
.lead {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #9f1239;
  line-height: 1.45;
}
.modes {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}
.mode {
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.85);
  font-size: 22rpx;
  color: #6b7280;
}
.mode.on {
  background: #e11d48;
  color: #fff;
  font-weight: 700;
}
.empty {
  padding: 40rpx 8rpx;
  color: #6b7280;
  font-size: 26rpx;
}
.gift {
  display: flex;
  gap: 20rpx;
  margin-bottom: 16rpx;
  padding: 18rpx;
  background: #fff;
  border-radius: 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(17, 24, 39, 0.05);
}
.cover {
  width: 180rpx;
  height: 180rpx;
  border-radius: 16rpx;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
  background: #f3f4f6;
}
.cover :deep(.cms-img),
.cover :deep(.cms-ph) {
  width: 100%;
  height: 100%;
}
.cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
}
.tone-peach { background: #ffe8df; }
.tone-mint { background: #e5f8f4; }
.tone-lilac { background: #f0ebff; }
.tone-sun { background: #fff1dc; }
.tone-coral { background: #ffe4df; }
.cover-ico {
  width: 96rpx;
  height: 96rpx;
}
.cover-cap {
  font-size: 22rpx;
  font-weight: 800;
  color: #9f1239;
  line-height: 1;
}
.wave {
  position: absolute;
  left: 8rpx;
  top: 8rpx;
  font-size: 18rpx;
  font-weight: 700;
  padding: 4rpx 10rpx;
  border-radius: 8rpx;
  color: #fff;
  background: #f97316;
}
.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.top {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.name {
  font-size: 30rpx;
  font-weight: 700;
  color: #111827;
}
.tag {
  font-size: 18rpx;
  color: #e11d48;
  background: #fff1f2;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  font-weight: 700;
}
.desc {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #6b7280;
  line-height: 1.4;
}
.foot {
  margin-top: auto;
  padding-top: 12rpx;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12rpx;
}
.price {
  font-size: 28rpx;
  font-weight: 800;
  color: #e11d48;
}
.cta-hint {
  flex-shrink: 0;
  font-size: 20rpx;
  color: #fff;
  background: #111827;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  font-weight: 600;
}
.cta-hint.ready {
  background: #e11d48;
}
.cta-hint.done {
  background: #d1d5db;
  color: #4b5563;
}
</style>

<template>
  <view class="hero">
    <view class="nav">
      <view>
        <text class="title">{{ mod.title || appConfig.brand.skin || '能量罐' }}</text>
        <text class="greet">连签 {{ session.checkin.streak }} 天 · 正在攒{{ session.growth.targetGift }}</text>
      </view>
      <view class="pills">
        <view class="pill">
          <text class="pn yx-num">{{ session.user.energy }}</text>
          <text class="pu">能量</text>
        </view>
        <view class="pill outline" @click="openLink('lottery')">
          <text class="pn yx-num">{{ session.user.lotteryChance }}</text>
          <text class="pu">抽次</text>
        </view>
      </view>
    </view>

    <view class="stage">
      <image class="float f1" src="/static/ui/ico-coin.png" mode="aspectFit" />
      <image class="float f2" src="/static/ui/ico-coin.png" mode="aspectFit" />
      <view class="ellipse" />
      <view class="can">
        <view class="rim" />
        <view class="glass">
          <view class="shine" />
          <view class="liquid" :style="{ height: session.growth.current + '%' }" />
          <text class="pct yx-num">{{ session.growth.current }}%</text>
        </view>
      </view>
      <text class="hint">{{ session.growth.daysLeftHint }}</text>
    </view>

    <button class="cta" @click="chargeEnergy">{{ chargeCta }}</button>
    <view class="goal">
      <text>{{ goalPrefix }}{{ session.growth.targetGift }}</text>
      <text class="link" @click="openLink(giftLink)">{{ giftCta }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { session, chargeEnergy } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { openLink } from '../../utils/navigate.js'

const props = defineProps({ mod: Object })
const p = computed(() => props.mod.payload || {})
const chargeCta = computed(() => p.value.chargeCta || '充能')
const goalPrefix = computed(() => p.value.goalPrefix || '目标 · ')
const giftCta = computed(() => p.value.giftCta || '去兑礼')
const giftLink = computed(() => p.value.giftLinkKey || 'gift')
</script>

<style scoped>
.hero { text-align: center; }
.nav {
  display: flex; justify-content: space-between; align-items: flex-start;
  text-align: left; margin-bottom: 8rpx;
}
.title { display: block; font-size: 40rpx; font-weight: 700; color: #121826; line-height: 1.2; }
.greet { display: block; margin-top: 6rpx; font-size: 22rpx; color: #5e6977; }
.pills { display: flex; gap: 10rpx; }
.pill {
  min-width: 96rpx; padding: 10rpx 16rpx; border-radius: 999rpx;
  background: rgba(255,255,255,.92); text-align: center;
  box-shadow: 0 6rpx 16rpx rgba(18,24,38,.06);
}
.pill.outline {
  background: transparent; border: 2rpx solid rgba(18,24,38,.18); box-shadow: none;
}
.pn { display: block; font-size: 24rpx; font-weight: 700; color: #121826; font-variant-numeric: tabular-nums; }
.pu { display: block; margin-top: 2rpx; font-size: 18rpx; color: #5e6977; }
.stage {
  position: relative; height: 520rpx;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.ellipse {
  position: absolute; left: 16%; right: 16%; bottom: 96rpx; height: 56rpx;
  border-radius: 50%; background: rgba(126,182,255,.55);
}
.can { position: relative; z-index: 2; width: 220rpx; }
.rim {
  height: 28rpx; margin: 0 24rpx; border-radius: 12rpx;
  background: linear-gradient(180deg, #eef1f5, #9aa3b2);
  box-shadow: 0 4rpx 0 rgba(18,24,38,.1);
}
.glass {
  position: relative; height: 320rpx; margin-top: -2rpx;
  border-radius: 18rpx 18rpx 52rpx 52rpx;
  background: rgba(255,255,255,.28);
  border: 4rpx solid rgba(255,255,255,.78);
  overflow: hidden;
  box-shadow: 0 18rpx 36rpx rgba(36,91,219,.28);
}
.shine {
  position: absolute; left: 12%; top: 8%; width: 18%; height: 62%;
  border-radius: 40rpx; background: rgba(255,255,255,.35); z-index: 2;
}
.liquid {
  position: absolute; left: 0; right: 0; bottom: 0;
  background: linear-gradient(180deg, #8ef0c0, #1fbf73 70%);
  transition: height .4s ease;
}
.pct {
  position: absolute; left: 0; right: 0; top: 44%; z-index: 3;
  font-size: 64rpx; font-weight: 700; color: #fff;
  text-shadow: 0 4rpx 12rpx rgba(12,18,32,.28);
  font-variant-numeric: tabular-nums;
}
.hint { margin-top: 8rpx; font-size: 22rpx; color: #5e6977; z-index: 2; }
.float { position: absolute; z-index: 3; width: 64rpx; height: 64rpx; }
.f1 { left: 6%; top: 16%; }
.f2 { right: 4%; top: 10%; width: 80rpx; height: 80rpx; }
.cta {
  width: 480rpx; height: 80rpx; margin-top: 24rpx; border: none; border-radius: 999rpx;
  background: linear-gradient(180deg, #ff8a2a, #f06400); color: #fff;
  font-size: 28rpx; font-weight: 600; box-shadow: 0 6rpx 0 #c44800;
}
.cta::after { border: none; }
.cta:active { transform: scale(.98); }
.goal {
  margin-top: 20rpx; display: flex; justify-content: center; gap: 16rpx;
  font-size: 22rpx; color: #5e6977;
}
.link { color: #245bdb; font-weight: 600; }
</style>

/* Hallmark · genre: playful · macrostructure: app-shell · theme: cream-amber-sage · designed-as-app */
<template>
  <view class="hero">
    <view class="nav">
      <view class="who">
        <text class="title">{{ mod.title || appConfig.brand.skin || '能量罐' }}</text>
        <text class="greet">连签 {{ session.checkin.streak }} 天 · 第 {{ stageIndex }} 罐 · 正在攒{{ session.growth.targetGift }}</text>
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

    <!-- 游戏舞台 -->
    <view class="stage">
      <!-- 浮动矢量币（无锯齿） -->
      <view class="float f1"><VIcon name="coin" :size="48" color="#E5A23E" /></view>
      <view class="float f2"><VIcon name="coin" :size="64" color="#C9A36B" /></view>
      <view class="float f3"><VIcon name="coin" :size="40" color="#E5A23E" /></view>

      <view class="ground" />

      <view class="can">
        <view class="rim" />
        <view class="glass">
          <view class="shine" />
          <view class="liquid" :style="{ height: session.growth.current + '%' }">
            <view class="wave" />
          </view>
          <view class="pct-wrap">
            <text class="pct yx-num">{{ session.growth.current }}%</text>
            <text class="pct-cap">养成进度</text>
          </view>
        </view>
      </view>

      <view class="hint-bubble">
        <text class="hint-t">{{ session.growth.daysLeftHint }}</text>
      </view>
    </view>

    <!-- 三键游戏操作 -->
    <view class="actions">
      <view class="act" @click="onWater">
        <view class="act-ico sage"><VIcon name="coin" :size="40" color="#7FA67A" /></view>
        <text class="act-t">浇水</text>
        <text class="act-s">+15 · 3h 冷却</text>
      </view>
      <view class="act primary" @click="chargeEnergy">
        <view class="act-ico amber"><VIcon name="coin" :size="40" color="#FFFFFF" stroke="#B87A1F" /></view>
        <text class="act-t">充能</text>
        <text class="act-s">+28 立即</text>
      </view>
      <view class="act" @click="openLink('friends')">
        <view class="act-ico lavender"><VIcon name="invite" :size="40" color="#9B8FBF" /></view>
        <text class="act-t">去偷</text>
        <text class="act-s">好友能量</text>
      </view>
    </view>

    <!-- 好友行（可偷/可助） -->
    <view class="friends">
      <text class="friends-label">好友能量</text>
      <view class="friends-row">
        <view v-for="f in friends" :key="f.id" class="friend" @click="onFriend(f)">
          <view class="fav" :class="{ stealable: f.status === 'stealable' }">
            <text class="fav-mark">{{ f.name.charAt(0) }}</text>
          </view>
          <text class="fav-name">{{ f.name }}</text>
          <text v-if="f.status === 'stealable'" class="fav-tag">可偷 {{ f.energy }}</text>
          <text v-else class="fav-tag mute">已收</text>
        </view>
      </view>
    </view>

    <view class="goal">
      <text class="goal-t">{{ goalPrefix }}{{ session.growth.targetGift }}</text>
      <text class="link" @click="openLink(giftLink)">{{ giftCta }} ›</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { session, chargeEnergy, stealFriend } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { openLink } from '../../utils/navigate.js'
import VIcon from '../VIcon.vue'

const props = defineProps({ mod: Object })
const p = computed(() => props.mod.payload || {})
const chargeCta = computed(() => p.value.chargeCta || '充能')
const goalPrefix = computed(() => p.value.goalPrefix || '目标 · ')
const giftCta = computed(() => p.value.giftCta || '去兑礼')
const giftLink = computed(() => p.value.giftLinkKey || 'gift')

// 关卡：按累计兑礼次数推算（mock 用 stage 字段）
const stageIndex = computed(() => session.growth.stage || 1)

// 好友（取 session 前 4 个）
const friends = computed(() => (session.friends || []).slice(0, 4))

function onWater() {
  // 浇水 = 充能的轻量版（复用 chargeEnergy 的 +28，这里给 +15）
  // 实际后端会幂等记账；mock 阶段直接调 chargeEnergy 演示
  chargeEnergy()
}
function onFriend(f) {
  if (f.status === 'stealable') {
    const r = stealFriend(f.id)
    uni.showToast({ title: r.msg, icon: 'none' })
  } else {
    openLink('friends')
  }
}
</script>

<style scoped>
.hero {
  text-align: center;
}
.nav {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  text-align: left;
  margin-bottom: 8rpx;
}
.who {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.title {
  font-size: 40rpx;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.2;
  letter-spacing: -0.5rpx;
}
.greet {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: var(--ink-3);
}
.pills {
  display: flex;
  gap: 12rpx;
}
.pill {
  min-width: 104rpx;
  padding: 12rpx 20rpx;
  border-radius: var(--radius-pill);
  background: var(--paper-2);
  text-align: center;
  box-shadow: var(--shadow-soft);
  border: 1rpx solid var(--line-soft);
}
.pill.outline {
  background: transparent;
  border: 2rpx solid var(--line);
  box-shadow: none;
}
.pn {
  display: block;
  font-size: 26rpx;
  font-weight: 800;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.pu {
  display: block;
  margin-top: 4rpx;
  font-size: 18rpx;
  color: var(--ink-3);
}

/* 游戏舞台 */
.stage {
  position: relative;
  height: 560rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 16rpx 0 8rpx;
}
.ground {
  position: absolute;
  left: 18%;
  right: 18%;
  bottom: 88rpx;
  height: 48rpx;
  border-radius: 50%;
  background: var(--sage-soft);
  opacity: 0.7;
}
.can {
  position: relative;
  z-index: 2;
  width: 240rpx;
}
.rim {
  height: 32rpx;
  margin: 0 28rpx;
  border-radius: 14rpx;
  background: linear-gradient(180deg, var(--paper-3), var(--line));
  box-shadow: 0 4rpx 0 rgba(43, 37, 32, 0.08);
}
.glass {
  position: relative;
  height: 360rpx;
  margin-top: -2rpx;
  border-radius: 20rpx 20rpx 56rpx 56rpx;
  background: rgba(255, 255, 255, 0.4);
  border: 4rpx solid rgba(255, 255, 255, 0.85);
  overflow: hidden;
  box-shadow: var(--shadow-stage);
}
.shine {
  position: absolute;
  left: 14%;
  top: 8%;
  width: 16%;
  height: 60%;
  border-radius: 40rpx;
  background: rgba(255, 255, 255, 0.4);
  z-index: 2;
}
.liquid {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, #9ec098, var(--sage) 70%, var(--sage-deep));
  transition: height 0.4s var(--ease-out);
}
.wave {
  position: absolute;
  top: -6rpx;
  left: 0;
  right: 0;
  height: 12rpx;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 50%;
}
.pct-wrap {
  position: absolute;
  left: 0;
  right: 0;
  top: 40%;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.pct {
  font-size: 68rpx;
  font-weight: 800;
  color: var(--paper-2);
  text-shadow: 0 4rpx 12rpx rgba(43, 37, 32, 0.28);
  font-variant-numeric: tabular-nums;
  letter-spacing: -1rpx;
  line-height: 1;
}
.pct-cap {
  margin-top: 6rpx;
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.85);
}
.hint-bubble {
  position: absolute;
  bottom: 24rpx;
  left: 50%;
  transform: translateX(-50%);
  background: var(--paper-2);
  border: 1rpx solid var(--line-soft);
  border-radius: var(--radius-pill);
  padding: 10rpx 24rpx;
  box-shadow: var(--shadow-soft);
  z-index: 4;
}
.hint-t {
  font-size: 22rpx;
  color: var(--ink-2);
  font-weight: 500;
}
.float {
  position: absolute;
  z-index: 3;
}
.f1 { left: 8%; top: 14%; }
.f2 { right: 6%; top: 8%; }
.f3 { left: 14%; bottom: 28%; }

/* 三键 */
.actions {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  margin: 16rpx 0 28rpx;
}
.act {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 24rpx 12rpx;
  border-radius: var(--radius-card);
  background: var(--paper-2);
  border: 1rpx solid var(--line-soft);
  box-shadow: var(--shadow-soft);
}
.act:active {
  transform: scale(0.97);
}
.act.primary {
  background: var(--accent);
  border-color: var(--accent-deep);
}
.act-ico {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.act-ico.sage { background: var(--sage-soft); }
.act-ico.amber { background: var(--accent-deep); }
.act-ico.lavender { background: var(--lavender-soft); }
.act-t {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--ink);
}
.act.primary .act-t {
  color: var(--ink-on-accent);
}
.act-s {
  font-size: 20rpx;
  color: var(--ink-3);
}
.act.primary .act-s {
  color: rgba(255, 255, 255, 0.85);
}

/* 好友行 */
.friends {
  background: var(--paper-2);
  border-radius: var(--radius-card);
  padding: 28rpx 32rpx;
  border: 1rpx solid var(--line-soft);
  box-shadow: var(--shadow-soft);
  text-align: left;
}
.friends-label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--ink-2);
  margin-bottom: 20rpx;
}
.friends-row {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
}
.friend {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  flex: 1;
}
.friend:active {
  transform: scale(0.96);
}
.fav {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: var(--paper-3);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid var(--line);
}
.fav.stealable {
  background: var(--sage-soft);
  border-color: var(--sage);
}
.fav-mark {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--ink-2);
}
.fav-name {
  font-size: 20rpx;
  color: var(--ink-2);
  font-weight: 500;
}
.fav-tag {
  font-size: 18rpx;
  color: var(--sage-deep);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.fav-tag.mute {
  color: var(--ink-3);
  font-weight: 400;
}

/* 目标 */
.goal {
  margin-top: 24rpx;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16rpx;
  font-size: 22rpx;
  color: var(--ink-3);
}
.goal-t {
  color: var(--ink-2);
}
.link {
  color: var(--accent-text);
  font-weight: 600;
}
</style>

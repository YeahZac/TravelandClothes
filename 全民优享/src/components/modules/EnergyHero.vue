/* Hallmark · genre: playful · macrostructure: app-shell · theme: cream-amber-sage · designed-as-app
 * 能量罐 V2 游戏舞台：产能量倒计时 / 收取 / 浇水冷却 / 偷+助力 / 虫害事件 / 关卡兑礼
 */
<template>
  <view class="hero">
    <view class="nav">
      <view class="who">
        <text class="title">{{ mod.title || appConfig.brand.skin || '能量罐' }}</text>
        <text class="greet">第 {{ stageName }} · 连签 {{ session.checkin.streak }} 天</text>      </view>
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

    <!-- 1. 订阅提醒条（回访拉活） -->
    <view v-if="showSubscribeBar" class="sub-bar" @click="onEnableSubscribe">
      <view class="sub-left">
        <VIcon name="bell" :size="36" color="#E5A23E" />
        <view class="sub-copy">
          <text class="sub-t">开启能量提醒</text>
          <text class="sub-s">到账 / 虫害告急推你回来</text>
        </view>
      </view>
      <text class="sub-cta">开启</text>
    </view>
    <view v-else-if="hasAnySubscribe()" class="sub-bar on">
      <VIcon name="bell" :size="32" color="#7FA67A" />
      <text class="sub-t on">提醒已开 · 到点会叫你</text>
    </view>

    <!-- 3. 谁偷过我 / 谁浇过我 -->
    <view v-if="feedItems.length" class="feed">
      <view class="feed-head">
        <text class="feed-label">动态</text>
        <text v-if="jar.feedUnread" class="feed-unread yx-num">{{ jar.feedUnread }} 条新</text>
        <text class="feed-clear" @click="onMarkFeedRead">已读</text>
      </view>
      <view
        v-for="item in feedItems"
        :key="item.id"
        class="feed-bubble"
        :class="item.type"
        @click="dismissFeedItem(item.id)"
      >
        <view class="feed-av">{{ item.name.charAt(0) }}</view>
        <view class="feed-body">
          <text class="feed-line">
            <text class="feed-name">{{ item.name }}</text>
            {{ item.tip }}
            <text v-if="item.amount" class="feed-amt yx-num"> · {{ item.amount }}</text>
          </text>
          <text class="feed-time">{{ item.time }}</text>
        </view>
        <text class="feed-x">×</text>
      </view>
    </view>

    <!-- 游戏舞台 -->
    <view class="stage">
      <!-- 浮动矢量币 -->
      <view class="float f1"><VIcon name="coin" :size="48" color="#E5A23E" /></view>
      <view class="float f2"><VIcon name="coin" :size="64" color="#C9A36B" /></view>

      <!-- 产能量倒计时气泡 -->
      <view class="bubble top" :class="{ ready: harvestReady }">
        <VIcon v-if="harvestReady" name="collect" :size="34" color="#7FA67A" stroke="#2B2520" />
        <text class="bubble-t yx-num">{{ bubbleText }}</text>
      </view>

      <view class="ground" />

      <view class="can" :class="{ full: isFull() }">
        <view class="rim" />
        <view class="glass">
          <view class="shine" />
          <view class="liquid" :style="{ height: jar.liquid + '%' }">
            <view class="wave" />
          </view>
          <view class="pct-wrap">
            <text class="pct yx-num">{{ jar.liquid }}%</text>
            <text class="pct-cap">{{ isFull() ? '罐子满了' : '养成进度' }}</text>
          </view>

          <!-- 待收能量徽标 -->
          <view v-if="jar.pending > 0" class="pending-badge">
            <VIcon name="spark" :size="30" color="#E5A23E" />
            <text class="pending-n yx-num">+{{ jar.pending }}</text>
          </view>

          <!-- 虫害/干旱事件 -->
          <view v-if="jar.event" class="event" @click.stop="onClearEvent">
            <view class="event-ico">
              <VIcon :name="jar.event.type === 'pest' ? 'bug' : 'water'" :size="40" color="#C23A2A" stroke="#2B2520" />
            </view>
            <text class="event-t">{{ jar.event.type === 'pest' ? '有虫子！' : '缺水了！' }}</text>
            <text class="event-s">点击处理 · 24h 内有效</text>
          </view>
        </view>
      </view>

      <!-- 飘字动效 -->
      <view
        v-for="f in jar.fx"
        :key="f.id"
        class="fx"
        :class="'tone-' + f.tone"
        :style="{ left: f.x + '%', top: f.y + '%' }"
      >
        <text class="fx-t yx-num">{{ f.text }}</text>
      </view>
    </view>

    <!-- 主操作：收取（待收>0 且到点）/ 满罐兑礼 -->
    <view class="primary-row">
      <button v-if="isFull()" class="cta redeem" @click="onRedeem">罐子满了 · 去兑礼</button>
      <button v-else-if="jar.pending > 0" class="cta harvest" @click="onHarvest">
        收取 +{{ jar.pending }}
      </button>
      <button v-else class="cta idle" disabled>暂无可收 · 等{{ harvestCountdown }}</button>
    </view>

    <!-- 三键：浇水 / 充能 / 好友 -->
    <view class="actions">
      <view class="act" :class="{ disabled: !waterReady }" @click="onWater">
        <view class="act-ico sage">
          <VIcon name="water" :size="40" color="#7FA67A" />
        </view>
        <text class="act-t">浇水</text>
        <text class="act-s yx-num">{{ waterLabel }}</text>
      </view>
      <view class="act" @click="onCharge">
        <view class="act-ico amber">
          <VIcon name="coin" :size="40" color="#E5A23E" />
        </view>
        <text class="act-t">充能</text>
        <text class="act-s">+28 立即</text>
      </view>
      <view class="act" @click="openLink('friends')">
        <view class="act-ico lavender">
          <VIcon name="invite" :size="40" color="#9B8FBF" />
        </view>
        <text class="act-t">好友圈</text>
        <text class="act-s yx-num">剩 {{ jar.stealsLeft }} 次偷</text>
      </view>
    </view>

    <!-- 好友行：可偷=偷，已空=助力 -->
    <view class="friends">
      <view class="friends-head">
        <text class="friends-label">好友能量</text>
        <text class="friends-sub">偷一半 · 助力 +20</text>
      </view>
      <view class="friends-row">
        <view v-for="f in friends" :key="f.id" class="friend" @click="onFriend(f)">
          <view class="fav" :class="favClass(f)">
            <text class="fav-mark">{{ f.name.charAt(0) }}</text>
            <view v-if="f.status === 'stealable'" class="fav-dot" />
          </view>
          <text class="fav-name">{{ f.name }}</text>
          <text v-if="f.status === 'stealable'" class="fav-tag">偷 +{{ stealGain(f) }}</text>
          <text v-else-if="helped(f.id)" class="fav-tag done">已助力</text>
          <text v-else class="fav-tag help">去助力</text>
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
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { session, chargeEnergy } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { openLink } from '../../utils/navigate.js'
import {
  jar,
  harvest,
  water,
  steal,
  helpFriend,
  clearEvent,
  redeemStage,
  formatCountdown,
  isFull,
  STAGE_CURVE,
  getRules,
  tickProduce,
  tickEventPenalty,
  simulateIncomingSocial,
  markFeedRead,
  dismissFeedItem,
  eventCriticalSoon,
  applyRemoteJarState,
  applyRemoteFeed,
} from '../../store/jar.js'
import {
  requestJarSubscribe,
  hasAnySubscribe,
  subscribeState,
} from '../../utils/subscribe.js'
import { fetchJarState, fetchJarFeed, apiHarvest, apiWater, apiClearEvent, apiRedeem } from '../../api/jarApi.js'
import { getToken, USE_REMOTE } from '../../api/request.js'
import VIcon from '../VIcon.vue'

const props = defineProps({ mod: Object })
const p = computed(() => props.mod.payload || {})
const goalPrefix = computed(() => p.value.goalPrefix || '目标 · ')
const giftCta = computed(() => p.value.giftCta || '去兑礼')
const giftLink = computed(() => p.value.giftLinkKey || 'gift')

const now = ref(Date.now())
let timer = null
let socialSeeded = false
async function pullRemoteJar() {
  if (!USE_REMOTE || !getToken()) return
  try {
    const [st, feed] = await Promise.all([fetchJarState(), fetchJarFeed()])
    if (st) applyRemoteJarState(st)
    if (feed) applyRemoteFeed(feed)
  } catch (e) {
    console.warn('[jar] remote pull failed', e)
  }
}

onMounted(async () => {
  await pullRemoteJar()
  tickProduce()
  const pen = tickEventPenalty()
  if (pen.ok) uni.showToast({ title: pen.msg, icon: 'none' })
  if (!socialSeeded && !(jar.feed && jar.feed.length)) {
    socialSeeded = true
    simulateIncomingSocial()
  }
  timer = setInterval(() => {
    now.value = Date.now()
    tickProduce()
    const p2 = tickEventPenalty()
    if (p2.ok) uni.showToast({ title: p2.msg, icon: 'none' })
  }, 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const stageName = computed(() => {
  const c = STAGE_CURVE.find((x) => x.stage >= jar.stage)
  const label = (c && c.name) || '能量罐'
  return `${jar.stage} 罐 · ${label}`
})

const harvestReady = computed(() => jar.pending > 0)
const harvestCountdown = computed(() => {
  if (jar.pending > 0) return '待收已就绪'
  return formatCountdown(jar.nextHarvestAt - now.value)
})
const bubbleText = computed(() => {
  if (jar.pending > 0) return `+${jar.pending} 待收`
  const left = jar.nextHarvestAt - now.value
  if (left <= 0) return `+${getRules().harvestAmount} 可收`
  return formatCountdown(left) + ' 产出'
})

const waterReady = computed(() => now.value >= jar.waterReadyAt)
const waterLabel = computed(() => {
  if (waterReady.value) return `+${getRules().waterEnergy} · 可浇`
  return formatCountdown(jar.waterReadyAt - now.value)
})

const friends = computed(() => (session.friends || []).slice(0, 4))
const feedItems = computed(() => (jar.feed || []).slice(0, 3))
const showSubscribeBar = computed(() => {
  const enabled = !(appConfig.game && appConfig.game.subscribe && appConfig.game.subscribe.enabled === false)
  return enabled && !hasAnySubscribe()
})

function stealGain(f) {
  return f.energy >= 10 ? Math.ceil(f.energy / 2) : f.energy
}
function helped(id) {
  return jar.helpedIds.includes(id)
}
function favClass(f) {
  if (f.status === 'stealable') return 'stealable'
  if (helped(f.id)) return 'helped'
  return 'empty'
}

async function askSubscribe(kinds) {
  const r = await requestJarSubscribe(kinds)
  if (r.ok) {
    uni.showToast({
      title: r.mock ? '已开启本地提醒（开发态）' : '提醒已开启',
      icon: 'none',
    })
  }
}

async function onEnableSubscribe() {
  await askSubscribe(['harvestReady', 'eventCritical'])
}

async function onHarvest() {
  if (USE_REMOTE && getToken()) {
    try {
      const r = await apiHarvest()
      if (r.state) applyRemoteJarState(r.state)
      uni.showToast({ title: r.msg || '收取成功', icon: 'none' })
      const kinds = ['harvestReady']
      if (r.detail && r.detail.eventSpawned) kinds.push('eventCritical')
      await askSubscribe(kinds)
      return
    } catch (e) {
      console.warn('[jar] harvest remote fail, local', e)
    }
  }
  const r = harvest()
  uni.showToast({ title: r.msg, icon: 'none' })
  if (r.ok) {
    const kinds = ['harvestReady']
    if (r.detail && r.detail.eventSpawned) kinds.push('eventCritical')
    await askSubscribe(kinds)
  }
}
async function onWater() {
  if (USE_REMOTE && getToken()) {
    try {
      const r = await apiWater()
      if (r.state) applyRemoteJarState(r.state)
      uni.showToast({ title: r.msg || '浇水成功', icon: 'none' })
      if (!subscribeState.harvestReady) await askSubscribe(['harvestReady'])
      return
    } catch (e) {
      console.warn('[jar] water remote fail, local', e)
    }
  }
  const r = water()
  uni.showToast({ title: r.msg, icon: 'none' })
  if (r.ok && !subscribeState.harvestReady) await askSubscribe(['harvestReady'])
}
function onCharge() {
  chargeEnergy()
}
async function onRedeem() {
  if (USE_REMOTE && getToken()) {
    try {
      const r = await apiRedeem()
      if (r.state) applyRemoteJarState(r.state)
      uni.showToast({ title: r.msg || '兑礼成功', icon: 'none' })
      return
    } catch (e) {
      console.warn('[jar] redeem remote fail, local', e)
    }
  }
  const r = redeemStage()
  if (!r.ok) uni.showToast({ title: r.msg, icon: 'none' })
}
async function onClearEvent() {
  if (USE_REMOTE && getToken()) {
    try {
      const r = await apiClearEvent()
      if (r.state) applyRemoteJarState(r.state)
      uni.showToast({ title: r.msg || '已处理', icon: 'none' })
      await askSubscribe(['eventCritical'])
      return
    } catch (e) {
      console.warn('[jar] clear-event remote fail, local', e)
    }
  }
  const r = clearEvent()
  uni.showToast({ title: r.msg, icon: 'none' })
  if (eventCriticalSoon() || !subscribeState.eventCritical) {
    await askSubscribe(['eventCritical'])
  }
}
function onFriend(f) {
  if (f.status === 'stealable') {
    const r = steal(f.id)
    uni.showToast({ title: r.msg, icon: 'none' })
  } else {
    const r = helpFriend(f.id)
    uni.showToast({ title: r.msg, icon: 'none' })
  }
}
function onMarkFeedRead() {
  markFeedRead()
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

/* 舞台 */
.stage {
  position: relative;
  height: 620rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 8rpx 0 12rpx;
}
.ground {
  position: absolute;
  left: 18%;
  right: 18%;
  bottom: 96rpx;
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
  height: 380rpx;
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
  transition: height 0.6s var(--ease-out);
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

/* 待收徽标 */
.pending-badge {
  position: absolute;
  right: -24rpx;
  top: 32rpx;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 4rpx;
  background: var(--paper-2);
  border: 2rpx solid var(--accent);
  border-radius: var(--radius-pill);
  padding: 8rpx 16rpx 8rpx 8rpx;
  box-shadow: var(--shadow-soft);
}
.pending-n {
  font-size: 24rpx;
  font-weight: 800;
  color: var(--accent-deep);
  font-variant-numeric: tabular-nums;
}

/* 事件 */
.event {
  position: absolute;
  left: -28rpx;
  top: 96rpx;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
  background: var(--paper-2);
  border: 2rpx solid var(--warn);
  border-radius: var(--radius-card);
  padding: 12rpx 16rpx;
  box-shadow: var(--shadow-soft);
}
.event:active {
  transform: scale(0.94);
}
.event-ico {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: #f6d9d5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.event-t {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--warn-text);
}
.event-s {
  font-size: 16rpx;
  color: var(--ink-3);
}

/* 倒计时气泡 */
.bubble {
  position: absolute;
  top: 16rpx;
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 8rpx;
  background: var(--paper-2);
  border: 1rpx solid var(--line-soft);
  border-radius: var(--radius-pill);
  padding: 10rpx 24rpx;
  box-shadow: var(--shadow-soft);
}
.bubble.ready {
  border-color: var(--sage);
  animation: bubble-pulse 1.6s var(--ease-out) infinite;
}
@keyframes bubble-pulse {
  0%, 100% { transform: translateX(-50%) scale(1); }
  50% { transform: translateX(-50%) scale(1.06); }
}
.bubble-t {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}
.bubble.ready .bubble-t {
  color: var(--sage-deep);
}

/* 飘字 */
.fx {
  position: absolute;
  z-index: 10;
  animation: fx-float 1.2s var(--ease-out) forwards;
  pointer-events: none;
}
@keyframes fx-float {
  0% { transform: translateY(0) scale(0.8); opacity: 0; }
  20% { opacity: 1; transform: translateY(-10rpx) scale(1.1); }
  100% { transform: translateY(-90rpx) scale(1); opacity: 0; }
}
.fx-t {
  font-size: 40rpx;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 2rpx 8rpx rgba(251, 248, 244, 0.9);
}
.fx.tone-sage .fx-t { color: var(--sage-deep); }
.fx.tone-amber .fx-t { color: var(--accent-deep); }

.float {
  position: absolute;
  z-index: 3;
}
.f1 { left: 8%; top: 22%; }
.f2 { right: 6%; top: 12%; }

/* 主操作 */
.primary-row {
  margin: 8rpx 0 24rpx;
}
.cta {
  width: 560rpx;
  height: 92rpx;
  margin: 0 auto;
  border: none;
  border-radius: var(--radius-pill);
  font-size: 32rpx;
  font-weight: 700;
  line-height: 92rpx;
  letter-spacing: 0.5rpx;
}
.cta::after { border: none; }
.cta.harvest {
  background: var(--sage);
  color: var(--ink-on-accent);
  box-shadow: var(--shadow);
  animation: bubble-glow 2s var(--ease-out) infinite;
}
@keyframes bubble-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(127, 166, 122, 0.5); }
  50% { box-shadow: 0 0 0 14rpx rgba(127, 166, 122, 0); }
}
.cta.harvest:active {
  background: var(--sage-deep);
  transform: scale(0.98);
}
.cta.redeem {
  background: var(--accent);
  color: var(--ink-on-accent);
  box-shadow: var(--shadow);
  animation: bubble-glow 2s var(--ease-out) infinite;
}
.cta.redeem:active {
  background: var(--accent-deep);
  transform: scale(0.98);
}
.cta.idle {
  background: var(--paper-3);
  color: var(--ink-3);
  border: 1rpx solid var(--line);
}

/* 三键 */
.actions {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  margin: 0 0 28rpx;
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
.act.disabled {
  opacity: 0.65;
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
.act-ico.amber { background: var(--accent-soft); }
.act-ico.lavender { background: var(--lavender-soft); }
.act-t {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--ink);
}
.act-s {
  font-size: 20rpx;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}

/* 好友 */
.friends {
  background: var(--paper-2);
  border-radius: var(--radius-card);
  padding: 28rpx 32rpx;
  border: 1rpx solid var(--line-soft);
  box-shadow: var(--shadow-soft);
  text-align: left;
}
.friends-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 20rpx;
}
.friends-label {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--ink-2);
}
.friends-sub {
  font-size: 20rpx;
  color: var(--ink-3);
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
  position: relative;
}
.friend:active {
  transform: scale(0.96);
}
.fav {
  position: relative;
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
.fav.helped {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.fav-dot {
  position: absolute;
  top: -4rpx;
  right: -4rpx;
  width: 20rpx;
  height: 20rpx;
  border-radius: 50%;
  background: var(--sage);
  border: 2rpx solid var(--paper-2);
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
.fav-tag.help {
  color: var(--accent-text);
}
.fav-tag.done {
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

/* 订阅条 */
.sub-bar {
  margin: 8rpx 0 20rpx;
  padding: 20rpx 28rpx;
  border-radius: var(--radius-card);
  background: var(--accent-soft);
  border: 1rpx solid rgba(229, 162, 62, 0.35);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.sub-bar.on {
  background: var(--sage-soft);
  border-color: rgba(127, 166, 122, 0.35);
  justify-content: flex-start;
}
.sub-bar:active {
  transform: scale(0.98);
}
.sub-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-width: 0;
}
.sub-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sub-t {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--ink);
}
.sub-t.on {
  font-size: 24rpx;
  color: var(--sage-deep);
}
.sub-s {
  margin-top: 4rpx;
  font-size: 20rpx;
  color: var(--ink-3);
}
.sub-cta {
  flex-shrink: 0;
  font-size: 24rpx;
  font-weight: 700;
  color: var(--ink-on-accent);
  background: var(--accent);
  padding: 12rpx 28rpx;
  border-radius: var(--radius-pill);
}

/* 动态气泡 */
.feed {
  margin: 0 0 20rpx;
  text-align: left;
}
.feed-head {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  margin-bottom: 12rpx;
}
.feed-label {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--ink-2);
}
.feed-unread {
  font-size: 20rpx;
  color: var(--accent-deep);
  font-weight: 600;
}
.feed-clear {
  margin-left: auto;
  font-size: 20rpx;
  color: var(--ink-3);
}
.feed-bubble {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx 22rpx;
  margin-bottom: 12rpx;
  border-radius: var(--radius-card);
  background: var(--paper-2);
  border: 1rpx solid var(--line-soft);
  box-shadow: var(--shadow-soft);
}
.feed-bubble.stolen {
  border-color: rgba(194, 58, 42, 0.25);
  background: #fbf3f1;
}
.feed-bubble.helped {
  border-color: rgba(127, 166, 122, 0.35);
  background: var(--sage-soft);
}
.feed-bubble:active {
  transform: scale(0.98);
}
.feed-av {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: var(--paper-3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  font-weight: 700;
  color: var(--ink-2);
  flex-shrink: 0;
}
.feed-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.feed-line {
  font-size: 24rpx;
  color: var(--ink-2);
  line-height: 1.35;
}
.feed-name {
  font-weight: 700;
  color: var(--ink);
}
.feed-amt {
  font-weight: 700;
  color: var(--accent-deep);
}
.feed-time {
  margin-top: 4rpx;
  font-size: 18rpx;
  color: var(--ink-3);
}
.feed-x {
  font-size: 28rpx;
  color: var(--ink-3);
  padding: 0 8rpx;
}
</style>

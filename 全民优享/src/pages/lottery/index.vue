<template>
  <view class="yx-page lottery yx-safe-bottom">
    <view class="hero">
      <text class="title">幸运抽奖</text>
      <text class="sub">真实奖池 · 概率公示 · 中奖可兑实物</text>
      <view class="chance">
        能量值 <text class="n">{{ energyBal }}</text>
        <text class="mute"> · 单次 {{ lotteryEnergyCost }}</text>
      </view>
    </view>

    <view class="wheel-wrap">
      <view class="ring-lights" aria-hidden="true">
        <view v-for="i in 24" :key="'lt-' + i" class="light" :class="{ dim: i % 2 === 0 }" :style="lightStyle(i)" />
      </view>

      <view
        class="wheel"
        :style="{
          transform: `rotate(${rotate}deg)`,
          transition: spinning ? `transform ${spinMs}ms cubic-bezier(0.12, 0.75, 0.18, 1)` : 'none',
          background: discGradient,
        }"
      >
        <view v-for="(p, i) in pool" :key="p.id" class="prize" :style="prizeStyle(i)">
          <CmsImage
            class="prize-ico"
            :src="p.imageUrl || ''"
            mode="aspectFill"
            placeholder="/static/ui/ico-gift.png"
            :show-placeholder="true"
          />
          <text class="prize-lab">{{ shortName(p.name) }}</text>
        </view>
      </view>

      <view class="hub">
        <view class="pointer" />
        <button class="spin-btn" :disabled="spinning" @click="onSpin">
          <text class="spin-t">{{ spinning ? '开奖中' : '开始抽奖' }}</text>
        </button>
      </view>
    </view>

    <view class="card">
      <text class="block-title">规则说明</text>
      <view v-for="(line, idx) in ruleLines" :key="'r-' + idx" class="rule-line">
        <text class="bullet">·</text>
        <text class="rule-t">{{ line }}</text>
      </view>
    </view>

    <view class="card">
      <text class="block-title">奖项说明</text>
      <view
        v-for="g in gradeList"
        :key="g.id"
        class="grade-row"
        @click="onPrizeTap(g)"
      >
        <text class="grade-tag" :class="'r-' + (g.rarity || 'N')">{{ g.gradeLabel }}</text>
        <CmsImage
          class="grade-img"
          :src="g.imageUrl || ''"
          mode="aspectFill"
          placeholder="/static/ui/ico-gift.png"
          :show-placeholder="true"
        />
        <view class="grade-body">
          <text class="grade-name">{{ g.name }}</text>
          <text class="grade-meta">{{ g.weightHint }}</text>
        </view>
        <text v-if="g.productId" class="grade-go">详情 ›</text>
      </view>
      <view v-if="!gradeList.length" class="empty">暂无启用奖项</view>
    </view>

    <view class="card">
      <text class="block-title">我的中奖记录</text>
      <view v-for="h in history" :key="h.id" class="hist-row">
        <view class="hist-l">
          <text class="hist-name">{{ h.name }}</text>
          <text class="mute">{{ h.time }}</text>
        </view>
        <button v-if="h.claimToken && h.productId" class="claim-btn" @click="goClaim(h)">去兑换</button>
        <text v-else class="mute">{{ typeLabel(h.prizeType) }}</text>
      </view>
      <view v-if="!history.length" class="empty">暂无记录 · 登录后可同步</view>
    </view>

    <LotteryWinModal
      :show="winShow"
      :name="winPrize.name"
      :image-url="winPrize.imageUrl"
      :can-redeem="!!(winPrize.claimToken && winPrize.productId)"
      @close="winShow = false"
      @redeem="onWinRedeem"
    />
    <GameFeedbackModal
      v-model:show="loseShow"
      title="未中奖"
      message="很遗憾，大奖与您擦肩而过"
      sub-message="请再接再厉！"
      primary-text="再抽一次"
      variant="lose"
      @primary="onSpin"
    />
  </view>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { lotteryPool as mockPool } from '../../mock/data.js'
import { session, spinLottery } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { request, USE_REMOTE, actionId, getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import CmsImage from '../../components/CmsImage.vue'
import LotteryWinModal from '../../components/LotteryWinModal.vue'
import GameFeedbackModal from '../../components/GameFeedbackModal.vue'

const SLICE_A = '#ffffff'
const SLICE_B = '#ffe566'
const RARITY_GRADE = {
  SSR: '一等奖',
  SR: '二等奖',
  R: '三等奖',
  N: '参与奖',
}
const RARITY_RANK = { SSR: 4, SR: 3, R: 2, N: 1 }

const pool = computed(() => {
  const remote =
    (appConfig.catalog && appConfig.catalog.lottery) ||
    (appConfig.game && appConfig.game.lottery) ||
    []
  const list = remote.length
    ? remote
        .filter((p) => p.status !== 'off')
        .map((p) => {
          const product = p.product || null
          const name = (product && product.name) || p.name
          return {
            id: p.id,
            name,
            imageUrl: (product && product.imageUrl) || p.imageUrl || p.image_url || '',
            productId: p.productId || p.product_id || (product && product.productId) || '',
            weightHint:
              p.probability != null
                ? `概率 ${(Number(p.probability) * 100).toFixed(1)}%`
                : `权重 ${p.weight}`,
            weight: Number(p.weight) || 0,
            probability: Number(p.probability) || 0,
            claimFree: !!p.claimFree || p.prizeType === 'physical' || p.prize_type === 'physical',
            prizeType: p.prizeType || p.prize_type,
            rarity: String(p.rarity || 'N').toUpperCase(),
          }
        })
    : mockPool.map((p) => ({
        ...p,
        imageUrl: p.imageUrl || '',
        claimFree: p.prizeType === 'physical',
        rarity: String(p.rarity || 'N').toUpperCase(),
      }))
  return list
})

const gradeList = computed(() =>
  [...pool.value].sort((a, b) => {
    const ra = RARITY_RANK[a.rarity] || 0
    const rb = RARITY_RANK[b.rarity] || 0
    if (rb !== ra) return rb - ra
    return (b.weight || 0) - (a.weight || 0)
  }).map((p) => ({
    ...p,
    gradeLabel: RARITY_GRADE[p.rarity] || '参与奖',
  }))
)

const rotate = ref(0)
const spinning = ref(false)
const spinMs = ref(3200)
const history = ref([])
const winShow = ref(false)
const loseShow = ref(false)
const winPrize = ref({ name: '', imageUrl: '', productId: '', claimToken: '', prizeType: '' })
const ruleLines = ref([])
let pendingResult = null

const energyBal = computed(
  () => Number(session.user.energy != null ? session.user.energy : session.user.points) || 0
)

const lotteryEnergyCost = computed(() => {
  const eco = (appConfig.game && appConfig.game.economy) || appConfig.economy || {}
  return Number(eco.lotteryEnergyCost) > 0 ? Number(eco.lotteryEnergyCost) : 50
})

const discGradient = computed(() => {
  const n = Math.max(1, pool.value.length)
  const parts = []
  for (let i = 0; i < n; i++) {
    const c = i % 2 === 0 ? SLICE_A : SLICE_B
    const a0 = (i / n) * 360
    const a1 = ((i + 1) / n) * 360
    parts.push(`${c} ${a0}deg ${a1}deg`)
  }
  return `conic-gradient(from -90deg, ${parts.join(',')})`
})

function shortName(name) {
  const s = String(name || '').trim()
  if (!s) return '奖'
  return s.slice(0, 2)
}

function typeLabel(t) {
  if (t === 'physical') return '已兑/待兑'
  if (t === 'empty') return '未中奖'
  if (t === 'seed') return '种子'
  if (t === 'energy' || t === 'points' || t === 'coin') return '能量到账'
  return '已记录'
}

function lightStyle(i) {
  const deg = ((i - 1) / 24) * 360
  return { transform: `rotate(${deg}deg) translateY(-292rpx)` }
}

function prizeStyle(i) {
  const n = pool.value.length || 1
  const mid = -90 + (i + 0.5) * (360 / n)
  const radius = n <= 6 ? 168 : n <= 10 ? 178 : 186
  return {
    transform: `rotate(${mid}deg) translateY(-${radius}rpx) rotate(${-mid}deg)`,
  }
}

function defaultRules() {
  const daily =
    (appConfig.risk && appConfig.risk.perUserDailyLotteryLimit) ||
    (appConfig.lotteryRules && appConfig.lotteryRules.dailyLimit) ||
    15
  return [
    `每次抽奖消耗 ${lotteryEnergyCost.value} 能量值`,
    `每人每日最多抽奖 ${daily} 次`,
    '完成签到、日常任务可获得能量值，用于继续抽奖',
    '抽奖结果可在本页「我的中奖记录」或「我的 → 我的中奖记录」查看',
    '实物中奖后请尽快填写收货地址兑奖',
  ]
}

async function loadRules() {
  const fromBoot = appConfig.lotteryRules || (appConfig.config && appConfig.config.lotteryRules)
  if (fromBoot && Array.isArray(fromBoot.lines) && fromBoot.lines.length) {
    ruleLines.value = fromBoot.lines
    return
  }
  if (USE_REMOTE) {
    try {
      const data = await request('/api/traffic/v1/lottery/rules')
      if (data && Array.isArray(data.lines) && data.lines.length) {
        ruleLines.value = data.lines
        appConfig.lotteryRules = data
        return
      }
    } catch (_) {}
  }
  ruleLines.value = defaultRules()
}

async function loadHistory() {
  if (!(USE_REMOTE && getToken())) {
    history.value = (session.lotteryHistory || []).slice()
    return
  }
  try {
    const data = await request('/api/traffic/v1/lottery/history')
    history.value = (data.items || []).map((h) => ({
      id: h.id,
      name: h.name,
      time: h.time,
      prizeType: h.prizeType,
      claimToken: h.claimToken,
      productId: h.productId,
    }))
  } catch (e) {
    history.value = (session.lotteryHistory || []).slice()
  }
}

onMounted(() => {
  loadRules()
  loadHistory()
})
onShow(loadHistory)

function ensureLogin() {
  if (USE_REMOTE && !(getToken() && isLoggedIn())) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => uni.navigateTo({ url: '/pages/login/index' }), 400)
    return false
  }
  return true
}

function indexForPrize(prize) {
  if (!prize) return 0
  const list = pool.value
  let idx = list.findIndex((p) => String(p.id) === String(prize.id))
  if (idx >= 0) return idx
  idx = list.findIndex((p) => p.prizeType === 'empty' || /谢谢|未中|参与/.test(p.name || ''))
  if (idx >= 0 && (prize.prizeType === 'empty' || !prize.prizeType)) return idx
  idx = list.findIndex((p) => p.name === prize.name)
  return idx >= 0 ? idx : 0
}

function targetRotate(index) {
  const n = pool.value.length || 1
  const per = 360 / n
  const mid = -90 + (index + 0.5) * per
  const base = ((rotate.value % 360) + 360) % 360
  const need = (((-mid - base) % 360) + 360) % 360
  const loops = 5 + Math.floor(Math.random() * 2)
  return rotate.value + loops * 360 + need
}

function resolvePrizeImage(prize) {
  if (prize && prize.imageUrl) return prize.imageUrl
  const hit = pool.value.find((p) => String(p.id) === String(prize && prize.id))
  return (hit && hit.imageUrl) || ''
}

function isWin(prize) {
  if (!prize) return false
  return prize.prizeType && prize.prizeType !== 'empty'
}

function onPrizeTap(g) {
  if (!g.productId) {
    uni.showToast({ title: g.name || '虚拟奖项', icon: 'none' })
    return
  }
  uni.navigateTo({
    url: `/pages/gift/detail?id=${encodeURIComponent(g.productId)}`,
  })
}

function goClaim(h) {
  if (!ensureLogin()) return
  const token = encodeURIComponent(h.claimToken || '')
  const pid = encodeURIComponent(h.productId || '')
  uni.navigateTo({
    url: `/pages/order/confirm?type=lottery&productId=${pid}&claimToken=${token}`,
  })
}

function onWinRedeem() {
  winShow.value = false
  const p = winPrize.value
  if (p.claimToken && p.productId) {
    goClaim(p)
    return
  }
  if (p.productId) {
    uni.navigateTo({
      url: `/pages/gift/detail?id=${encodeURIComponent(p.productId)}`,
    })
  }
}

function showResult(r) {
  const prize = (r && r.prize) || {}
  if (isWin(prize)) {
    winPrize.value = {
      name: prize.name || '奖品',
      imageUrl: resolvePrizeImage(prize),
      productId: prize.productId || '',
      claimToken: r.claimToken || '',
      prizeType: prize.prizeType || '',
    }
    winShow.value = true
    return
  }
  loseShow.value = true
}

async function onSpin() {
  if (spinning.value) return
  if (!ensureLogin()) return
  if (energyBal.value < lotteryEnergyCost.value) {
    uni.showToast({ title: `能量值不足（需 ${lotteryEnergyCost.value}）`, icon: 'none' })
    return
  }

  spinning.value = true
  loseShow.value = false
  winShow.value = false
  pendingResult = null

  let r
  if (USE_REMOTE) {
    try {
      const data = await request('/api/traffic/v1/lottery/draw', {
        method: 'POST',
        data: { actionId: actionId('lottery') },
      })
      if (data.wallet) {
        if (data.wallet.energy != null) session.user.energy = data.wallet.energy
        if (data.wallet.points != null) session.user.points = data.wallet.points
        session.user.lotteryChance = 0
        session.user.coins = 0
      } else {
        session.user.energy = Math.max(0, energyBal.value - lotteryEnergyCost.value)
        session.user.points = session.user.energy
      }
      const prize = data.prize || {}
      session.lotteryHistory.unshift({
        id: data.drawId || `r_${Date.now()}`,
        name: prize.name || '奖品',
        time: new Date().toLocaleString(),
        prizeType: prize.prizeType,
        claimToken: data.claimToken || '',
        productId: prize.productId || '',
      })
      r = { ok: true, prize, claimToken: data.claimToken || '' }
      loadHistory()
    } catch (e) {
      spinning.value = false
      uni.showToast({ title: (e && e.message) || '抽奖失败', icon: 'none' })
      return
    }
  } else {
    r = spinLottery(lotteryEnergyCost.value)
  }

  if (!r || !r.ok) {
    spinning.value = false
    uni.showToast({ title: (r && r.msg) || '抽奖失败', icon: 'none' })
    return
  }

  pendingResult = r
  const idx = indexForPrize(r.prize)
  spinMs.value = 3200
  rotate.value = targetRotate(idx)

  setTimeout(() => {
    spinning.value = false
    showResult(pendingResult)
    pendingResult = null
  }, spinMs.value + 80)
}
</script>

<style scoped lang="scss">
.lottery {
  background: #f7f7f8;
  min-height: 100vh;
  color: #1f2937;
  padding: 24rpx 28rpx 48rpx;
}
.hero .title {
  font-size: 40rpx;
  font-weight: 800;
  color: #111827;
}
.hero .sub {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #6b7280;
}
.chance {
  margin-top: 16rpx;
  font-size: 26rpx;
  color: #374151;
}
.chance .n {
  font-weight: 800;
  color: #e11d48;
}
.mute {
  color: #9ca3af;
  font-size: 22rpx;
}
.wheel-wrap {
  position: relative;
  margin: 36rpx auto 40rpx;
  width: 600rpx;
  height: 600rpx;
}
.ring-lights {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 18rpx solid #e85a5a;
  box-shadow: 0 12rpx 28rpx rgba(225, 29, 72, 0.18), inset 0 0 0 6rpx #ff8a80;
  z-index: 1;
  pointer-events: none;
}
.light {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 14rpx;
  height: 14rpx;
  margin: -7rpx 0 0 -7rpx;
  border-radius: 50%;
  background: #fff8e7;
  box-shadow: 0 0 8rpx #ffe08a;
}
.light.dim {
  background: #ffd28a;
  opacity: 0.75;
}
.wheel {
  position: absolute;
  left: 22rpx;
  top: 22rpx;
  width: 556rpx;
  height: 556rpx;
  border-radius: 50%;
  overflow: hidden;
  z-index: 2;
  box-shadow: inset 0 0 0 2rpx rgba(232, 90, 90, 0.2);
}
.prize {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100rpx;
  margin-left: -50rpx;
  margin-top: -64rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
  z-index: 3;
}
.prize-ico {
  width: 64rpx;
  height: 64rpx;
  border-radius: 14rpx;
  background: rgba(255, 255, 255, 0.95);
  overflow: hidden;
  box-shadow: 0 4rpx 10rpx rgba(0, 0, 0, 0.1);
}
.prize-lab {
  font-size: 22rpx;
  font-weight: 800;
  color: #7c2d12;
  text-align: center;
  line-height: 1.1;
}
.hub {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 168rpx;
  height: 168rpx;
  margin: -84rpx 0 0 -84rpx;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pointer {
  position: absolute;
  top: -22rpx;
  left: 50%;
  margin-left: -18rpx;
  width: 0;
  height: 0;
  border-left: 18rpx solid transparent;
  border-right: 18rpx solid transparent;
  border-bottom: 34rpx solid #e11d48;
  filter: drop-shadow(0 4rpx 4rpx rgba(0, 0, 0, 0.15));
  z-index: 6;
}
.spin-btn {
  width: 156rpx;
  height: 156rpx;
  margin: 0;
  padding: 0;
  border-radius: 50%;
  background: linear-gradient(180deg, #ffd4a8, #ffb07a);
  border: 8rpx solid #e11d48;
  box-shadow: 0 8rpx 18rpx rgba(225, 29, 72, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
}
.spin-btn::after {
  border: none;
}
.spin-btn[disabled] {
  opacity: 0.85;
}
.spin-t {
  color: #e11d48;
  font-size: 28rpx;
  font-weight: 900;
  line-height: 1.2;
  width: 88rpx;
  text-align: center;
}
.card {
  margin-top: 20rpx;
  background: #fff;
  border-radius: 24rpx;
  padding: 28rpx 24rpx;
  box-shadow: 0 8rpx 24rpx rgba(17, 24, 39, 0.05);
}
.block-title {
  font-size: 30rpx;
  font-weight: 800;
  margin-bottom: 16rpx;
  display: block;
  color: #111827;
}
.rule-line {
  display: flex;
  gap: 10rpx;
  margin-bottom: 12rpx;
}
.bullet {
  color: #e11d48;
  font-weight: 800;
  flex-shrink: 0;
}
.rule-t {
  flex: 1;
  font-size: 24rpx;
  color: #4b5563;
  line-height: 1.5;
}
.grade-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f3f4f6;
}
.grade-tag {
  flex-shrink: 0;
  font-size: 20rpx;
  font-weight: 800;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  background: #f3f4f6;
  color: #6b7280;
}
.grade-tag.r-SSR {
  background: #fff1f2;
  color: #be123c;
}
.grade-tag.r-SR {
  background: #fff7ed;
  color: #c2410c;
}
.grade-tag.r-R {
  background: #eff6ff;
  color: #1d4ed8;
}
.grade-img {
  width: 80rpx;
  height: 80rpx;
  border-radius: 14rpx;
  background: #f3f4f6;
  overflow: hidden;
  flex-shrink: 0;
}
.grade-body {
  flex: 1;
  min-width: 0;
}
.grade-name {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.grade-meta {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #9ca3af;
}
.grade-go {
  font-size: 22rpx;
  color: #e11d48;
  font-weight: 600;
  flex-shrink: 0;
}
.hist-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f3f4f6;
}
.hist-l {
  min-width: 0;
  flex: 1;
}
.hist-name {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
}
.claim-btn {
  margin: 0;
  padding: 0 22rpx;
  height: 56rpx;
  line-height: 56rpx;
  border-radius: 999rpx;
  background: #e11d48;
  color: #fff;
  font-size: 22rpx;
  font-weight: 700;
  border: none;
  flex-shrink: 0;
}
.claim-btn::after {
  border: none;
}
.empty {
  padding: 12rpx 0 4rpx;
  font-size: 22rpx;
  color: #9ca3af;
}
</style>

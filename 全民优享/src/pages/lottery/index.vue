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
        <view v-for="i in 24" :key="i" class="light" :class="{ dim: i % 2 === 0 }" :style="lightStyle(i)" />
      </view>

      <view
        class="wheel"
        :style="{
          transform: `rotate(${rotate}deg)`,
          transition: spinning ? `transform ${spinMs}ms cubic-bezier(0.12, 0.75, 0.18, 1)` : 'none',
        }"
      >
        <view
          v-for="(p, i) in pool"
          :key="'s-' + p.id"
          class="slice"
          :style="sliceStyle(i)"
        />
        <view
          v-for="(p, i) in pool"
          :key="p.id"
          class="prize"
          :style="prizeStyle(i)"
        >
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

    <view class="pool yx-card">
      <text class="block-title">奖池公示</text>
      <text class="pool-lead">实物中奖免能量与现金 · 填地址即可领取</text>
      <view class="pool-grid">
        <view v-for="p in pool" :key="'g-' + p.id" class="pool-item">
          <CmsImage
            class="pool-img"
            :src="p.imageUrl || ''"
            mode="aspectFill"
            placeholder="/static/ui/ico-gift.png"
            :show-placeholder="true"
          />
          <view class="pool-body">
            <text class="pn">{{ p.name }}</text>
            <text class="yx-muted">{{ p.weightHint }}</text>
            <text v-if="p.claimFree" class="free-tag">中奖免兑</text>
          </view>
        </view>
      </view>
    </view>

    <view class="hist yx-card">
      <text class="block-title">我的中奖记录</text>
      <view v-for="h in history" :key="h.id" class="hist-row">
        <view class="hist-l">
          <text class="hist-name">{{ h.name }}</text>
          <text class="yx-muted">{{ h.time }}</text>
        </view>
        <button
          v-if="h.claimToken && h.productId"
          class="claim-btn"
          @click="goClaim(h)"
        >
          去兑换
        </button>
        <text v-else class="yx-muted">{{ typeLabel(h.prizeType) }}</text>
      </view>
      <view v-if="!history.length" class="yx-muted empty">暂无记录 · 登录后可同步</view>
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
const SLICE_B = '#ffe0b8'

const pool = computed(() => {
  const remote =
    (appConfig.catalog && appConfig.catalog.lottery) ||
    (appConfig.game && appConfig.game.lottery) ||
    []
  if (remote.length) {
    return remote.map((p, i) => {
      const product = p.product || null
      const name = (product && product.name) || p.name
      return {
        id: p.id,
        name,
        imageUrl: (product && product.imageUrl) || p.imageUrl || '',
        productId: p.productId || (product && product.productId) || '',
        weightHint:
          p.probability != null ? `概率 ${(p.probability * 100).toFixed(1)}%` : `权重 ${p.weight}`,
        weight: p.weight,
        claimFree: !!p.claimFree || p.prizeType === 'physical',
        prizeType: p.prizeType,
      }
    })
  }
  return mockPool.map((p) => ({
    ...p,
    imageUrl: p.imageUrl || '',
    claimFree: p.prizeType === 'physical',
  }))
})

const rotate = ref(0)
const spinning = ref(false)
const spinMs = ref(3200)
const history = ref([])
const winShow = ref(false)
const loseShow = ref(false)
const winPrize = ref({ name: '', imageUrl: '', productId: '', claimToken: '', prizeType: '' })
let pendingResult = null

const energyBal = computed(
  () => Number(session.user.energy != null ? session.user.energy : session.user.points) || 0
)

const lotteryEnergyCost = computed(() => {
  const eco = (appConfig.game && appConfig.game.economy) || appConfig.economy || {}
  return Number(eco.lotteryEnergyCost) > 0 ? Number(eco.lotteryEnergyCost) : 50
})

function sliceStyle(i) {
  const n = pool.value.length || 1
  const deg = 360 / n
  return {
    background: i % 2 === 0 ? SLICE_A : SLICE_B,
    transform: `rotate(${i * deg - 90}deg) skewY(${90 - deg}deg)`,
  }
}

function shortName(name) {
  const s = String(name || '')
  return s.length > 5 ? `${s.slice(0, 5)}…` : s
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
  return {
    transform: `rotate(${mid}deg) translateY(-178rpx) rotate(${-mid}deg)`,
  }
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

onMounted(loadHistory)
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

/** 指针在顶部：把第 index 扇区中心转到 12 点方向 */
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
    // 虚拟奖：也用中奖弹窗，无凭证时「去兑换」进礼品/仅关闭
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
  background: radial-gradient(ellipse at top, #3b1020 0%, #12080c 55%, #0a0608 100%);
  min-height: 100vh;
  color: #fff7f7;
  padding: 24rpx 32rpx 48rpx;
}
.hero .title {
  font-size: 40rpx;
  font-weight: 800;
}
.hero .sub {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: rgba(255, 247, 247, 0.62);
}
.chance {
  margin-top: 16rpx;
  font-size: 26rpx;
}
.chance .n {
  font-weight: 800;
  color: #fde68a;
}
.mute {
  color: rgba(255, 247, 247, 0.55);
}
.wheel-wrap {
  position: relative;
  margin: 48rpx auto 64rpx;
  width: 600rpx;
  height: 600rpx;
}
.ring-lights {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 18rpx solid #e85a5a;
  box-shadow: 0 16rpx 36rpx rgba(0, 0, 0, 0.35), inset 0 0 0 6rpx #ff8a80;
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
  background: #fff;
  box-shadow: inset 0 0 0 4rpx rgba(232, 90, 90, 0.35);
}
.slice {
  position: absolute;
  left: 50%;
  top: 0;
  width: 50%;
  height: 50%;
  transform-origin: 0% 100%;
}
.prize {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 120rpx;
  margin-left: -60rpx;
  margin-top: -70rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  z-index: 3;
}
.prize-ico {
  width: 72rpx;
  height: 72rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  box-shadow: 0 4rpx 10rpx rgba(0, 0, 0, 0.12);
}
.prize-lab {
  max-width: 112rpx;
  font-size: 18rpx;
  font-weight: 700;
  color: #7c2d12;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1rpx 0 rgba(255, 255, 255, 0.8);
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
  filter: drop-shadow(0 4rpx 4rpx rgba(0, 0, 0, 0.2));
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
  box-shadow: 0 8rpx 18rpx rgba(225, 29, 72, 0.28);
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
.pool,
.hist {
  margin-top: 28rpx;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 24rpx;
  padding: 24rpx;
}
.block-title {
  font-size: 28rpx;
  font-weight: 700;
  margin-bottom: 8rpx;
  display: block;
}
.pool-lead {
  display: block;
  margin-bottom: 16rpx;
  font-size: 22rpx;
  color: #fde68a;
  font-weight: 600;
}
.pool-grid {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}
.pool-item {
  display: flex;
  gap: 16rpx;
  align-items: center;
}
.pool-img {
  width: 72rpx;
  height: 72rpx;
  border-radius: 14rpx;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.pool-body {
  flex: 1;
  min-width: 0;
}
.pn {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
}
.free-tag {
  display: inline-block;
  margin-top: 6rpx;
  font-size: 18rpx;
  font-weight: 700;
  color: #7c2d12;
  background: #fde68a;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
}
.yx-muted {
  font-size: 22rpx;
  color: rgba(255, 247, 247, 0.5);
}
.hist-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid rgba(255, 255, 255, 0.06);
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
  padding: 20rpx 0;
}
</style>

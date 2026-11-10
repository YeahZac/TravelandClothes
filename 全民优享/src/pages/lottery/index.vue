<template>
  <view class="yx-page lottery yx-safe-bottom">
    <view class="hero">
      <text class="title">幸运抽奖</text>
      <text class="sub">每次消耗能量值 · 奖池公开 · 保底与库存风控</text>
      <view class="chance">
        能量值 <text class="n">{{ session.user.energy || session.user.points || 0 }}</text>
        <text class="mute"> · 单次 {{ lotteryEnergyCost }}</text>
      </view>
    </view>

    <view class="wheel-wrap">
      <view class="wheel" :style="{ transform: `rotate(${rotate}deg)` }">
        <view
          v-for="(p, i) in pool"
          :key="p.id"
          class="slice"
          :style="sliceStyle(i, p.color)"
        >
          <text class="slice-name">{{ p.name }}</text>
        </view>
        <view class="hub" />
      </view>
      <view class="pointer" />
      <button
        class="spin-btn"
        :disabled="spinning"
        @click="onSpin"
      >
        {{ spinning ? '开奖中' : '抽一次' }}
      </button>
    </view>

    <view class="pool yx-card">
      <text class="block-title">奖池公示</text>
      <text class="pool-lead">实物中奖免能量与现金 · 直接填地址包邮领取</text>
      <view class="pool-grid">
        <view v-for="p in pool" :key="p.id" class="pool-item">
          <view class="dot" :style="{ background: p.color }" />
          <view class="pool-body">
            <text class="pn">{{ p.name }}</text>
            <text class="value" v-if="p.payHint">{{ p.payHint }}</text>
            <text class="yx-muted">{{ p.weightHint }}</text>
            <text v-if="p.claimFree" class="free-tag">中奖免兑</text>
          </view>
        </view>
      </view>
    </view>

    <view class="hist yx-card">
      <text class="block-title">我的记录</text>
      <view v-for="h in history" :key="h.id" class="hist-row">
        <text>{{ h.name }}</text>
        <text class="yx-muted">{{ h.time }}</text>
      </view>
      <view v-if="!history.length" class="yx-muted">暂无记录</view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { lotteryPool as mockPool } from '../../mock/data.js'
import { session, spinLottery } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { request, USE_REMOTE, actionId, getToken } from '../../api/request.js'
import { openPage } from '../../utils/navigate.js'

const COLORS = ['#7FA67A', '#C9A36B', '#9B8FBF', '#6E6258', '#D83068', '#5A8055', '#B8873A']

const pool = computed(() => {
  const remote = (appConfig.catalog && appConfig.catalog.lottery) || (appConfig.game && appConfig.game.lottery) || []
  if (remote.length) {
    return remote.map((p, i) => ({
      id: p.id,
      name: p.name,
      color: COLORS[i % COLORS.length],
      weightHint: p.probability != null ? `概率 ${(p.probability * 100).toFixed(1)}%` : `权重 ${p.weight}`,
      weight: p.weight,
      payHint: p.payHint || p.payLabel || '',
      claimFree: !!p.claimFree || p.prizeType === 'physical',
      prizeType: p.prizeType,
    }))
  }
  return mockPool.map((p, i) => ({
    ...p,
    color: p.color || COLORS[i % COLORS.length],
    payHint: p.payHint || '',
    claimFree: p.prizeType === 'physical',
  }))
})

const rotate = ref(0)
const spinning = ref(false)
const history = ref([])

const lotteryEnergyCost = computed(() => {
  const eco =
    (appConfig.game && appConfig.game.economy) ||
    appConfig.economy ||
    {}
  return Number(eco.lotteryEnergyCost) > 0 ? Number(eco.lotteryEnergyCost) : 50
})

function sliceStyle(i, color) {
  const n = pool.value.length || 1
  const deg = 360 / n
  return {
    background: color,
    transform: `rotate(${i * deg}deg) skewY(${90 - deg}deg)`,
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

async function onSpin() {
  if (spinning.value) return
  const bal = Number(session.user.energy != null ? session.user.energy : session.user.points) || 0
  if (bal < lotteryEnergyCost.value) {
    uni.showToast({ title: `能量值不足（需 ${lotteryEnergyCost.value}）`, icon: 'none' })
    return
  }
  spinning.value = true
  const extra = 1800 + Math.floor(Math.random() * 720)
  rotate.value += extra
  setTimeout(async () => {
    let r
    let claimToken = ''
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
          session.user.energy = Math.max(0, bal - lotteryEnergyCost.value)
          session.user.points = session.user.energy
        }
        const prize = data.prize || {}
        claimToken = data.claimToken || ''
        session.lotteryHistory.unshift({
          id: data.drawId || `r_${Date.now()}`,
          name: prize.name || '奖品',
          time: new Date().toLocaleString(),
        })
        r = {
          ok: true,
          msg: prize.name || '开奖成功',
          detail: prize.prizeType || '',
          prize,
          claimToken,
        }
        loadHistory()
      } catch (e) {
        r = { ok: false, msg: (e && e.message) || '抽奖失败，请稍后重试' }
      }
    } else {
      r = spinLottery()
    }
    spinning.value = false
    if (r.ok && r.prize && r.prize.prizeType === 'physical') {
      uni.showModal({
        title: '中了实物！',
        content: `${r.msg}，请填写收货地址完成兑奖`,
        confirmText: '去填地址',
        success(res) {
          if (res.confirm) {
            const token = encodeURIComponent(r.claimToken || claimToken || '')
            const pid = encodeURIComponent(r.prize.productId || r.prize.giftId || '')
            uni.navigateTo({
              url: `/pages/order/confirm?type=lottery&productId=${pid}&claimToken=${token}`,
            })
          }
        },
      })
      return
    }
    if (r.ok && r.prize && r.prize.prizeType === 'seed') {
      uni.showModal({
        title: '种子入背包！',
        content: `${r.msg}，去能量罐种植？`,
        confirmText: '去种植',
        success(res) {
          if (res.confirm) openPage('/pages/energy/index')
        },
      })
      return
    }
    uni.showModal({
      title: r.ok ? r.msg : '提示',
      content: r.ok ? r.detail || '已记入账户' : r.msg,
      showCancel: false,
    })
  }, 2200)
}
</script>

<style scoped lang="scss">
.lottery {
  background: #1a1a1f;
  min-height: 100vh;
  color: #f5f1ea;
  padding: 24rpx 32rpx;
}
.hero .title {
  font-size: 40rpx;
  font-weight: 800;
}
.hero .sub {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: rgba(245, 241, 234, 0.55);
}
.chance {
  margin-top: 16rpx;
  font-size: 26rpx;
}
.chance .n {
  font-weight: 800;
  color: #c9a36b;
}
.wheel-wrap {
  position: relative;
  margin: 40rpx auto;
  width: 560rpx;
  height: 560rpx;
}
.wheel {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  transition: transform 2.2s cubic-bezier(0.15, 0.85, 0.25, 1);
  border: 8rpx solid #c9a36b;
}
.slice {
  position: absolute;
  left: 50%;
  top: 0;
  width: 50%;
  height: 50%;
  transform-origin: 0% 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 24rpx;
}
.slice-name {
  font-size: 18rpx;
  transform: skewY(20deg);
  color: #fff;
}
.hub {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 80rpx;
  height: 80rpx;
  margin: -40rpx 0 0 -40rpx;
  border-radius: 50%;
  background: #2b2520;
  border: 4rpx solid #c9a36b;
  z-index: 2;
}
.pointer {
  position: absolute;
  left: 50%;
  top: -8rpx;
  width: 0;
  height: 0;
  margin-left: -16rpx;
  border-left: 16rpx solid transparent;
  border-right: 16rpx solid transparent;
  border-top: 32rpx solid #c9a36b;
  z-index: 3;
}
.spin-btn {
  position: absolute;
  left: 50%;
  bottom: -20rpx;
  transform: translateX(-50%);
  background: #c9a36b;
  color: #1a1a1f;
  font-weight: 700;
  border-radius: 40rpx;
  padding: 0 48rpx;
}
.pool,
.hist {
  margin-top: 28rpx;
  background: rgba(255, 255, 255, 0.06);
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
  color: #fbbf24;
  font-weight: 600;
}
.pool-grid {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.pool-item {
  display: flex;
  gap: 16rpx;
  align-items: flex-start;
}
.pool-body {
  flex: 1;
  min-width: 0;
}
.dot {
  width: 20rpx;
  height: 20rpx;
  border-radius: 50%;
  margin-top: 10rpx;
  flex-shrink: 0;
}
.pn {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
}
.value {
  display: block;
  margin-top: 4rpx;
  font-size: 24rpx;
  font-weight: 800;
  color: #fb7185;
}
.free-tag {
  display: inline-block;
  margin-top: 6rpx;
  font-size: 18rpx;
  font-weight: 700;
  color: #111827;
  background: #fbbf24;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
}
.yx-muted {
  font-size: 22rpx;
  color: rgba(245, 241, 234, 0.45);
}
.hist-row {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 0;
  border-bottom: 1rpx solid rgba(255, 255, 255, 0.06);
  font-size: 24rpx;
}
</style>

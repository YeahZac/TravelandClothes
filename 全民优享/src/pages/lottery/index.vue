<template>
  <view class="yx-page lottery yx-safe-bottom">
    <view class="hero">
      <text class="title">幸运抽奖</text>
      <text class="sub">任务产次数 · 奖池公开 · 未中也有反馈</text>
      <view class="chance">
        剩余 <text class="n">{{ session.user.lotteryChance }}</text> 次
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
      <view class="pool-grid">
        <view v-for="p in pool" :key="p.id" class="pool-item">
          <view class="dot" :style="{ background: p.color }" />
          <view>
            <text class="pn">{{ p.name }}</text>
            <text class="yx-muted">{{ p.weightHint }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="hist yx-card">
      <text class="block-title">我的记录</text>
      <view v-for="h in session.lotteryHistory" :key="h.id" class="hist-row">
        <text>{{ h.name }}</text>
        <text class="yx-muted">{{ h.time }}</text>
      </view>
      <view v-if="!session.lotteryHistory.length" class="yx-muted">暂无记录</view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { lotteryPool as mockPool } from '../../mock/data.js'
import { session, spinLottery } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { request, USE_REMOTE, actionId } from '../../api/request.js'

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
    }))
  }
  return mockPool
})

const rotate = ref(0)
const spinning = ref(false)

function sliceStyle(i, color) {
  const n = pool.value.length || 1
  const deg = 360 / n
  return {
    background: color,
    transform: `rotate(${i * deg}deg) skewY(${90 - deg}deg)`,
  }
}

async function onSpin() {
  if (spinning.value) return
  if (session.user.lotteryChance <= 0) {
    uni.showToast({ title: '没有次数了，去做任务吧', icon: 'none' })
    return
  }
  spinning.value = true
  const extra = 1800 + Math.floor(Math.random() * 720)
  rotate.value += extra
  setTimeout(async () => {
    let r
    if (USE_REMOTE) {
      try {
        const data = await request('/api/traffic/v1/lottery/draw', {
          method: 'POST',
          data: { actionId: actionId('lottery') },
        })
        if (data.wallet && data.wallet.lotteryChance != null) {
          session.user.lotteryChance = data.wallet.lotteryChance
        } else if (data.wallet && data.wallet.lottery_chance != null) {
          session.user.lotteryChance = data.wallet.lottery_chance
        } else {
          session.user.lotteryChance = Math.max(0, (session.user.lotteryChance || 1) - 1)
        }
        if (data.wallet) {
          if (data.wallet.points != null) session.user.points = data.wallet.points
          if (data.wallet.energy != null) session.user.energy = data.wallet.energy
          if (data.wallet.coins != null) session.user.coins = data.wallet.coins
        }
        const prize = data.prize || {}
        session.lotteryHistory.unshift({
          id: `r_${Date.now()}`,
          name: prize.name || '奖品',
          time: new Date().toLocaleString(),
        })
        r = {
          ok: true,
          msg: prize.name || '开奖成功',
          detail: prize.prizeType || '',
          prize,
        }
      } catch (e) {
        // 在线模式禁止本地假抽奖，避免次数/库存与服务端不一致
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
            uni.navigateTo({
              url: `/pages/order/confirm?type=lottery&productId=${encodeURIComponent(
                r.prize.productId || r.prize.giftId || 'g1'
              )}`,
            })
          }
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
  padding: 24rpx 32rpx 48rpx;
  color: #fff;
}

.hero .title {
  display: block;
  font-size: 44rpx;
  font-weight: 800;
}

.hero .sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.55);
}

.chance {
  margin-top: 20rpx;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.75);
}

.chance .n {
  font-size: 40rpx;
  font-weight: 800;
  color: #ff5c4a;
  margin: 0 6rpx;
}

.wheel-wrap {
  position: relative;
  width: 560rpx;
  height: 560rpx;
  margin: 40rpx auto 48rpx;
}

.wheel {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  position: relative;
  transition: transform 2.2s cubic-bezier(0.15, 0.85, 0.25, 1);
  border: 8rpx solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 0 60rpx rgba(255, 92, 74, 0.35);
}

.slice {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 50%;
  height: 50%;
  transform-origin: 0 0;
  opacity: 0.92;
}

.slice-name {
  position: absolute;
  left: 28%;
  top: 18%;
  font-size: 18rpx;
  font-weight: 700;
  color: #fff;
  transform: skewY(-30deg) rotate(30deg);
  white-space: nowrap;
  text-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.25);
}

.hub {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 72rpx;
  height: 72rpx;
  margin: -36rpx 0 0 -36rpx;
  border-radius: 50%;
  background: #fff;
  z-index: 2;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.25);
}

.pointer {
  position: absolute;
  top: -8rpx;
  left: 50%;
  margin-left: -18rpx;
  width: 0;
  height: 0;
  border-left: 18rpx solid transparent;
  border-right: 18rpx solid transparent;
  border-top: 40rpx solid #ff5c4a;
  z-index: 3;
  filter: drop-shadow(0 4rpx 6rpx rgba(0, 0, 0, 0.3));
}

.spin-btn {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 140rpx;
  height: 140rpx;
  margin: -70rpx 0 0 -70rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff7a6b, #ff5c4a);
  color: #fff;
  font-size: 28rpx;
  font-weight: 800;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 6rpx solid #fff;
  padding: 0;
  line-height: 1.2;
}

.spin-btn::after {
  border: none;
}

.pool,
.hist {
  background: rgba(255, 255, 255, 0.06);
  margin-bottom: 20rpx;
  color: #fff;
}

.block-title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  margin-bottom: 16rpx;
}

.pool-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
}

.pool-item {
  display: flex;
  gap: 12rpx;
  align-items: flex-start;
}

.dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  margin-top: 8rpx;
  flex-shrink: 0;
}

.pn {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
}

.hist-row {
  display: flex;
  justify-content: space-between;
  padding: 14rpx 0;
  border-bottom: 1rpx solid rgba(255, 255, 255, 0.08);
  font-size: 24rpx;
}

.hist-row:last-child {
  border-bottom: none;
}

.yx-muted {
  color: rgba(255, 255, 255, 0.45) !important;
  font-size: 22rpx;
}
</style>

<template>
  <view class="wrap">
    <view class="bar" @click="goHistory">
      <view class="left">
        <text class="tag">{{ state.tag || '限时' }}</text>
        <view class="copy">
          <text class="title">{{ state.title || '限时开兑' }}</text>
          <text class="range">{{ state.rangeText || '后台配置时段' }}</text>
        </view>
      </view>
      <view class="right">
        <text class="cd yx-num">{{ state.countdown || '--:--:--' }}</text>
        <text class="hint">点空白看历史</text>
      </view>
    </view>
    <view class="foot">
      <text class="stock">{{ stockText }}</text>
      <button
        class="cta"
        :class="{ off: !state.canRedeem }"
        :disabled="!state.canRedeem || submitting"
        @click.stop="onRedeem"
      >
        {{ ctaLabel }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { request, USE_REMOTE, getToken, actionId } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { goConfirm } from '../../store/order.js'

const props = defineProps({ mod: Object })
const state = ref({
  tag: (props.mod.payload && props.mod.payload.tag) || '晚场',
  title: props.mod.title || '限时开兑',
  rangeText: (props.mod.payload && props.mod.payload.rangeText) || '',
  countdown: (props.mod.payload && props.mod.payload.countdown) || '',
  remain: 0,
  stock: 0,
  canRedeem: false,
  status: 'idle',
  productId: '',
  slotId: '',
})
const submitting = ref(false)
let tickTimer = null
let pollTimer = null

const stockText = computed(() => {
  if (state.value.status === 'soldout') return '本场已兑完'
  if (state.value.status === 'waiting') return `距开兑 ${state.value.countdown || ''}`
  if (state.value.status === 'closed') return '今日场次已结束'
  return `剩余 ${state.value.remain != null ? state.value.remain : state.value.stock} 份`
})

const ctaLabel = computed(() => {
  if (state.value.status === 'soldout') return '已兑完'
  if (state.value.status === 'waiting') return '未开兑'
  if (state.value.status === 'closed') return '已结束'
  if (state.value.canRedeem) return '立即兑换'
  return '暂不可兑'
})

let remainSec = null
let failStreak = 0
let nextPollAt = 0

function parseCountdownToSec(text) {
  const m = String(text || '').trim().match(/^(\d+):(\d{2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

function formatSec(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(r)}`
}

function tickLocal() {
  if (remainSec == null) return
  remainSec = Math.max(0, remainSec - 1)
  state.value = { ...state.value, countdown: formatSec(remainSec) }
}

async function refresh() {
  if (!USE_REMOTE) {
    state.value = {
      ...state.value,
      ...(props.mod.payload || {}),
      title: props.mod.title || '限时开兑',
      canRedeem: false,
      status: 'waiting',
    }
    remainSec = parseCountdownToSec(state.value.countdown)
    return
  }
  try {
    const data = await request('/api/traffic/v1/flash/current')
    state.value = {
      tag: data.tag || '限时',
      title: data.title || '限时开兑',
      rangeText: data.rangeText || '',
      countdown: data.countdown || '',
      remain: data.remain,
      stock: data.stock,
      canRedeem: !!data.canRedeem,
      status: data.status || 'idle',
      productId: data.productId || '',
      slotId: data.slotId || '',
    }
    remainSec =
      parseCountdownToSec(data.countdown) != null
        ? parseCountdownToSec(data.countdown)
        : parseCountdownToSec(state.value.countdown)
    failStreak = 0
    nextPollAt = Date.now() + 15000
  } catch (e) {
    failStreak += 1
    // 失败退避，避免每秒打接口刷屏 console.warn
    nextPollAt = Date.now() + Math.min(60000, 5000 * failStreak)
  }
}

function goHistory() {
  uni.navigateTo({ url: '/pages/flash/history' })
}

async function onRedeem() {
  if (!state.value.canRedeem) {
    uni.showToast({
      title: state.value.status === 'soldout' ? '本场已兑完' : '当前不可兑换',
      icon: 'none',
    })
    return
  }
  if (USE_REMOTE && !(getToken() && isLoggedIn())) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => uni.navigateTo({ url: '/pages/login/index' }), 400)
    return
  }
  submitting.value = true
  try {
    const data = await request('/api/traffic/v1/flash/redeem', {
      method: 'POST',
      data: { slotId: state.value.slotId, actionId: actionId('flash') },
    })
    if (!data.ok) {
      uni.showToast({ title: data.msg || '兑换失败', icon: 'none' })
      await refresh()
      return
    }
    if (data.needAddress && data.productId) {
      goConfirm({ type: 'gift', productId: data.productId })
    } else {
      uni.showToast({ title: data.msg || '兑换成功', icon: 'none' })
    }
    await refresh()
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '兑换失败', icon: 'none' })
    await refresh()
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  refresh()
  tickTimer = setInterval(() => {
    tickLocal()
    if (Date.now() >= nextPollAt) refresh()
  }, 1000)
})
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.wrap {
  background: #111827;
  border-radius: 24rpx;
  overflow: hidden;
  box-shadow: 0 10rpx 28rpx rgba(17, 24, 39, 0.18);
}
.bar {
  min-height: 112rpx;
  padding: 24rpx 28rpx 12rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.left {
  display: flex;
  align-items: center;
  gap: 18rpx;
  min-width: 0;
}
.tag {
  flex-shrink: 0;
  font-size: 20rpx;
  font-weight: 700;
  color: #fbbf24;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: rgba(251, 191, 36, 0.18);
}
.copy {
  min-width: 0;
}
.title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #f9fafb;
}
.range {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: rgba(249, 250, 251, 0.65);
}
.right {
  text-align: right;
}
.cd {
  display: block;
  font-size: 30rpx;
  font-weight: 800;
  color: #fbbf24;
}
.hint {
  display: block;
  margin-top: 4rpx;
  font-size: 18rpx;
  color: rgba(249, 250, 251, 0.45);
}
.foot {
  padding: 12rpx 28rpx 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.stock {
  font-size: 22rpx;
  color: rgba(249, 250, 251, 0.7);
}
.cta {
  margin: 0;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #e11d48, #f97316);
  color: #fff;
  font-size: 24rpx;
  font-weight: 700;
  border: none;
}
.cta.off {
  background: #4b5563;
  color: #d1d5db;
}
.cta::after {
  border: none;
}
</style>

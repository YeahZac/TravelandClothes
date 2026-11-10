<template>
  <view class="wrap">
    <view class="head">
      <view class="head-l">
        <text class="tag">{{ state.tag || '准点' }}</text>
        <view class="copy">
          <text class="title">{{ displayTitle }}</text>
          <text class="range">{{ state.rangeText || '后台配置时段' }}</text>
        </view>
      </view>
      <view class="head-r">
        <text class="cd yx-num">{{ state.countdown || '--:--:--' }}</text>
        <text class="hist" @click.stop="goHistory">兑换记录 ›</text>
      </view>
    </view>

    <view class="gift" @click="onGiftTap">
      <CmsImage
        class="gift-img"
        :src="state.imageUrl || ''"
        mode="aspectFill"
        placeholder="/static/ui/ico-gift.png"
        :show-placeholder="true"
      />
      <view class="gift-body">
        <text class="gift-name">{{ state.productName || '礼品待配置' }}</text>
        <text class="gift-price">{{ priceText }}</text>
        <text class="gift-stock">{{ stockText }}</text>
      </view>
    </view>

    <view class="foot">
      <text class="status-hint">{{ statusHint }}</text>
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
import CmsImage from '../CmsImage.vue'

const props = defineProps({ mod: Object })
const state = ref({
  tag: (props.mod.payload && props.mod.payload.tag) || '准点',
  title: props.mod.title || '准点兑换',
  moduleTitle: '准点兑换',
  rangeText: (props.mod.payload && props.mod.payload.rangeText) || '',
  countdown: (props.mod.payload && props.mod.payload.countdown) || '',
  remain: 0,
  stock: 0,
  canRedeem: false,
  status: 'idle',
  productId: '',
  productName: '',
  imageUrl: '',
  payLabel: '',
  payPoints: 0,
  payCashCent: 0,
  slotId: '',
})
const submitting = ref(false)
let tickTimer = null
let remainSec = null
let failStreak = 0
let nextPollAt = 0

const displayTitle = computed(
  () => state.value.moduleTitle || props.mod.title || state.value.title || '准点兑换'
)

const priceText = computed(() => {
  if (state.value.payLabel) return `兑价 ${state.value.payLabel}`
  const parts = []
  if (state.value.payPoints > 0) parts.push(`${state.value.payPoints}能量值`)
  if (state.value.payCashCent > 0) {
    const y = state.value.payCashCent / 100
    parts.push(`¥${y.toFixed(y % 1 ? 2 : 0)}`)
  }
  if (parts.length) return `兑价 ${parts.join('+')}`
  return state.value.productId ? '兑价见详情' : '运营后台绑定礼品后显示兑价'
})

const stockText = computed(() => {
  const remain = state.value.remain != null ? state.value.remain : state.value.stock
  const stock = state.value.stock || 0
  if (state.value.status === 'soldout') return `兑奖数量 0 / ${stock}`
  return `兑奖数量 ${remain} / ${stock}`
})

const statusHint = computed(() => {
  if (!state.value.productId) return '请先在运营台绑定本场礼品 SKU'
  if (state.value.status === 'soldout') return '本场已兑完'
  if (state.value.status === 'waiting') return `距开兑 ${state.value.countdown || ''}`
  if (state.value.status === 'closed') return '今日场次已结束'
  if (state.value.status === 'open' && state.value.canRedeem) return '开兑中 · 每人每场限兑 1 次'
  return '暂不可兑'
})

const ctaLabel = computed(() => {
  if (!state.value.productId) return '待配置'
  if (state.value.status === 'soldout') return '已兑完'
  if (state.value.status === 'waiting') return '待兑换'
  if (state.value.status === 'closed') return '已结束'
  if (state.value.canRedeem) return '立即兑换'
  return '待兑换'
})

function parseCountdownToSec(text) {
  const m = String(text || '')
    .trim()
    .match(/^(\d+):(\d{2}):(\d{2})$/)
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

function applyPayload(data) {
  state.value = {
    tag: data.tag || '准点',
    title: data.title || '准点兑换',
    moduleTitle: data.moduleTitle || '准点兑换',
    rangeText: data.rangeText || '',
    countdown: data.countdown || '',
    remain: data.remain,
    stock: data.stock,
    canRedeem: !!data.canRedeem,
    status: data.status || 'idle',
    productId: data.productId || '',
    productName: data.productName || '',
    imageUrl: data.imageUrl || '',
    payLabel: data.payLabel || '',
    payPoints: Number(data.payPoints || 0),
    payCashCent: Number(data.payCashCent || 0),
    slotId: data.slotId || '',
  }
  const parsed = parseCountdownToSec(data.countdown)
  remainSec = parsed != null ? parsed : parseCountdownToSec(state.value.countdown)
}

async function refresh() {
  if (!USE_REMOTE) {
    applyPayload({
      ...(props.mod.payload || {}),
      title: props.mod.title || '准点兑换',
      moduleTitle: '准点兑换',
      canRedeem: false,
      status: 'waiting',
      productName: (props.mod.payload && props.mod.payload.productName) || '示例礼品',
      payLabel: (props.mod.payload && props.mod.payload.payLabel) || '100能量值',
      remain: 12,
      stock: 30,
    })
    return
  }
  try {
    const data = await request('/api/traffic/v1/flash/current')
    applyPayload(data || {})
    failStreak = 0
    nextPollAt = Date.now() + 15000
  } catch (e) {
    failStreak += 1
    nextPollAt = Date.now() + Math.min(60000, 5000 * failStreak)
  }
}

function goHistory() {
  uni.navigateTo({ url: '/pages/flash/history' })
}

function onGiftTap() {
  if (state.value.productId) {
    uni.navigateTo({ url: `/pages/gift/detail?id=${encodeURIComponent(state.value.productId)}` })
    return
  }
  goHistory()
}

async function onRedeem() {
  if (!state.value.canRedeem) {
    uni.showToast({
      title:
        state.value.status === 'soldout'
          ? '本场已兑完'
          : !state.value.productId
            ? '礼品未配置'
            : '当前不可兑换',
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
})
</script>

<style scoped>
.wrap {
  background: #111827;
  border-radius: 24rpx;
  overflow: hidden;
  box-shadow: 0 10rpx 28rpx rgba(17, 24, 39, 0.18);
}
.head {
  padding: 24rpx 28rpx 8rpx;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}
.head-l {
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
  font-size: 30rpx;
  font-weight: 800;
  color: #f9fafb;
}
.range {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: rgba(249, 250, 251, 0.65);
}
.head-r {
  text-align: right;
  flex-shrink: 0;
}
.cd {
  display: block;
  font-size: 30rpx;
  font-weight: 800;
  color: #fbbf24;
}
.hist {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #93c5fd;
  font-weight: 600;
}
.gift {
  margin: 8rpx 20rpx 0;
  padding: 16rpx;
  display: flex;
  gap: 18rpx;
  align-items: center;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 18rpx;
}
.gift-img {
  width: 112rpx;
  height: 112rpx;
  border-radius: 16rpx;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.gift-body {
  min-width: 0;
  flex: 1;
}
.gift-name {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #f9fafb;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gift-price {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #fbbf24;
  font-weight: 600;
}
.gift-stock {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: rgba(249, 250, 251, 0.65);
}
.foot {
  padding: 16rpx 28rpx 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.status-hint {
  flex: 1;
  min-width: 0;
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
  flex-shrink: 0;
}
.cta.off {
  background: #4b5563;
  color: #d1d5db;
}
.cta::after {
  border: none;
}
</style>

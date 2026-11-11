<template>
  <view class="wrap" @click="onModuleTap">
    <view class="head">
      <view class="head-l">
        <text class="tag">{{ state.tag || '准点' }}</text>
        <view class="copy">
          <text class="title">{{ displayTitle }}</text>
          <text class="range">{{ state.rangeText || '整点开兑 · 限时2分钟' }}</text>
        </view>
      </view>
      <view class="head-r">
        <text class="hist" @click.stop="goHistory">兑换记录 ›</text>
      </view>
    </view>

    <view class="gift" @click.stop="onGiftTap">
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
      </view>
    </view>

    <view class="foot">
      <text class="status-hint">{{ statusHint }}</text>
      <button
        class="cta"
        :class="{ off: !state.canRedeem }"
        :disabled="submitting"
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
  canRedeem: false,
  status: 'idle',
  soldoutMsg: '',
  productId: '',
  productName: '',
  imageUrl: '',
  payLabel: '',
  payPoints: 0,
  payCashCent: 0,
  slotId: '',
  hour: null,
  openHm: '',
  justMissed: false,
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

const statusHint = computed(() => {
  if (!state.value.productId) return '请先在运营台启用整点并绑定礼品'
  if (state.value.status === 'open' && state.value.canRedeem) {
    return '开兑中 · 每人每场限兑 1 次'
  }
  return `距开兑 ${state.value.countdown || '--:--:--'}`
})

const ctaLabel = computed(() => {
  if (!state.value.productId) return '待配置'
  if (state.value.canRedeem) return '立即兑换'
  return '待兑换'
})

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
  if (state.value.status === 'open' && state.value.canRedeem) return
  remainSec = Math.max(0, remainSec - 1)
  state.value = { ...state.value, countdown: formatSec(remainSec) }
  if (remainSec === 0) nextPollAt = 0
}

function applyPayload(data) {
  const cdSec =
    data.countdownSec != null
      ? Number(data.countdownSec)
      : (() => {
          const m = String(data.countdown || '')
            .trim()
            .match(/^(\d+):(\d{2}):(\d{2})$/)
          return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
        })()
  state.value = {
    tag: data.tag || (data.hour != null ? `${data.hour}点` : '准点'),
    title: data.title || '准点兑换',
    moduleTitle: data.moduleTitle || '准点兑换',
    rangeText: data.rangeText || (data.openHm ? `${data.openHm} 开兑 · ${data.windowSec || 120}秒` : ''),
    countdown: data.countdown || (cdSec != null ? formatSec(cdSec) : ''),
    canRedeem: !!data.canRedeem,
    status: data.status || 'idle',
    soldoutMsg: data.soldoutMsg || '',
    productId: data.productId || '',
    productName: data.productName || '',
    imageUrl: data.imageUrl || '',
    payLabel: data.payLabel || '',
    payPoints: Number(data.payPoints || 0),
    payCashCent: Number(data.payCashCent || 0),
    slotId: data.slotId || '',
    hour: data.hour != null ? data.hour : null,
    openHm: data.openHm || '',
    justMissed: !!(data.justMissed || data.justSoldout),
  }
  remainSec = cdSec
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
      rangeText: '10:00 开兑 · 120秒',
      tag: '上午',
      countdown: '00:30:00',
      countdownSec: 1800,
    })
    return
  }
  try {
    const data = await request('/api/traffic/v1/flash/current')
    applyPayload(data || {})
    failStreak = 0
    nextPollAt = Date.now() + (data && data.canRedeem ? 3000 : 10000)
  } catch (e) {
    failStreak += 1
    nextPollAt = Date.now() + Math.min(60000, 5000 * failStreak)
  }
}

function goHistory() {
  uni.navigateTo({ url: '/pages/flash/history' })
}

function onModuleTap() {
  goHistory()
}

function onGiftTap() {
  if (state.value.productId) {
    uni.navigateTo({
      url: `/pages/gift/detail?id=${encodeURIComponent(state.value.productId)}&from=flash`,
    })
    return
  }
  goHistory()
}

function toastBusy() {
  const msg =
    state.value.soldoutMsg ||
    (state.value.justMissed
      ? '当前礼物已经被兑换完毕'
      : state.value.status === 'waiting'
        ? `未到开兑时间（${state.value.openHm || state.value.rangeText || '下一场'}）`
        : '当前礼物已经被兑换完毕')
  uni.showToast({ title: msg, icon: 'none' })
}

async function onRedeem() {
  if (!state.value.canRedeem) {
    toastBusy()
    await refresh()
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
      uni.showToast({
        title: data.msg || '当前礼物已经被兑换完毕',
        icon: 'none',
      })
      await refresh()
      return
    }
    if (data.needAddress && data.productId) {
      goConfirm({
        type: 'gift',
        productId: data.productId,
        channel: 'flash',
        slotId: data.slotId || state.value.slotId,
        payPoints: data.payPoints != null ? data.payPoints : state.value.payPoints,
        payCashCent: data.payCashCent != null ? data.payCashCent : state.value.payCashCent,
      })
    } else {
      uni.showToast({ title: data.msg || '兑换成功', icon: 'none' })
    }
    await refresh()
  } catch (e) {
    const msg = (e && e.message) || '兑换失败'
    uni.showToast({
      title: /兑|超时|完毕|时段|场次|开兑/.test(msg) ? msg : '当前礼物已经被兑换完毕',
      icon: 'none',
    })
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
  background: linear-gradient(145deg, #c81e1e 0%, #e11d48 55%, #be123c 100%);
  border-radius: 24rpx;
  overflow: hidden;
  box-shadow: 0 10rpx 28rpx rgba(190, 18, 60, 0.28);
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
  color: #7c2d12;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: rgba(254, 243, 199, 0.95);
}
.copy {
  min-width: 0;
}
.title {
  display: block;
  font-size: 30rpx;
  font-weight: 800;
  color: #fff;
}
.range {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.78);
}
.head-r {
  text-align: right;
  flex-shrink: 0;
  padding-top: 6rpx;
}
.hist {
  display: block;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.88);
  font-weight: 600;
}
.gift {
  margin: 8rpx 20rpx 0;
  padding: 16rpx;
  display: flex;
  gap: 18rpx;
  align-items: center;
  background: rgba(255, 255, 255, 0.14);
  border-radius: 18rpx;
}
.gift-img {
  width: 112rpx;
  height: 112rpx;
  border-radius: 16rpx;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.12);
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
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gift-price {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #fef08a;
  font-weight: 600;
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
  color: rgba(255, 255, 255, 0.82);
}
.cta {
  margin: 0;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  background: #fff;
  color: #be123c;
  font-size: 24rpx;
  font-weight: 800;
  border: none;
  flex-shrink: 0;
}
.cta.off {
  background: rgba(255, 255, 255, 0.35);
  color: rgba(255, 255, 255, 0.92);
}
.cta::after {
  border: none;
}
</style>

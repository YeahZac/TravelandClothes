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
        placeholder="/static/ui/ico-gift.jpg"
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
import { onShow } from '@dcloudio/uni-app'
import { request, USE_REMOTE, actionId } from '../../api/request.js'
import { assertLoginThenEnergy, polishEnergyError, promptEnergyShort } from '../../utils/energyGate.js'
import { goConfirm } from '../../store/order.js'
import CmsImage from '../CmsImage.vue'

const props = defineProps({ mod: Object })
const state = ref({
  // 准点时段与礼品只认实时接口；禁止用 CMS 旧 payload 冒充当前场次。
  tag: '准点',
  title: props.mod.title || '准点兑换',
  moduleTitle: '准点兑换',
  rangeText: '',
  countdown: '',
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
  justSoldout: false,
  windowLeftSec: null,
})
const submitting = ref(false)
let tickTimer = null
let remainSec = null
/** open 窗剩余；waiting 用 remainSec */
let windowRemainSec = null
let failStreak = 0
let nextPollAt = 0
let hasLoaded = false
let refreshing = null
let lastFetchAt = 0

const displayTitle = computed(
  () => state.value.moduleTitle || props.mod.title || state.value.title || '准点兑换'
)

const priceText = computed(() => {
  if (state.value.payLabel) return String(state.value.payLabel)
  const parts = []
  if (state.value.payPoints > 0) parts.push(`${state.value.payPoints}能量值`)
  if (state.value.payCashCent > 0) {
    const y = state.value.payCashCent / 100
    parts.push(`¥${y.toFixed(y % 1 ? 2 : 0)}`)
  }
  if (parts.length) return parts.join('+')
  return state.value.productId ? '详见兑换页' : '礼品准备中'
})

const statusHint = computed(() => {
  if (state.value.status === 'error') return '服务暂时连接失败，正在自动重试'
  if (!state.value.productId) return '本场礼品准备中，稍后再来'
  if (state.value.status === 'open' && state.value.canRedeem) {
    const left =
      windowRemainSec != null ? formatSec(windowRemainSec) : state.value.countdown || '--:--'
    return `开兑中 · 剩余 ${left} · 每人每场限兑 1 次`
  }
  if (state.value.justSoldout && state.value.openHm) {
    return `上一场已兑完 · 距 ${state.value.openHm} 还有 ${state.value.countdown || '--:--:--'}`
  }
  return `距开兑 ${state.value.countdown || '--:--:--'}`
})

const ctaLabel = computed(() => {
  if (state.value.status === 'error') return '加载中'
  if (!state.value.productId) return '待配置'
  if (state.value.canRedeem) return '立即兑换'
  if (state.value.justSoldout) return '下场再兑'
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

function parseCountdownSec(data) {
  if (data && data.countdownSec != null && Number.isFinite(Number(data.countdownSec))) {
    return Math.max(0, Number(data.countdownSec))
  }
  const m = String((data && data.countdown) || '')
    .trim()
    .match(/^(\d+):(\d{2}):(\d{2})$/)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
}

function schedulePoll(ms) {
  nextPollAt = Date.now() + Math.max(500, Number(ms) || 10000)
}

function tickLocal() {
  const openNow = state.value.status === 'open' && state.value.canRedeem
  if (openNow) {
    if (windowRemainSec == null) return
    windowRemainSec = Math.max(0, windowRemainSec - 1)
    state.value = {
      ...state.value,
      windowLeftSec: windowRemainSec,
      countdown: formatSec(windowRemainSec),
    }
    // 窗末立刻拉下一场，不等下一轮 3s 轮询
    if (windowRemainSec === 0) schedulePoll(0)
    return
  }

  if (remainSec == null) return
  remainSec = Math.max(0, remainSec - 1)
  state.value = { ...state.value, countdown: formatSec(remainSec) }
  if (remainSec === 0) schedulePoll(0)
}

function applyPayload(data) {
  const cdSec = parseCountdownSec(data)
  const winLeft =
    data && data.windowLeftSec != null && Number.isFinite(Number(data.windowLeftSec))
      ? Math.max(0, Number(data.windowLeftSec))
      : null
  const openNow = data && data.status === 'open' && !!data.canRedeem
  const justSoldout = !!(data && (data.justSoldout || data.justMissed))
  state.value = {
    tag: data.tag || (data.hour != null ? `${data.hour}点` : '准点'),
    title: data.title || '准点兑换',
    moduleTitle: data.moduleTitle || '准点兑换',
    rangeText: data.rangeText || (data.openHm ? `${data.openHm} 开兑 · ${data.windowSec || 120}秒` : ''),
    countdown: openNow && winLeft != null ? formatSec(winLeft) : data.countdown || (cdSec != null ? formatSec(cdSec) : ''),
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
    justMissed: justSoldout,
    justSoldout,
    windowLeftSec: winLeft,
  }
  if (openNow) {
    windowRemainSec = winLeft != null ? winLeft : cdSec
    remainSec = null
    // 窗末前再拉一次；开兑中也保持较短轮询
    const untilEnd = windowRemainSec != null ? (windowRemainSec + 1) * 1000 : 3000
    schedulePoll(Math.min(3000, untilEnd))
  } else {
    windowRemainSec = null
    remainSec = cdSec
    // 距开兑越近轮询越勤
    if (cdSec != null && cdSec <= 5) schedulePoll(1000)
    else if (cdSec != null && cdSec <= 60) schedulePoll(3000)
    else schedulePoll(10000)
  }
  hasLoaded = true
}

async function refresh(opts = {}) {
  // mount + onShow 首屏双刷：1s 内跳过
  if (!opts.force && lastFetchAt && Date.now() - lastFetchAt < 1000) return refreshing
  if (refreshing) return refreshing
  refreshing = (async () => {
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
      // 倒计时窗口内强制新鲜；平时走默认 3s TTL
      const nearWindow =
        (remainSec != null && remainSec <= 60) ||
        (windowRemainSec != null && windowRemainSec >= 0) ||
        (state.value && state.value.status === 'open')
      const data = await request('/api/traffic/v1/flash/current', {
        preferHttps: true,
        timeout: 12000,
        cloudTimeout: 6000,
        ...(nearWindow || opts.force ? { noCache: true } : {}),
      })
      lastFetchAt = Date.now()
      applyPayload(data || {})
      failStreak = 0
    } catch (e) {
      failStreak += 1
      schedulePoll(Math.min(60000, 4000 * failStreak))
      if (!hasLoaded) {
        state.value = {
          ...state.value,
          tag: '准点',
          rangeText: '实时场次加载中',
          status: 'error',
          canRedeem: false,
          productId: '',
          productName: '场次数据加载中',
          imageUrl: '',
          payLabel: '',
          justSoldout: false,
        }
      }
    } finally {
      refreshing = null
    }
  })()
  return refreshing
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
  if (state.value.status === 'waiting' || !state.value.canRedeem) {
    if (state.value.justSoldout && state.value.soldoutMsg) {
      uni.showToast({ title: state.value.soldoutMsg, icon: 'none' })
      return
    }
    uni.showToast({
      title: `未到开兑时间（${state.value.openHm || '下一场'}）`,
      icon: 'none',
    })
    return
  }
  uni.showToast({
    title: state.value.soldoutMsg || '当前礼物已经被兑换完毕',
    icon: 'none',
  })
}

async function onRedeem() {
  if (!state.value.canRedeem) {
    toastBusy()
    await refresh()
    return
  }
  const need = Number(state.value.payPoints || 0) || 0
  const gate = await assertLoginThenEnergy({
    need,
    redirectPath: '/pages/home/index',
    action: '准点兑换',
    loginToast: '请先登录后再兑换',
  })
  if (!gate.ok) return
  submitting.value = true
  try {
    const data = await request('/api/traffic/v1/flash/redeem', {
      method: 'POST',
      data: { slotId: state.value.slotId, actionId: actionId('flash') },
      timeout: 15000,
    })
    if (!data.ok) {
      const msg = data.msg || '当前礼物已经被兑换完毕'
      if (/能量/.test(msg)) {
        await promptEnergyShort({
          need: need || Number(data.payPoints) || 0,
          action: '准点兑换',
        })
      } else {
        uni.showToast({ title: msg, icon: 'none' })
      }
      await refresh()
      return
    }
    if (data.needAddress && data.productId) {
      goConfirm({
        type: 'gift',
        productId: data.productId,
        entryFrom: 'flash',
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
    const raw = (e && e.message) || '兑换失败'
    if (/能量/.test(raw)) {
      await promptEnergyShort({ need, action: '准点兑换' })
    } else if (/尚未开兑|未到|不在开兑|场次已切换/i.test(raw)) {
      uni.showToast({
        title: `未到开兑时间（${state.value.openHm || '下一场'}）`,
        icon: 'none',
      })
    } else {
      uni.showToast({
        title: /兑|超时|完毕|时段|场次|开兑|timeout|fail/i.test(raw)
          ? polishEnergyError(raw, { action: '准点兑换' })
          : raw || '兑换失败',
        icon: 'none',
      })
    }
    await refresh()
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  refresh()
  tickTimer = setInterval(() => {
    tickLocal()
    if (Date.now() >= nextPollAt) refresh({ force: true })
  }, 1000)
})
onShow(() => {
  // 从后台回前台：立刻对齐下一场；与 onMounted 1s 内去重
  schedulePoll(0)
  refresh()
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

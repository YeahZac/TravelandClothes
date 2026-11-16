<template>
  <view class="yx-page page yx-safe-bottom">
    <view class="card">
      <text class="h">汉服节验票</text>
      <text class="sub">扫用户电子票二维码，核对真伪与当日有效性</text>
      <text class="note">今日（东八区）：{{ today || '—' }} · 通过后可放行；当日同一票可反复进出；「作废」后不可再进。</text>
      <button class="yx-btn yx-btn-orange scan" @click="scan">扫一扫验票</button>
      <input class="inp" v-model="code" placeholder="FEST|票号|核销码 或票号" />
      <button class="yx-btn manual" :loading="busy" @click="submit(false)">确认查验</button>
      <button class="yx-btn void" :loading="busy" @click="confirmVoid">作废此票</button>
    </view>

    <view v-if="last" class="result" :class="resultClass">
      <text class="rt">{{ last.msg }}</text>
      <view v-if="last.ticket" class="ticket">
        <text class="rd strong">{{ last.ticket.skuName }}</text>
        <text class="rd">使用日 · {{ last.ticket.dayLabel || '—' }}</text>
        <text class="rd">状态 · {{ last.ticket.statusLabel }}</text>
        <text class="rd">出行人 · {{ last.ticket.visitor || '—' }} · {{ last.ticket.phone || '—' }}</text>
        <text class="rd mono">票号 {{ last.ticket.ticketNo }}</text>
        <text class="rd mono">订单 {{ last.ticket.orderNo }}</text>
      </view>
      <text v-if="last.ok && !last.invalidated" class="pass-tip">可放行入场</text>
      <text v-else-if="!last.ok" class="fail-tip">请勿放行，请引导用户出示正确日期的有效票</text>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { USE_REMOTE, request } from '../../api/request.js'
import { requireAuth } from '../../utils/loginGate.js'

const code = ref('')
const busy = ref(false)
const last = ref(null)
const today = ref('')
const allowed = ref(false)

const resultClass = computed(() => {
  if (!last.value) return ''
  if (last.value.ok && last.value.invalidated) return 'warn'
  if (last.value.ok) return 'ok'
  return 'bad'
})

async function ensureAccess() {
  if (!requireAuth('/pages/festival/verify')) return false
  if (!USE_REMOTE) {
    uni.showToast({ title: '离线模式不可验票', icon: 'none' })
    return false
  }
  try {
    const data = await request('/api/traffic/v1/festival/verify/access')
    allowed.value = !!(data && data.allowed)
    today.value = (data && data.today) || ''
    if (!allowed.value) {
      uni.showModal({
        title: '无验票权限',
        content: '仅运营配置的验票管理员可使用本页。请联系后台在「系统设置 · 验票管理员」添加你的账号。',
        showCancel: false,
        success: () => uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/mine/index' }) }),
      })
      return false
    }
    return true
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '权限校验失败', icon: 'none' })
    return false
  }
}

onShow(() => {
  ensureAccess()
})

async function doVerify(raw, invalidate = false) {
  const c = String(raw || '').trim()
  if (!c) {
    uni.showToast({ title: '请输入或扫码', icon: 'none' })
    return
  }
  if (!(await ensureAccess())) return
  busy.value = true
  last.value = null
  try {
    const data = await request('/api/traffic/v1/festival/verify', {
      method: 'POST',
      data: { code: c, invalidate: !!invalidate },
    })
    last.value = {
      ok: !!(data && data.ok),
      msg: (data && data.msg) || (invalidate ? '已处理' : '已查验'),
      ticket: data && data.ticket,
      invalidated: !!(data && data.invalidated),
      code: data && data.code,
    }
    uni.showToast({
      title: last.value.msg,
      icon: last.value.ok ? 'success' : 'none',
      duration: 2500,
    })
    if (invalidate && last.value.ok) code.value = ''
  } catch (e) {
    last.value = { ok: false, msg: (e && e.message) || '操作失败', ticket: null }
    uni.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

function scan() {
  // #ifdef MP-WEIXIN
  uni.scanCode({
    onlyFromCamera: false,
    success(res) {
      const raw = (res && (res.result || res.path)) || ''
      code.value = raw
      doVerify(raw, false)
    },
    fail() {
      uni.showToast({ title: '扫码取消', icon: 'none' })
    },
  })
  // #endif
  // #ifndef MP-WEIXIN
  uni.showToast({ title: '请在微信小程序内扫码', icon: 'none' })
  // #endif
}

function submit(invalidate) {
  doVerify(code.value, !!invalidate)
}

function confirmVoid() {
  uni.showModal({
    title: '确认作废？',
    content: '作废后该票不可再入场，请谨慎操作。',
    success: (res) => {
      if (res.confirm) submit(true)
    },
  })
}
</script>

<style scoped>
.page {
  padding: 28rpx;
  min-height: 100vh;
  background: #f6f1ea;
}
.card {
  padding: 36rpx 28rpx;
  background: #fffdf9;
  border-radius: 24rpx;
  border: 1rpx solid #ebe3d8;
}
.h {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  color: #1f1814;
}
.sub {
  display: block;
  margin: 8rpx 0 12rpx;
  font-size: 24rpx;
  color: #8a7b6d;
}
.note {
  display: block;
  margin-bottom: 24rpx;
  font-size: 22rpx;
  color: #8a4b2e;
  line-height: 1.45;
}
.scan {
  margin-bottom: 24rpx;
}
.inp {
  width: 100%;
  height: 88rpx;
  padding: 0 20rpx;
  box-sizing: border-box;
  border-radius: 16rpx;
  background: #f6f1ea;
  font-size: 26rpx;
  margin-bottom: 20rpx;
}
.manual {
  background: #2b2520;
  color: #fff;
  border-radius: 44rpx;
  height: 84rpx;
  line-height: 84rpx;
  font-size: 28rpx;
  font-weight: 700;
  border: none;
  margin-bottom: 16rpx;
}
.void {
  background: transparent;
  color: #c45c3e;
  border: 2rpx solid #c45c3e;
  border-radius: 44rpx;
  height: 84rpx;
  line-height: 80rpx;
  font-size: 28rpx;
  font-weight: 700;
}
.result {
  margin-top: 28rpx;
  padding: 28rpx;
  border-radius: 20rpx;
  background: #f8ebe4;
}
.result.ok {
  background: #e6f2ea;
  border: 2rpx solid #7fa67a;
}
.result.bad {
  background: #f8ebe4;
  border: 2rpx solid #c45c3e;
}
.result.warn {
  background: #fff4e5;
  border: 2rpx solid #e8a87c;
}
.rt {
  display: block;
  font-size: 30rpx;
  font-weight: 800;
  color: #1f1814;
  line-height: 1.4;
}
.ticket {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx dashed rgba(43, 37, 32, 0.15);
}
.rd {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #5c574f;
}
.rd.strong {
  font-size: 28rpx;
  font-weight: 700;
  color: #1f1814;
}
.rd.mono {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 22rpx;
}
.pass-tip {
  display: block;
  margin-top: 20rpx;
  font-size: 28rpx;
  font-weight: 800;
  color: #3d7a4a;
}
.fail-tip {
  display: block;
  margin-top: 20rpx;
  font-size: 26rpx;
  font-weight: 700;
  color: #c45c3e;
}
</style>

<template>
  <view class="yx-page page yx-safe-bottom">
    <view class="card">
      <text class="h">汉服节票务核销</text>
      <text class="sub">扫码或手动输入票号 / 核销码</text>
      <button class="yx-btn yx-btn-orange scan" @click="scan">扫一扫核销</button>
      <input class="inp" v-model="code" placeholder="FEST|票号|核销码 或票号" />
      <button class="yx-btn manual" :loading="busy" @click="submit">确认核销</button>
    </view>
    <view v-if="last" class="result" :class="{ ok: last.ok }">
      <text class="rt">{{ last.msg }}</text>
      <text v-if="last.ticket" class="rd">{{ last.ticket.skuName }} · {{ last.ticket.visitor }}</text>
      <text v-if="last.ticket" class="rd">{{ last.ticket.ticketNo }} · {{ last.ticket.statusLabel }}</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { USE_REMOTE, request } from '../../api/request.js'
import { requireAuth } from '../../utils/loginGate.js'

const code = ref('')
const busy = ref(false)
const last = ref(null)

onShow(() => {
  requireAuth('/pages/festival/verify')
})

async function doVerify(raw) {
  const c = String(raw || '').trim()
  if (!c) {
    uni.showToast({ title: '请输入或扫码', icon: 'none' })
    return
  }
  if (!USE_REMOTE) {
    uni.showToast({ title: '离线模式不可核销', icon: 'none' })
    return
  }
  busy.value = true
  last.value = null
  try {
    const data = await request('/api/traffic/v1/festival/verify', {
      method: 'POST',
      data: { code: c },
    })
    last.value = { ok: true, msg: (data && data.msg) || '核销成功', ticket: data && data.ticket }
    uni.showToast({ title: '核销成功', icon: 'success' })
    code.value = ''
  } catch (e) {
    last.value = { ok: false, msg: (e && e.message) || '核销失败', ticket: null }
    uni.showToast({ title: (e && e.message) || '核销失败', icon: 'none' })
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
      doVerify(raw)
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

function submit() {
  doVerify(code.value)
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
  margin: 8rpx 0 28rpx;
  font-size: 24rpx;
  color: #8a7b6d;
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
}
.result {
  margin-top: 28rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  background: #f8ebe4;
}
.result.ok {
  background: #e6f2ea;
}
.rt {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #1f1814;
}
.rd {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #5c574f;
}
</style>

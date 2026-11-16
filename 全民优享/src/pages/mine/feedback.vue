<template>
  <view class="page yx-safe-bottom">
    <view class="card">
      <text class="lab">反馈内容</text>
      <textarea
        class="ta"
        :value="content"
        maxlength="1000"
        placeholder="请描述问题或建议（至少 5 个字）"
        @input="onContent"
      />
      <text class="count yx-num">{{ content.length }}/1000</text>
    </view>

    <view class="card">
      <text class="lab">联系方式（选填）</text>
      <input
        class="inp"
        :value="contact"
        placeholder="手机号 / 微信号，方便回访"
        maxlength="64"
        @input="onContact"
      />
    </view>

    <button class="submit yx-btn-fill" :loading="busy" @click="onSubmit">提交反馈</button>

    <view v-if="mine.length" class="hist">
      <text class="ht">我的反馈</text>
      <view v-for="f in mine" :key="f.id" class="hcard">
        <view class="hhead">
          <text class="hst">{{ statusText(f.status) }}</text>
          <text class="hmute">{{ (f.createdAt || '').slice(0, 16) }}</text>
        </view>
        <text class="hbody">{{ f.content }}</text>
        <view v-if="f.adminReply" class="hreply">
          <text class="hrl">官方回复</text>
          <text class="hrt">{{ f.adminReply }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request, USE_REMOTE } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { requireAuth } from '../../utils/loginGate.js'

const content = ref('')
const contact = ref('')
const busy = ref(false)
const mine = ref([])

function onContent(e) {
  content.value = (e && e.detail && e.detail.value) || ''
}
function onContact(e) {
  contact.value = (e && e.detail && e.detail.value) || ''
}

function statusText(st) {
  if (st === 'replied') return '已回复'
  if (st === 'closed') return '已结案'
  return '处理中'
}

async function loadMine() {
  if (!(USE_REMOTE && isLoggedIn())) {
    mine.value = []
    return
  }
  try {
    const data = await request('/api/traffic/v1/feedback/mine')
    mine.value = (data && data.list) || []
  } catch (_) {
    mine.value = []
  }
}

async function onSubmit() {
  if (!requireAuth('/pages/mine/feedback')) return
  const text = String(content.value || '').trim()
  if (text.length < 5) {
    uni.showToast({ title: '请至少填写 5 个字', icon: 'none' })
    return
  }
  if (busy.value) return
  busy.value = true
  try {
    await request('/api/traffic/v1/feedback', {
      method: 'POST',
      data: {
        content: text,
        contact: String(contact.value || '').trim(),
      },
    })
    content.value = ''
    uni.showToast({ title: '已提交，感谢反馈', icon: 'success' })
    await loadMine()
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '提交失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

onShow(() => {
  loadMine()
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx var(--page-x) 48rpx;
  background: var(--paper);
}
.card {
  background: var(--paper-2);
  border-radius: 24rpx;
  padding: 28rpx 24rpx;
  box-shadow: var(--shadow);
  margin-bottom: 20rpx;
}
.lab {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--ink-2);
  margin-bottom: 16rpx;
}
.ta {
  width: 100%;
  min-height: 220rpx;
  font-size: 28rpx;
  color: var(--ink);
  line-height: 1.5;
}
.count {
  display: block;
  text-align: right;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: var(--ink-3);
}
.inp {
  width: 100%;
  height: 72rpx;
  font-size: 28rpx;
  color: var(--ink);
}
.submit {
  margin-top: 12rpx;
  width: 100%;
}
.hist {
  margin-top: 40rpx;
}
.ht {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 16rpx;
}
.hcard {
  background: var(--paper-2);
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  box-shadow: var(--shadow-soft);
}
.hhead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}
.hst {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--accent-deep, #b87a1f);
}
.hmute {
  font-size: 22rpx;
  color: var(--ink-3);
}
.hbody {
  font-size: 26rpx;
  color: var(--ink);
  line-height: 1.5;
  white-space: pre-wrap;
}
.hreply {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid var(--line-soft);
}
.hrl {
  display: block;
  font-size: 22rpx;
  color: var(--ink-3);
  margin-bottom: 6rpx;
}
.hrt {
  font-size: 26rpx;
  color: var(--ink);
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>

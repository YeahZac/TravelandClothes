<template>
  <view class="page">
    <view class="bg" />
    <view class="body">
      <view class="brand">
        <text class="skin">全民优享</text>
        <text class="slogan">每天打开 · 攒能量兑好物</text>
      </view>

      <view class="card">
        <view class="avatar-wrap">
          <button class="avatar-btn" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
            <image v-if="avatarUrl" class="avatar" :src="avatarUrl" mode="aspectFill" />
            <view v-else class="avatar placeholder">
              <text class="ph">头像</text>
            </view>
          </button>
          <text class="hint">可选 · 点击设置头像</text>
        </view>

        <view class="nick-row">
          <text class="lab">昵称</text>
          <input
            class="nick"
            type="nickname"
            :value="nickName"
            placeholder="点击填写微信昵称"
            @blur="onNickBlur"
            @input="onNickInput"
          />
        </view>

        <view class="agree" @click="toggleAgree">
          <view class="box" :class="{ on: agreed }">
            <text v-if="agreed" class="tick">✓</text>
          </view>
          <view class="agree-txt">
            <text class="plain">我已阅读并同意</text>
            <text class="link" @click.stop="openLegal('tos')">《用户服务协议》</text>
            <text class="plain">和</text>
            <text class="link" @click.stop="openLegal('privacy')">《隐私政策》</text>
          </view>
        </view>

        <button
          class="wx-btn"
          :class="{ disabled: !agreed }"
          :loading="busy"
          :disabled="busy"
          @click="onLogin"
        >
          微信一键登录
        </button>
        <text class="legal">未勾选协议将无法登录 · 账号体系与同袍会小程序关联</text>
      </view>

      <button class="skip" @click="onSkip">稍后再说</button>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { loginWithWeChat } from '../../api/auth.js'
import { fetchLegalMeta } from '../../api/legal.js'
import { session } from '../../store/session.js'

const busy = ref(false)
const agreed = ref(false)
const nickName = ref('')
const avatarUrl = ref('')
const redirect = ref('')
const tosVersion = ref('1.0.0')
const privacyVersion = ref('1.0.0')

onLoad((q) => {
  redirect.value = (q && q.redirect) || ''
  if (session.user && session.user.loggedIn) {
    goAfterLogin()
  }
})

onMounted(async () => {
  try {
    const meta = await fetchLegalMeta()
    if (meta && meta.tos && meta.tos.version) tosVersion.value = meta.tos.version
    if (meta && meta.privacy && meta.privacy.version) privacyVersion.value = meta.privacy.version
  } catch (e) {
    console.warn('[login] legal meta', e && e.message)
  }
})

function toggleAgree() {
  agreed.value = !agreed.value
}

function openLegal(id) {
  uni.navigateTo({ url: `/pages/legal/detail?id=${id}` })
}

function onChooseAvatar(e) {
  const url = e && e.detail && e.detail.avatarUrl
  if (url) avatarUrl.value = url
}

function onNickInput(e) {
  nickName.value = (e && e.detail && e.detail.value) || ''
}

function onNickBlur(e) {
  nickName.value = (e && e.detail && e.detail.value) || nickName.value
}

function goAfterLogin() {
  if (redirect.value) {
    uni.redirectTo({
      url: decodeURIComponent(redirect.value),
      fail: () => uni.switchTab({ url: '/pages/home/index' }),
    })
    return
  }
  uni.switchTab({ url: '/pages/mine/index' })
}

async function onLogin() {
  if (busy.value) return
  if (!agreed.value) {
    uni.showToast({ title: '请先勾选同意协议', icon: 'none' })
    return
  }
  busy.value = true
  try {
    await loginWithWeChat({
      nickName: nickName.value.trim(),
      avatarUrl: avatarUrl.value,
      agreeLegal: true,
      tosVersion: tosVersion.value,
      privacyVersion: privacyVersion.value,
    })
    uni.showToast({ title: '登录成功', icon: 'none' })
    setTimeout(goAfterLogin, 400)
  } catch (e) {
    uni.showToast({ title: e.message || '登录失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

function onSkip() {
  uni.navigateBack({
    fail: () => uni.switchTab({ url: '/pages/home/index' }),
  })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  background: #1a2e28;
}
.bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 90% 60% at 20% 10%, rgba(46, 196, 182, 0.35), transparent 55%),
    radial-gradient(ellipse 70% 50% at 90% 80%, rgba(255, 92, 74, 0.22), transparent 50%),
    linear-gradient(165deg, #14241f 0%, #1c332c 45%, #243830 100%);
}
.body {
  position: relative;
  z-index: 1;
  padding: 160rpx 48rpx 80rpx;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  box-sizing: border-box;
}
.brand {
  margin-bottom: 64rpx;
}
.skin {
  display: block;
  font-size: 56rpx;
  font-weight: 800;
  color: #f4f7f5;
  letter-spacing: 2rpx;
}
.slogan {
  display: block;
  margin-top: 12rpx;
  font-size: 26rpx;
  color: rgba(244, 247, 245, 0.72);
}
.card {
  background: rgba(255, 250, 244, 0.96);
  border-radius: 32rpx;
  padding: 48rpx 40rpx 40rpx;
  box-shadow: 0 24rpx 60rpx rgba(0, 0, 0, 0.22);
}
.avatar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 36rpx;
}
.avatar-btn {
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  line-height: 1;
}
.avatar-btn::after {
  border: none;
}
.avatar {
  width: 144rpx;
  height: 144rpx;
  border-radius: 50%;
  background: #e8efe9;
}
.avatar.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed #b7c4b9;
}
.ph {
  font-size: 24rpx;
  color: #7a8a7e;
}
.hint {
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #8a948c;
}
.nick-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  background: #f3f0ea;
  margin-bottom: 28rpx;
}
.lab {
  font-size: 24rpx;
  color: #6e6258;
  flex-shrink: 0;
}
.nick {
  flex: 1;
  font-size: 28rpx;
  color: #1c1a17;
  height: 48rpx;
}
.agree {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  margin-bottom: 28rpx;
}
.box {
  width: 32rpx;
  height: 32rpx;
  margin-top: 4rpx;
  border-radius: 8rpx;
  border: 2rpx solid #b7c4b9;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-sizing: border-box;
}
.box.on {
  background: #07c160;
  border-color: #07c160;
}
.tick {
  color: #fff;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1;
}
.agree-txt {
  flex: 1;
  font-size: 22rpx;
  line-height: 1.55;
  color: #6e6258;
}
.plain {
  color: #6e6258;
}
.link {
  color: #1a7f4b;
  font-weight: 600;
}
.wx-btn {
  width: 100%;
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 999rpx;
  border: none;
  background: #07c160;
  color: #fff;
  font-size: 32rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
}
.wx-btn::after {
  border: none;
}
.wx-btn.disabled {
  background: #b7dcc4;
  color: rgba(255, 255, 255, 0.92);
}
.wx-btn:active {
  opacity: 0.9;
}
.legal {
  display: block;
  margin-top: 24rpx;
  font-size: 20rpx;
  color: #9a948c;
  line-height: 1.5;
  text-align: center;
}
.skip {
  margin-top: auto;
  padding-top: 48rpx;
  background: transparent;
  border: none;
  color: rgba(244, 247, 245, 0.55);
  font-size: 26rpx;
}
.skip::after {
  border: none;
}
</style>

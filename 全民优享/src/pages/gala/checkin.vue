<template>
  <view class="page">
    <view class="hero">
      <text class="tag">年会签到</text>
      <text class="title">{{ eventTitle || '活动签到' }}</text>
      <text class="sub">授权头像昵称后即可上墙参与抽奖</text>
    </view>

    <view class="card">
      <button class="avatar-btn" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
        <image class="avatar" :src="avatarUrl || defaultAvatar" mode="aspectFill" />
        <text class="hint">点击选择微信头像</text>
      </button>

      <view class="field">
        <text class="lab">微信昵称</text>
        <input
          class="inp"
          type="nickname"
          :value="nickName"
          placeholder="点此选用微信昵称"
          @input="onNick"
          @blur="onNick"
          @change="onNick"
        />
      </view>

      <view v-if="requireRealName" class="field">
        <text class="lab">真实姓名</text>
        <input class="inp" :value="realName" placeholder="请填写真实姓名" @input="onReal" />
      </view>
      <view v-else class="field">
        <text class="lab">真实姓名（选填）</text>
        <input class="inp" :value="realName" placeholder="可填写便于主持唱名" @input="onReal" />
      </view>

      <button class="cta" :loading="busy" :disabled="busy" @click="submit">确认签到</button>
      <text class="tip">场次码 {{ code || '—' }}</text>
    </view>
    <LoginSheet />
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import LoginSheet from '../../components/LoginSheet.vue'
import { isLoggedIn, updateProfile } from '../../api/auth.js'
import { requireAuth } from '../../utils/loginGate.js'
import {
  fetchGalaByCode,
  galaCheckin,
  parseGalaScene,
  saveGalaPending,
  readGalaPending,
} from '../../api/galaApi.js'
import { uploadAvatarFile, pickAvatarStoragePath, isTempAvatarPath } from '../../utils/uploadAvatar.js'
import { USE_REMOTE } from '../../api/request.js'

const defaultAvatar =
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

const code = ref('')
const eventId = ref(0)
const eventTitle = ref('')
const requireRealName = ref(false)
const nickName = ref('')
const avatarUrl = ref('')
const avatarLocal = ref('')
const realName = ref('')
const busy = ref(false)

function onChooseAvatar(e) {
  const url = e && e.detail && e.detail.avatarUrl
  if (!url) return
  avatarLocal.value = url
  avatarUrl.value = url
}

function onNick(e) {
  nickName.value = ((e && e.detail && e.detail.value) || '').trim()
}

function onReal(e) {
  realName.value = ((e && e.detail && e.detail.value) || '').trim()
}

async function ensureLogin() {
  if (isLoggedIn()) return true
  if (!requireAuth('/pages/gala/checkin?code=' + encodeURIComponent(code.value))) return false
  return false
}

async function loadEvent() {
  if (!code.value) return
  try {
    const data = await fetchGalaByCode(code.value)
    const ev = data && data.event
    if (!ev) throw new Error('场次不存在')
    eventId.value = ev.id
    eventTitle.value = ev.title || ''
    requireRealName.value = !!ev.requireRealName
    saveGalaPending(ev.code)
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '场次无效', icon: 'none' })
  }
}

async function submit() {
  if (busy.value) return
  if (!isLoggedIn()) {
    await ensureLogin()
    return
  }
  const nick = nickName.value.trim()
  if (!nick || nick === '微信用户' || nick === '点击登录') {
    uni.showToast({ title: '请填写微信昵称', icon: 'none' })
    return
  }
  if (!avatarUrl.value && !avatarLocal.value) {
    uni.showToast({ title: '请选择微信头像', icon: 'none' })
    return
  }
  if (requireRealName.value && !realName.value.trim()) {
    uni.showToast({ title: '请填写真实姓名', icon: 'none' })
    return
  }
  if (!eventId.value) {
    uni.showToast({ title: '场次未加载', icon: 'none' })
    return
  }
  busy.value = true
  try {
    let finalAvatar = pickAvatarStoragePath(avatarUrl.value)
    const local = avatarLocal.value || avatarUrl.value
    if (local && (isTempAvatarPath(local) || !finalAvatar)) {
      try {
        const up = await uploadAvatarFile(local)
        finalAvatar = pickAvatarStoragePath(up) || finalAvatar
      } catch (_) {}
    }
    if (USE_REMOTE) {
      try {
        await updateProfile({
          nickName: nick,
          avatarUrl: finalAvatar || avatarUrl.value,
        })
      } catch (_) {}
    }
    const r = await galaCheckin(eventId.value, {
      nickName: nick,
      avatarUrl: finalAvatar || avatarUrl.value,
      realName: realName.value.trim(),
    })
    const pid = r && r.participant && r.participant.id
    uni.redirectTo({
      url: `/pages/gala/success?eventId=${eventId.value}&code=${encodeURIComponent(code.value)}&name=${encodeURIComponent(nick)}&already=${r && r.already ? 1 : 0}`,
    })
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '签到失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

onLoad(async (q) => {
  let c = String((q && q.code) || '').trim().toUpperCase()
  if (!c && q && q.scene) c = parseGalaScene(q.scene)
  if (!c) c = readGalaPending()
  code.value = c
  if (!isLoggedIn()) {
    // 预热登录弹层；用户点签到时再强制
  }
  await loadEvent()
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: linear-gradient(180deg, #c4162a 0%, #f6efe6 42%, #f6efe6 100%);
  padding: 48rpx 32rpx 80rpx;
}
.hero { padding: 40rpx 8rpx 28rpx; color: #fff; }
.tag {
  display: inline-block; font-size: 22rpx; padding: 6rpx 16rpx;
  border: 1rpx solid rgba(255,255,255,.5); border-radius: 999rpx; margin-bottom: 16rpx;
}
.title { display: block; font-size: 44rpx; font-weight: 800; letter-spacing: 2rpx; }
.sub { display: block; margin-top: 12rpx; font-size: 26rpx; opacity: .9; }
.card {
  background: #fff; border-radius: 24rpx; padding: 36rpx 28rpx;
  box-shadow: 0 12rpx 40rpx rgba(120, 20, 30, .12);
}
.avatar-btn {
  background: transparent; padding: 0; margin: 0 0 24rpx; display: flex;
  flex-direction: column; align-items: center; line-height: 1.2;
}
.avatar-btn::after { border: 0; }
.avatar { width: 140rpx; height: 140rpx; border-radius: 50%; background: #f0e6da; }
.hint { margin-top: 12rpx; font-size: 24rpx; color: #9a7b6a; }
.field { margin-bottom: 20rpx; }
.lab { display: block; font-size: 24rpx; color: #8a7366; margin-bottom: 8rpx; }
.inp {
  background: #f7f1ea; border-radius: 14rpx; padding: 20rpx 22rpx; font-size: 28rpx;
}
.cta {
  margin-top: 12rpx; background: #c4162a; color: #fff; border-radius: 999rpx;
  font-size: 30rpx; font-weight: 700;
}
.cta::after { border: 0; }
.tip { display: block; text-align: center; margin-top: 20rpx; font-size: 22rpx; color: #a09080; }
</style>

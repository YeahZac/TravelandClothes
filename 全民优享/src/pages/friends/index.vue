<template>
  <view class="yx-page friends yx-safe-bottom">
    <view class="hero">
      <text class="title">好友能量</text>
      <text class="sub">偷能量 / 偷树上营养 · 今日还可偷 {{ stealsLeft }} · 助力 {{ helpsLeft }}</text>
    </view>

    <view class="list yx-card">
      <view class="block-head">
        <text class="block-title">可收取 / 偷营养 / 可助力</text>
      </view>
      <view v-for="f in friends" :key="f.id" class="friend-row">
        <view class="f-avatar">{{ (f.name || '?').slice(0, 1) }}</view>
        <view class="f-body">
          <text class="f-name">{{ f.name }}</text>
          <text class="yx-muted">{{ f.tip }}</text>
        </view>
        <button
          v-if="f.status === 'stealable'"
          class="yx-btn yx-btn-mint f-btn"
          :loading="busy"
          @click="onSteal(f)"
        >
          收 {{ f.energy }}
        </button>
        <button
          v-else-if="f.status === 'nutrition'"
          class="yx-btn yx-btn-mint f-btn"
          :loading="busy"
          @click="onStealNutrition(f)"
        >
          偷营养 {{ f.nutritionDrop }}
        </button>
        <button
          v-else-if="f.status === 'boost'"
          class="yx-btn yx-btn-ghost f-btn"
          :loading="busy"
          @click="onHelp(f)"
        >
          帮砍一下
        </button>
        <text v-else class="done-txt">已收完</text>
      </view>
      <view v-if="!friends.length" class="yx-muted empty">还没有好友 · 去邀请页喊人</view>
    </view>

    <view class="copy-tip yx-card">
      <text class="block-title">求助文案（好玩不乞讨）</text>
      <text class="copy">「帮我点一下，我差最后一口粮」</text>
      <button class="yx-btn yx-btn-ghost" open-type="share">分享给好友</button>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { onShow, onShareAppMessage } from '@dcloudio/uni-app'
import { session } from '../../store/session.js'
import { USE_REMOTE, getToken } from '../../api/request.js'
import { fetchFriends, apiSteal, apiHelp, apiStealNutrition } from '../../api/growth.js'
import { buildInvitePath, resolveShareMessage } from '../../utils/share.js'
import { applyRemoteJarState } from '../../store/jar.js'

const friends = ref([])
const stealsLeft = ref(3)
const helpsLeft = ref(3)
const busy = ref(false)

function apply(r) {
  if (!r) return
  friends.value = r.friends || []
  stealsLeft.value = r.stealsLeft != null ? r.stealsLeft : 3
  helpsLeft.value = r.helpsLeft != null ? r.helpsLeft : 3
  session.friends = friends.value
}

async function refresh() {
  if (!(USE_REMOTE && getToken())) {
    friends.value = session.friends || []
    return
  }
  try {
    apply(await fetchFriends())
  } catch (e) {
    console.warn('[friends]', e)
  }
}

onMounted(refresh)
onShow(refresh)

onShareAppMessage(() =>
  resolveShareMessage({
    title: '帮我点一下，我差最后一口粮',
    path: buildInvitePath({ channel: 'share_friends' }),
  })
)

async function onSteal(f) {
  if (busy.value) return
  busy.value = true
  try {
    const r = await apiSteal(f.id)
    apply(r)
    if (r.got) session.user.energy += r.got
    uni.showToast({ title: r.msg || '收取成功', icon: 'none' })
  } catch (e) {
    uni.showToast({ title: e.message || '失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

async function onStealNutrition(f) {
  if (busy.value) return
  busy.value = true
  try {
    const r = await apiStealNutrition(f.id)
    apply(r)
    if (r.state) applyRemoteJarState(r.state)
    uni.showToast({ title: r.msg || '偷到营养', icon: 'none' })
  } catch (e) {
    uni.showToast({ title: e.message || '失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

async function onHelp(f) {
  if (busy.value) return
  busy.value = true
  try {
    const r = await apiHelp(f.id)
    apply(r)
    uni.showToast({ title: r.msg || '已助力', icon: 'none' })
  } catch (e) {
    uni.showToast({ title: e.message || '失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}
</script>

<style scoped lang="scss">
.friends {
  padding: 24rpx 32rpx;
  background: linear-gradient(180deg, #f0fbf8 0%, #fff7f2 40%);
  min-height: 100vh;
}
.title {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
}
.sub {
  display: block;
  margin: 8rpx 0 24rpx;
  font-size: 24rpx;
  color: #5c574f;
}
.list,
.copy-tip {
  margin-bottom: 20rpx;
}
.block-head {
  margin-bottom: 12rpx;
}
.block-title {
  font-size: 28rpx;
  font-weight: 750;
}
.friend-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.05);
}
.f-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: #d8f3ef;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #1a9e92;
}
.f-body {
  flex: 1;
  min-width: 0;
}
.f-name {
  display: block;
  font-size: 28rpx;
  font-weight: 650;
}
.f-btn {
  flex-shrink: 0;
}
.done-txt {
  font-size: 22rpx;
  color: #9a948c;
}
.empty {
  padding: 24rpx 0;
}
.copy {
  display: block;
  margin: 12rpx 0 20rpx;
  font-size: 26rpx;
  color: #5c574f;
}
</style>

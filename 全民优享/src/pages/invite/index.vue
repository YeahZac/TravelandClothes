<template>
  <view class="yx-page invite yx-safe-bottom">
    <view class="hero yx-card">
      <text class="title">邀请有礼</text>
      <text class="sub">有效邀请需对方首签 · 奖励冻结 {{ freezeHours }} 小时</text>
      <view class="code-box">
        <text class="code-label">我的邀请码</text>
        <text class="code">{{ inviteCode }}</text>
      </view>
      <view class="frozen">冻结中：{{ frozenEnergy }} 能量</view>
      <view class="count">有效邀请 {{ validCount }} 人</view>
    </view>

    <view class="yx-card">
      <text class="block-title">邀请档位</text>
      <view v-for="t in tiers" :key="t.need" class="tier" :class="{ on: t.reached }">
        <text class="t-need">邀 {{ t.need }} 人</text>
        <text class="t-lab">{{ t.label || `${t.type}+${t.value}` }}</text>
        <text class="t-gap">{{ t.reached ? '已达成' : `还差 ${t.gap}` }}</text>
      </view>
    </view>

    <view v-if="holds.length" class="yx-card">
      <text class="block-title">奖励状态</text>
      <view v-for="h in holds" :key="h.id" class="hold">
        <text class="h-lab">{{ h.reward.label || h.reward.type }}</text>
        <text class="h-st">
          {{ h.status === 'frozen' ? `冻结中 · ${formatRemain(h.remainMs)}` : '已到账' }}
        </text>
      </view>
    </view>

    <NearMissSheet
      :visible="showNearMiss"
      kind="invite"
      @close="showNearMiss = false"
    />

    <button class="yx-btn yx-btn-orange share" open-type="share">喊好友搭把手</button>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { onShow, onShareAppMessage } from '@dcloudio/uni-app'
import NearMissSheet from '../../components/NearMissSheet.vue'
import { session } from '../../store/session.js'
import { USE_REMOTE, getToken } from '../../api/request.js'
import { fetchInviteSummary } from '../../api/growth.js'

const inviteCode = ref(session.user.inviteCode || '')
const freezeHours = ref(24)
const frozenEnergy = ref(0)
const validCount = ref(0)
const tiers = ref([])
const holds = ref([])
const showNearMiss = ref(false)

function formatRemain(ms) {
  if (!ms || ms <= 0) return '即将到账'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}小时${m}分` : `${m}分钟`
}

async function refresh() {
  if (!(USE_REMOTE && getToken())) return
  try {
    const s = await fetchInviteSummary()
    if (!s) return
    inviteCode.value = s.inviteCode || inviteCode.value
    freezeHours.value = s.freezeHours || 24
    frozenEnergy.value = s.frozenEnergy || 0
    validCount.value = s.validInviteCount || 0
    tiers.value = s.tiers || []
    holds.value = s.holds || []
    session.user.inviteCode = inviteCode.value
    session.user.frozenInviteReward = frozenEnergy.value
    if (s.missOne) showNearMiss.value = true
    if (s.justUnlocked && s.justUnlocked.unlocked && s.justUnlocked.unlocked.length) {
      uni.showToast({ title: '邀请奖励已到账', icon: 'none' })
    }
  } catch (e) {
    console.warn('[invite]', e)
  }
}

onMounted(refresh)
onShow(refresh)

onShareAppMessage(() => ({
  title: '帮我点一下，我差最后一口粮',
  path: `/pages/index/index?invite=${inviteCode.value}&channel=share_invite`,
}))
</script>

<style scoped lang="scss">
.invite {
  padding: 24rpx 32rpx;
}
.hero {
  margin-bottom: 20rpx;
}
.title {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
}
.sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #5c574f;
}
.code-box {
  margin-top: 28rpx;
  padding: 28rpx;
  border-radius: 20rpx;
  background: linear-gradient(135deg, #ff7a6b, #ff5c4a);
  color: #fff;
  text-align: center;
}
.code-label {
  display: block;
  font-size: 22rpx;
  opacity: 0.85;
}
.code {
  display: block;
  margin-top: 8rpx;
  font-size: 48rpx;
  font-weight: 800;
  letter-spacing: 6rpx;
}
.frozen,
.count {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #c97830;
  font-weight: 600;
}
.block-title {
  display: block;
  font-size: 28rpx;
  font-weight: 750;
  margin-bottom: 12rpx;
}
.tier,
.hold {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.05);
  font-size: 24rpx;
}
.tier.on .t-need {
  color: #1a9e92;
  font-weight: 700;
}
.share {
  margin-top: 32rpx;
  width: 100%;
}
</style>

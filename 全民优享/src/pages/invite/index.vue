<template>
  <view class="yx-page invite yx-safe-bottom">
    <view class="hero yx-card">
      <text class="title">{{ pageName }}</text>
      <text class="sub">有效邀请需对方首签 · 奖励冻结 {{ freezeHours }} 小时</text>
      <view class="code-box">
        <text class="code-label">我的邀请码</text>
        <text class="code">{{ inviteCode }}</text>
        <view class="code-actions">
          <text class="code-act" @click="copyCode">复制</text>
        </view>
      </view>
      <view class="frozen">冻结中：{{ frozenEnergy }} 能量</view>
      <view class="count">有效邀请 {{ validCount }} 人</view>
    </view>

    <view class="yx-card qr-card">
      <text class="block-title">专属邀请二维码</text>
      <text class="qr-hint">好友扫码打开小程序后登录，将绑定你为邀请人</text>
      <view class="qr-wrap">
        <image v-if="qrSrc" class="qr-img" :src="qrSrc" mode="aspectFit" show-menu-by-longpress />
        <view v-else class="qr-empty">
          <text class="qr-empty-txt">{{ qrLoading ? '生成中…' : qrErr || '暂无二维码' }}</text>
          <button v-if="!qrLoading && !qrSrc" class="yx-btn yx-btn-orange qr-retry" size="mini" @click="loadQr(true)">
            重新生成
          </button>
        </view>
      </view>
      <text class="qr-tip">长按可保存图片分享给好友</text>
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
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import NearMissSheet from '../../components/NearMissSheet.vue'
import { session } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { USE_REMOTE, getToken } from '../../api/request.js'
import { fetchInviteSummary, fetchInviteQrcode } from '../../api/growth.js'
import { usePageShare } from '../../utils/share.js'
import { resolveLinkEntryTitle, LINK_TITLE_FALLBACK } from '../../utils/entrySlots.js'
import { ensureLocalImage } from '../../utils/cloudImage.js'
import { requireAuth } from '../../utils/loginGate.js'

const pageName = computed(
  () => resolveLinkEntryTitle('invite', appConfig.pages) || LINK_TITLE_FALLBACK.invite || '邀好友'
)
const inviteCode = ref(session.user.inviteCode || '')
const freezeHours = ref(24)
const frozenEnergy = ref(0)
const validCount = ref(0)
const tiers = ref([])
const holds = ref([])
const showNearMiss = ref(false)
const qrSrc = ref('')
const qrLoading = ref(false)
const qrErr = ref('')

function formatRemain(ms) {
  if (!ms || ms <= 0) return '即将到账'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}小时${m}分` : `${m}分钟`
}

function copyCode() {
  const c = inviteCode.value
  if (!c) {
    uni.showToast({ title: '暂无邀请码', icon: 'none' })
    return
  }
  uni.setClipboardData({
    data: c,
    success: () => uni.showToast({ title: '已复制', icon: 'success' }),
  })
}

async function loadQr(force = false) {
  if (!(USE_REMOTE && getToken())) return
  qrLoading.value = true
  qrErr.value = ''
  try {
    const r = await fetchInviteQrcode(force)
    if (r && r.inviteCode) inviteCode.value = r.inviteCode
    const path = (r && (r.qrUrl || r.qrPath)) || ''
    if (!path) {
      qrErr.value = (r && r.msg) || '生成失败，请稍后重试'
      qrSrc.value = ''
      return
    }
    const local = await ensureLocalImage(path)
    qrSrc.value = local || path
    if (!qrSrc.value) qrErr.value = (r && r.msg) || '二维码加载失败'
  } catch (e) {
    qrErr.value = (e && e.message) || '生成失败'
    qrSrc.value = ''
  } finally {
    qrLoading.value = false
  }
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
    const unlocked = (s.justUnlocked && s.justUnlocked.unlocked) || []
    if (unlocked.length) {
      uni.showToast({ title: s.justUnlocked.msg || '邀请奖励已到账', icon: 'none' })
    }
  } catch (e) {
    console.warn('[invite]', e)
  }
  loadQr(false)
}

function applyNavTitle() {
  uni.setNavigationBarTitle({ title: pageName.value })
}

onMounted(() => {
  applyNavTitle()
  if (!requireAuth('/pages/invite/index')) return
  refresh()
})
onShow(() => {
  applyNavTitle()
  if (!(USE_REMOTE && getToken())) return
  refresh()
})

usePageShare({ channel: 'share_invite' })
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
.code-actions {
  margin-top: 16rpx;
}
.code-act {
  display: inline-block;
  padding: 8rpx 28rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.22);
  font-size: 22rpx;
  font-weight: 600;
}
.frozen,
.count {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #c97830;
  font-weight: 600;
}
.qr-card {
  margin-bottom: 20rpx;
  text-align: center;
}
.qr-hint {
  display: block;
  margin: 8rpx 0 20rpx;
  font-size: 22rpx;
  color: #8a948c;
  line-height: 1.45;
}
.qr-wrap {
  width: 360rpx;
  height: 360rpx;
  margin: 0 auto;
  border-radius: 24rpx;
  background: #f6f3ee;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.qr-img {
  width: 320rpx;
  height: 320rpx;
}
.qr-empty {
  padding: 24rpx;
}
.qr-empty-txt {
  display: block;
  font-size: 24rpx;
  color: #8a948c;
  margin-bottom: 16rpx;
}
.qr-retry {
  display: inline-block;
}
.qr-tip {
  display: block;
  margin-top: 16rpx;
  font-size: 20rpx;
  color: #a8a094;
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

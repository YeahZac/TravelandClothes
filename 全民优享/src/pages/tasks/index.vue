<template>
  <view class="yx-page tasks yx-safe-bottom">
    <view class="head yx-card">
      <view class="head-row">
        <view>
          <text class="h-title">今日任务</text>
          <text class="yx-muted">做完 1～3 个就够 · 低思考闭环</text>
        </view>
        <view class="progress-chip">
          <text class="pc-n">{{ doneCount }}/{{ taskList.length }}</text>
          <text class="pc-u">完成</text>
        </view>
      </view>

      <view class="steps-box">
        <view class="steps-left">
          <text class="steps-n">{{ stepsToday }}</text>
          <text class="yx-muted">{{ stepsHint }}</text>
        </view>
        <button class="yx-btn yx-btn-mint" size="mini" :loading="busy" @click="onSteps">
          {{ stepsCta }}
        </button>
      </view>

      <view class="tiers">
        <view
          v-for="tier in displayTiers"
          :key="tier.steps"
          class="tier"
          :class="{ on: tier.unlocked, claimed: tier.claimed }"
        >
          <text class="tier-n">{{ tier.steps / 1000 }}k</text>
          <text class="tier-r">+{{ tier.energy }}</text>
        </view>
      </view>
    </view>

    <view class="list yx-card">
      <TaskRow
        v-for="t in taskList"
        :key="t.id"
        :task="t"
        @action="onTask(t)"
      />
    </view>

    <view v-if="iaa.enabled" class="iaa yx-card">
      <text class="iaa-title">看广告补给</text>
      <text class="yx-muted">降激励现金成本 · 每日有上限</text>
      <view class="iaa-row">
        <button
          class="yx-btn yx-btn-orange"
          size="mini"
          :disabled="iaa.left.energy <= 0"
          :loading="busy"
          @click="onIaa('energy')"
        >
          能量 +{{ iaa.rewards.energy }}（剩{{ iaa.left.energy }}）
        </button>
        <button
          class="yx-btn yx-btn-blue"
          size="mini"
          :disabled="iaa.left.lottery <= 0"
          :loading="busy"
          @click="onIaa('lottery')"
        >
          能量值 +{{ lotteryAdEnergy }}（剩{{ iaa.left.lottery }}）
        </button>
        <button
          class="yx-btn"
          size="mini"
          :disabled="iaa.left.makeup_checkin <= 0 || iaa.checkedIn"
          :loading="busy"
          @click="onIaa('makeup_checkin')"
        >
          {{ iaa.checkedIn ? '已签到' : '补签' }}
        </button>
      </view>
    </view>

    <view class="tip yx-muted">
      步数需先签到再兑 · 防刷设备打穿（总纲 3.2）
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import TaskRow from '../../components/TaskRow.vue'
import { session, doCheckin } from '../../store/session.js'
import { USE_REMOTE, getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { requireAuth } from '../../utils/loginGate.js'
import {
  apiStepsSync,
  apiStepsClaim,
  fetchStepsStatus,
  fetchIaaStatus,
  apiIaaClaim,
  fetchTodayTasks,
  apiCompleteTask,
  apiRecordTaskAction,
} from '../../api/growth.js'
import { getWeRunPayload } from '../../utils/werun.js'
import { showRewardedAd } from '../../utils/rewardedAd.js'
import { appConfig } from '../../store/appConfig.js'
import { setPendingShare, buildInvitePath, usePageShare } from '../../utils/share.js'

usePageShare({ channel: 'share_task' })

const busy = ref(false)
const stepsState = reactive({
  steps: session.user.stepsToday || 0,
  source: '',
  claimableEnergy: 0,
  checkedIn: false,
  tiers: [],
})
const iaa = reactive({
  enabled: false,
  rewards: { energy: 30, lotteryChance: 1, makeupEnergy: 20 },
  left: { energy: 0, lottery: 0, makeup_checkin: 0 },
  checkedIn: false,
})
const lotteryAdEnergy = computed(() => {
  const eco =
    (appConfig.game && appConfig.game.economy) ||
    appConfig.economy ||
    { lotteryEnergyCost: 50 }
  const cost = Number(eco.lotteryEnergyCost) > 0 ? Number(eco.lotteryEnergyCost) : 50
  return Math.max(1, Number(iaa.rewards.lotteryChance) || 1) * cost
})

const defaultTiers = [
  { steps: 3000, energy: 30 },
  { steps: 6000, energy: 80 },
  { steps: 10000, energy: 120 },
]

const displayTiers = computed(() => {
  if (stepsState.tiers && stepsState.tiers.length) return stepsState.tiers
  const cfg = (appConfig.game && appConfig.game.steps && appConfig.game.steps.tiers) || defaultTiers
  return cfg.map((t) => ({
    ...t,
    unlocked: stepsState.steps >= t.steps,
    claimed: false,
  }))
})

const RETIRED = new Set(['checkin', 'steps', 'ad', 'mall', 'festival'])
function normalizeTaskAction(a) {
  const x = String(a || '').toLowerCase()
  if (x === 'browse' || x === 'mall') return 'browse_mall'
  if (x === 'festival') return 'browse_festival'
  return x
}
const remoteTasks = ref([])
const taskList = computed(() => {
  const src = remoteTasks.value.length ? remoteTasks.value : session.tasks || []
  return src.filter((t) => {
    const a = normalizeTaskAction(t.action || t.id)
    return !RETIRED.has(a) && !String(t.id || '').includes('step')
  })
})
const doneCount = computed(() => taskList.value.filter((t) => t.status === 'done').length)
const stepsToday = computed(() => stepsState.steps || session.user.stepsToday || 0)

const stepsHint = computed(() => {
  if (!stepsState.source) return '今日步数 · 点右侧同步运动步数'
  if (stepsState.source === 'werun') return '今日步数 · 已同步运动步数'
  if (stepsState.source.includes('mock') || stepsState.source === 'report') {
    return '今日步数 · 开发态模拟（真机走运动步数）'
  }
  return '今日步数 · 已同步'
})

const stepsCta = computed(() => {
  if (stepsState.claimableEnergy > 0) return `领 +${stepsState.claimableEnergy}`
  if (!stepsState.steps) return '去同步'
  return '已领完'
})

function toast(msg) {
  uni.showToast({ title: msg, icon: 'none' })
}

function applySteps(r) {
  if (!r) return
  stepsState.steps = r.steps || 0
  stepsState.source = r.source || stepsState.source
  stepsState.claimableEnergy = r.claimableEnergy || 0
  stepsState.checkedIn = !!r.checkedIn
  stepsState.tiers = r.tiers || []
  session.user.stepsToday = stepsState.steps
  if (r.wallet && r.wallet.energy != null) session.user.energy = r.wallet.energy
  const task = session.tasks.find((x) => x.id === 't_steps' || x.action === 'steps')
  if (task) {
    if (stepsState.claimableEnergy > 0) task.status = 'claim'
    else if (stepsState.steps > 0 && stepsState.tiers.every((t) => !t.unlocked || t.claimed)) {
      task.status = 'done'
    }
  }
}

function applyIaa(r) {
  if (!r) return
  iaa.enabled = !!r.enabled
  if (r.rewards) Object.assign(iaa.rewards, r.rewards)
  if (r.left) Object.assign(iaa.left, r.left)
  iaa.checkedIn = !!r.checkedIn
}

async function refresh() {
  if (!(USE_REMOTE && getToken())) return
  try {
    const [st, ia, tasks] = await Promise.all([
      fetchStepsStatus(),
      fetchIaaStatus(),
      fetchTodayTasks().catch(() => null),
    ])
    applySteps(st)
    applyIaa(ia)
    if (tasks && Array.isArray(tasks.list)) remoteTasks.value = tasks.list
  } catch (e) {
    console.warn('[tasks] refresh', e)
  }
}

onShow(() => {
  refresh()
})

async function onSteps() {
  if (busy.value) return
  busy.value = true
  try {
    if (USE_REMOTE && getToken() && isLoggedIn()) {
      if (stepsState.claimableEnergy > 0) {
        const r = await apiStepsClaim()
        applySteps(r)
        if (r.reward && r.reward.energy) session.user.energy += 0 // already on server; refresh wallet if returned
        toast(r.msg || '领取成功')
        await refresh()
        return
      }
      const wr = await getWeRunPayload()
      if (wr.needSetting) {
        toast(wr.msg || '请开启运动步数权限')
        return
      }
      const payload = wr.ok
        ? { encryptedData: wr.encryptedData, iv: wr.iv, steps: wr.steps }
        : { steps: wr.steps, source: wr.source || 'werun_mock' }
      const synced = await apiStepsSync(payload)
      applySteps(synced)
      if (synced.claimableEnergy > 0) {
        toast(`已同步 ${synced.steps} 步 · 可领 +${synced.claimableEnergy}`)
      } else if (!synced.checkedIn && synced.requireCheckin !== false) {
        toast('已同步 · 先签到再兑步数')
      } else {
        toast(`已同步 ${synced.steps} 步`)
      }
      return
    }
    // 本地降级
    session.user.stepsToday = Math.max(session.user.stepsToday || 0, 6200)
    stepsState.steps = session.user.stepsToday
    const task = session.tasks.find((x) => x.id === 't_steps')
    if (task && task.status !== 'done') task.status = 'claim'
    toast('本地模拟已同步 6200 步')
  } catch (e) {
    toast(e.message || '同步失败')
  } finally {
    busy.value = false
  }
}

async function onIaa(kind) {
  if (busy.value) return
  if (!requireAuth('/pages/tasks/index')) return
  busy.value = true
  try {
    const ad = await showRewardedAd()
    if (!ad.ok) {
      toast('需看完广告才能领奖')
      return
    }
    if (!USE_REMOTE) {
      if (kind === 'energy') session.user.energy += 30
      else if (kind === 'lottery') session.user.energy += lotteryAdEnergy.value
      else doCheckin()
      toast(ad.mock ? '模拟看完广告（本地）' : '已发奖')
      return
    }
    const r = await apiIaaClaim(kind)
    applyIaa(r)
    if (r.reward) {
      if (r.reward.energy) session.user.energy += r.reward.energy
    }
    if (kind === 'makeup_checkin') {
      session.checkin.todayDone = true
    }
    toast(r.msg || (ad.mock ? '模拟看完 · 已发奖' : '已发奖'))
  } catch (e) {
    toast(e.message || '发奖失败')
  } finally {
    busy.value = false
  }
}

async function onTask(t) {
  if (t.status === 'done' || busy.value) return
  const action = normalizeTaskAction(t.action || t.id)
  if (t.status === 'claim') {
    if (!requireAuth('/pages/tasks/index')) return
    busy.value = true
    try {
      const r = await apiCompleteTask(t.id)
      if (r && r.list) remoteTasks.value = r.list
      if (r && r.wallet && r.wallet.energy != null) session.user.energy = r.wallet.energy
      toast((r && r.msg) || '领取成功')
    } catch (e) {
      toast(e.message || '领取失败')
    } finally {
      busy.value = false
    }
    return
  }
  if (!requireAuth('/pages/tasks/index')) return
  if (action === 'invite') {
    uni.navigateTo({ url: '/pages/invite/index' })
    return
  }
  if (action === 'mall_pay' || action === 'mall_spend' || action === 'browse_mall') {
    uni.switchTab({ url: '/pages/mall/index' })
    toast(action === 'browse_mall' ? '浏览商城可累计进度' : '支付成功后返回领取')
    return
  }
  if (action === 'browse_festival') {
    uni.switchTab({ url: '/pages/festival/index' })
    toast('浏览活动页可累计进度')
    return
  }
  if (action === 'lottery') {
    uni.navigateTo({ url: '/pages/lottery/index' })
    toast('抽奖后返回领取')
    return
  }
  if (action === 'share') {
    setPendingShare({
      title: '每天走路也能领取小礼品了，快来看看吧（我已经领到了）',
      path: buildInvitePath({ channel: 'share_task' }),
    })
    try {
      await new Promise((resolve, reject) => {
        uni.showModal({
          title: '分享任务',
          content: '请点击右上角「…」分享给好友；分享后返回点「领取」',
          confirmText: '我已分享',
          success: (res) => (res.confirm ? resolve() : reject(new Error('已取消'))),
        })
      })
      const r = await apiRecordTaskAction('share')
      if (r && r.list) remoteTasks.value = r.list
      toast('已记分享，达标后可领取')
    } catch (_) {}
    return
  }
}
</script>

<style scoped lang="scss">
.tasks {
  padding: 24rpx 32rpx;
}

.head {
  margin-bottom: 20rpx;
}

.head-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.h-title {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
}

.progress-chip {
  text-align: right;
}

.pc-n {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
  color: #ff5c4a;
}

.pc-u {
  font-size: 20rpx;
  color: #9a948c;
}

.steps-box {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: rgba(46, 196, 182, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.steps-n {
  display: block;
  font-size: 44rpx;
  font-weight: 800;
  color: #1a9e92;
  font-variant-numeric: tabular-nums;
}

.tiers {
  display: flex;
  gap: 12rpx;
  margin-top: 20rpx;
}

.tier {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 16rpx;
  background: rgba(28, 26, 23, 0.04);
  opacity: 0.5;
}

.tier.on {
  opacity: 1;
  background: rgba(46, 196, 182, 0.16);
}

.tier.claimed {
  opacity: 0.7;
}

.tier-n {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
}

.tier-r {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: #1a9e92;
}

.list {
  margin-bottom: 20rpx;
}

.iaa {
  margin-bottom: 20rpx;
  padding: 24rpx;
}

.iaa-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  margin-bottom: 6rpx;
}

.iaa-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}

.tip {
  padding: 0 8rpx;
  line-height: 1.5;
}
</style>

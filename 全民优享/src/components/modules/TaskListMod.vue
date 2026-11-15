/* Hallmark · genre: playful · macrostructure: app-shell · theme: cream-rose · designed-as-app */
<template>
  <view class="wrap">
    <view class="head">
      <text class="title">{{ mod.title || '每日任务' }}</text>
      <text v-if="allLink" class="link" @click="openLink(allLink)">{{ allLabel }}</text>
      <text v-else class="mute">{{ done }}/{{ rows.length }}</text>
    </view>

    <view
      v-for="t in rows"
      :key="t.id"
      class="row"
      :class="{ pending: !t.__ok }"
      @click="onTask(t)"
    >
      <view class="ico-wrap" :class="t.__ok ? 'tone-' + toneFor(t) : 'tone-pending'">
        <CmsImage
          v-if="t.__ok && t.iconUrl"
          class="ico-img"
          :src="t.iconUrl"
          mode="aspectFit"
        />
        <VIcon v-else-if="t.__ok" :name="iconFor(t)" :size="44" :color="iconColor(t)" />
        <text v-else class="pending-mark">?</text>
      </view>
      <view class="body">
        <view class="tr">
          <text class="tn">{{ t.__ok ? t.title : '待配置' }}</text>
          <text v-if="t.__ok" class="rw">{{ t.reward }}</text>
        </view>
        <view class="sub">
          <text class="mute">{{ t.__ok ? t.desc || defaultDesc(t) : '运营后台配置后可完成' }}</text>
          <text v-if="t.__ok && t.progressText" class="mute yx-num">{{ t.progressText }}</text>
        </view>
      </view>
      <button
        v-if="t.__ok && t.status !== 'done'"
        class="act"
        :class="t.status === 'claim' ? 'claim' : 'todo'"
        :loading="busyId === t.id"
        @click.stop="onTask(t)"
      >
        {{ t.status === 'claim' ? '领取' : '去完成' }}
      </button>
      <text v-else-if="t.__ok" class="done-t">已完成</text>
      <text v-else class="done-t">待配置</text>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { session } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { openLink } from '../../utils/navigate.js'
import { isEntryConfigured, normalizeEntryList } from '../../utils/entrySlots.js'
import { USE_REMOTE, getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { apiCompleteTask, apiRecordTaskAction, fetchTodayTasks } from '../../api/growth.js'
import { requireAuth } from '../../utils/loginGate.js'
import { setPendingShare, buildInvitePath } from '../../utils/share.js'
import VIcon from '../VIcon.vue'
import CmsImage from '../CmsImage.vue'

const props = defineProps({ mod: Object })
const p = computed(() => props.mod.payload || {})
const allLink = computed(() => p.value.allLinkKey || '')
const allLabel = computed(() => p.value.allLabel || '全部')
const limit = computed(() => p.value.limit || 0)
const busyId = ref('')
/** 服务端今日进度：id → { status, progress, progressText, ... } */
const todayMap = ref({})

const RETIRED_ACTIONS = new Set(['checkin', 'steps', 'ad', 'mall', 'festival'])

function isRetiredTask(item) {
  const a = normalizeAction((item && (item.action || item.id)) || '')
  const id = String((item && item.id) || '').toLowerCase()
  return RETIRED_ACTIONS.has(a) || a.includes('step') || id.includes('step') || id === 'checkin' || id === 'ad'
}

function normalizeAction(action) {
  const a = String(action || '').toLowerCase()
  if (a === 'browse' || a === 'mall') return 'browse_mall'
  if (a === 'festival') return 'browse_festival'
  if (a === 'order' || a === 'pay') return 'mall_pay'
  if (a === 'spend' || a === 'mall_sale') return 'mall_spend'
  if (a === 'draw' || a === 'lottery_draw') return 'lottery'
  if (a.includes('step')) return 'steps'
  return a
}

function iconKeyFromAction(action) {
  const a = normalizeAction(action)
  if (a === 'mall_pay' || a === 'mall_spend' || a === 'browse_mall') return 'mall'
  if (a === 'browse_festival') return 'festival'
  if (a === 'invite' || a === 'share') return 'invite'
  if (a === 'lottery') return 'lottery'
  return 'lottery'
}

function defaultDesc(t) {
  const a = normalizeAction(t.action)
  if (a === 'mall_spend') return `今日实付达标 ${t.targetCount || 0} 分`
  if (t.targetCount > 1) return `今日目标 ${t.targetCount} 次`
  return ''
}

/** 后台 catalog.tasks + 模块图标 + 今日进度 */
const cfgItems = computed(() => {
  const payloadItems = Array.isArray(p.value.items) ? p.value.items : []
  const catalog =
    (appConfig.catalog && Array.isArray(appConfig.catalog.tasks) && appConfig.catalog.tasks) || []
  const source = catalog.length ? catalog : payloadItems
  const byId = {}
  payloadItems.forEach((it) => {
    if (it && it.id) byId[it.id] = it
  })
  return source.map((t) => {
    const extra = byId[t.id] || {}
    const live = todayMap.value[t.id] || {}
    return {
      ...extra,
      ...t,
      ...live,
      id: t.id,
      title: live.title || t.title || extra.title || '',
      desc: live.desc || extra.desc || t.desc || '',
      reward: live.reward || t.reward || extra.reward || '',
      action: t.action || extra.action || live.action || '',
      iconUrl: extra.iconUrl || t.iconUrl || '',
      iconKey: extra.iconKey || t.iconKey || iconKeyFromAction(t.action || extra.action),
      sortOrder: t.sortOrder != null ? t.sortOrder : extra.sortOrder,
      enabled: t.enabled !== false,
      targetCount: live.targetCount || t.targetCount || 1,
      progressText: live.progressText || '',
      status: live.status || (extra.status || 'todo'),
    }
  })
})

const rows = computed(() => {
  const mapped = normalizeEntryList(cfgItems.value)
    .filter((item) => !isRetiredTask(item))
    .map((item) => {
      const local = session.tasks.find((t) => t.id === item.id)
      const status = item.status || (local && local.status) || 'todo'
      const withIcon = {
        ...item,
        iconKey: item.iconKey || iconKeyFromAction(item.action),
        status,
      }
      return {
        ...withIcon,
        __ok: isEntryConfigured({ ...withIcon, name: withIcon.title }),
      }
    })
  return limit.value > 0 ? mapped.slice(0, limit.value) : mapped
})

const done = computed(() => rows.value.filter((t) => t.__ok && t.status === 'done').length)

function applyTodayPayload(data) {
  const map = {}
  ;(data && data.list ? data.list : []).forEach((t) => {
    if (!t || !t.id) return
    map[t.id] = {
      status: t.status || 'todo',
      progress: t.progress,
      targetCount: t.targetCount,
      progressText: t.progressText || `${t.progress || 0}/${t.targetCount || 1}`,
      reward: t.reward,
      desc: t.desc,
      title: t.title,
      action: t.action,
      rewardGiftId: t.rewardGiftId,
    }
    const local = session.tasks.find((x) => x.id === t.id)
    if (local) local.status = t.status || local.status
  })
  todayMap.value = map
}

async function refreshToday() {
  if (!(USE_REMOTE && getToken() && isLoggedIn())) return
  try {
    const data = await fetchTodayTasks()
    applyTodayPayload(data)
  } catch (e) {
    console.warn('[TaskListMod] today', e && e.message)
  }
}

function iconFor(t) {
  if (t.iconKey) return t.iconKey
  return iconKeyFromAction(t.action || t.id)
}
function toneFor(t) {
  const a = normalizeAction(t.action || t.id || '')
  if (a.includes('mall')) return 'gold'
  if (a.includes('festival')) return 'lavender'
  if (a === 'invite' || a === 'share') return 'sage'
  if (a === 'lottery') return 'lavender'
  return 'gold'
}
function iconColor(t) {
  const map = {
    gold: '#C9A36B',
    sage: '#7FA67A',
    lavender: '#9B8FBF',
    ink: '#6E6258',
  }
  return map[toneFor(t)] || '#6E6258'
}

function markLocalDone(taskId) {
  const local = session.tasks.find((x) => x.id === taskId)
  if (local) local.status = 'done'
  const cur = { ...(todayMap.value[taskId] || {}), status: 'done' }
  todayMap.value = { ...todayMap.value, [taskId]: cur }
}

function applyCompleteResult(r) {
  if (!r) return
  if (r.list) applyTodayPayload(r)
  if (r.wallet && r.wallet.energy != null) session.user.energy = r.wallet.energy
}

async function remoteComplete(taskId) {
  if (!(USE_REMOTE && getToken() && isLoggedIn())) return null
  try {
    const r = await apiCompleteTask(taskId)
    applyCompleteResult(r)
    return r
  } catch (e) {
    console.warn('[TaskListMod] complete', e && e.message)
    uni.showToast({ title: (e && e.message) || '领取失败', icon: 'none' })
    return null
  }
}

async function onClaim(t) {
  if (!requireAuth('/pages/energy/index')) return
  const r = await remoteComplete(t.id)
  if (r && r.ok !== false) {
    uni.showToast({ title: (r && r.msg) || '领取成功', icon: 'none' })
  }
}

async function onShareGuide(t) {
  if (!requireAuth('/pages/energy/index')) return
  setPendingShare({
    title: '帮我点一下，我差最后一口粮',
    path: buildInvitePath({ channel: 'share_task' }),
  })
  // #ifdef MP-WEIXIN
  try {
    await new Promise((resolve, reject) => {
      uni.showModal({
        title: '分享任务',
        content: '请点击右上角「…」分享给好友；分享后返回本页点「领取」',
        confirmText: '我已分享',
        success: (res) => (res.confirm ? resolve() : reject(new Error('已取消'))),
      })
    })
  } catch (e) {
    return
  }
  // #endif
  try {
    const r = await apiRecordTaskAction('share')
    if (r && r.list) applyTodayPayload(r)
  } catch (_) {}
  await refreshToday()
  uni.showToast({ title: '已记分享，达标后可领取', icon: 'none' })
}

async function onTask(t) {
  if (!t.__ok) {
    uni.showToast({ title: '待配置', icon: 'none' })
    return
  }
  if (t.status === 'done' || busyId.value) return
  if (t.path) return openLink(t)

  const action = normalizeAction(t.action || t.id)
  busyId.value = t.id
  try {
    if (t.status === 'claim') {
      await onClaim(t)
      return
    }
    if (!requireAuth('/pages/energy/index')) return
    if (action === 'invite') {
      openLink('invite')
      setTimeout(() => refreshToday(), 800)
      return
    }
    if (action === 'mall_pay' || action === 'mall_spend' || action === 'browse_mall') {
      openLink('mall')
      uni.showToast({
        title: action === 'browse_mall' ? '浏览商城可累计进度' : '支付成功后返回领取',
        icon: 'none',
      })
      setTimeout(() => refreshToday(), 1200)
      return
    }
    if (action === 'browse_festival') {
      openLink('festival')
      uni.showToast({ title: '浏览活动页可累计进度', icon: 'none' })
      setTimeout(() => refreshToday(), 1200)
      return
    }
    if (action === 'lottery') {
      uni.navigateTo({ url: '/pages/lottery/index' })
      uni.showToast({ title: '抽奖后返回领取', icon: 'none' })
      setTimeout(() => refreshToday(), 1200)
      return
    }
    if (action === 'share') {
      await onShareGuide(t)
      return
    }
    if (t.linkKey) openLink(t.linkKey)
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
  } finally {
    busyId.value = ''
  }
}

onMounted(refreshToday)
onShow(refreshToday)
</script>

<style scoped>
.wrap {
  background: var(--paper-2);
  border-radius: var(--radius-card);
  padding: var(--card-pad-y) var(--card-pad);
  box-shadow: var(--shadow);
  border: 1rpx solid var(--line-soft);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 16rpx;
}
.title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--ink);
}
.link {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--ink-2);
}
.mute {
  font-size: 22rpx;
  color: var(--ink-3);
}
.row {
  display: flex;
  align-items: center;
  gap: 24rpx;
  min-height: 132rpx;
  padding: 28rpx 0;
  border-bottom: 1rpx solid var(--line-soft);
}
.row:last-child {
  border-bottom: none;
  padding-bottom: 4rpx;
}
.ico-wrap {
  width: 88rpx;
  height: 88rpx;
  flex-shrink: 0;
  border-radius: var(--radius-icon);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ico-wrap.tone-gold {
  background: var(--gold-soft);
}
.ico-wrap.tone-amber {
  background: var(--gold-soft);
}
.ico-wrap.tone-sage {
  background: var(--sage-soft);
}
.ico-wrap.tone-lavender {
  background: var(--lavender-soft);
}
.ico-wrap.tone-pending {
  background: #e8e4de;
}
.ico-img {
  width: 56rpx;
  height: 56rpx;
}
.pending-mark {
  font-size: 32rpx;
  font-weight: 700;
  color: #a89b91;
}
.row.pending {
  opacity: 0.78;
}
.body {
  flex: 1;
  min-width: 0;
}
.tr {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  align-items: baseline;
}
.tn {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.3;
}
.rw {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--gold);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.sub {
  margin-top: 8rpx;
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
  align-items: baseline;
}
.act {
  flex-shrink: 0;
  width: 132rpx;
  height: 64rpx;
  margin: 0;
  padding: 0;
  border-radius: var(--radius-pill);
  font-size: 24rpx;
  font-weight: 600;
  line-height: 60rpx;
}
.act::after {
  border: none;
}
.act.todo {
  background: transparent;
  color: var(--ink);
  border: 2rpx solid var(--ink);
}
.act.claim {
  background: var(--accent);
  color: var(--ink-on-accent);
  border: none;
  line-height: 64rpx;
}
.act.claim:active {
  background: var(--accent-deep);
  transform: scale(0.98);
}
.done-t {
  flex-shrink: 0;
  font-size: 22rpx;
  color: var(--ink-3);
}
</style>

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
import { session, doCheckin, browseMallDone, visitFestivalDone } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { openLink } from '../../utils/navigate.js'
import { isEntryConfigured, normalizeEntryList } from '../../utils/entrySlots.js'
import { USE_REMOTE, getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { apiCheckin, apiCompleteTask, apiIaaClaim, fetchTodayTasks } from '../../api/growth.js'
import { showRewardedAd } from '../../utils/rewardedAd.js'
import { requireAuth } from '../../utils/loginGate.js'
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

function isStepsTask(item) {
  const a = String((item && (item.action || item.id)) || '').toLowerCase()
  return a === 'steps' || a.includes('step')
}

function iconKeyFromAction(action) {
  const a = String(action || '').toLowerCase()
  if (a.includes('check')) return 'coin'
  if (a.includes('mall') || a.includes('browse')) return 'mall'
  if (a.includes('festival')) return 'festival'
  if (a.includes('invite')) return 'invite'
  if (a.includes('ad')) return 'lottery'
  return 'lottery'
}

function defaultDesc(t) {
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
    .filter((item) => !isStepsTask(item))
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
  const a = t.action || t.id || ''
  if (a.includes('check')) return 'gold'
  if (a.includes('step')) return 'sage'
  if (a.includes('mall')) return 'gold'
  if (a.includes('festival')) return 'lavender'
  if (a.includes('invite')) return 'sage'
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

async function onCheckin(t) {
  if (!requireAuth('/pages/energy/index')) return
  if (USE_REMOTE) {
    try {
      const r = await apiCheckin()
      session.checkin.todayDone = true
      if (r && r.wallet) {
        if (r.wallet.energy != null) session.user.energy = r.wallet.energy
        if (r.wallet.lotteryChance != null) session.user.lotteryChance = r.wallet.lotteryChance
      }
      // 同步任务完成态（礼品等）
      await remoteComplete(t.id)
      await refreshToday()
      uni.showToast({ title: (r && r.msg) || '签到成功', icon: 'none' })
    } catch (e) {
      uni.showToast({ title: (e && e.message) || '签到失败', icon: 'none' })
    }
    return
  }
  const r = doCheckin()
  markLocalDone(t.id)
  uni.showToast({ title: (r && r.msg) || '签到成功', icon: 'none' })
}

async function onAd(t) {
  if (!requireAuth('/pages/energy/index')) return
  const ad = await showRewardedAd()
  if (!ad.ok) {
    uni.showToast({ title: '需看完广告才能领奖', icon: 'none' })
    return
  }
  if (USE_REMOTE && getToken() && isLoggedIn()) {
    try {
      await apiIaaClaim('energy')
    } catch (_) {}
    const r = await remoteComplete(t.id)
    uni.showToast({
      title: (r && r.msg) || (ad.mock ? '模拟看完 · 已发奖' : '已发奖'),
      icon: 'none',
    })
    return
  }
  session.user.energy = (session.user.energy || 0) + 30
  markLocalDone(t.id)
  uni.showToast({ title: ad.mock ? '模拟看完 · +30 能量' : '+30 能量', icon: 'none' })
}

async function onBrowseTask(t, kind) {
  if (!requireAuth('/pages/energy/index')) return
  if (kind === 'mall') {
    browseMallDone()
    openLink('mall')
  } else if (kind === 'festival') {
    visitFestivalDone()
    openLink('festival')
  }
  if (USE_REMOTE) {
    const r = await remoteComplete(t.id)
    if (r && r.ok !== false) markLocalDone(t.id)
  } else {
    markLocalDone(t.id)
  }
}

async function onClaim(t) {
  if (!requireAuth('/pages/energy/index')) return
  const r = await remoteComplete(t.id)
  if (r && r.ok !== false) {
    uni.showToast({ title: (r && r.msg) || '领取成功', icon: 'none' })
  }
}

async function onTask(t) {
  if (!t.__ok) {
    uni.showToast({ title: '待配置', icon: 'none' })
    return
  }
  if (t.status === 'done' || busyId.value) return
  if (t.path) return openLink(t)

  busyId.value = t.id
  try {
    if (t.status === 'claim') {
      await onClaim(t)
      return
    }
    if (t.action === 'checkin') {
      await onCheckin(t)
      return
    }
    if (t.action === 'steps') {
      openLink('home')
      return
    }
    if (t.action === 'mall') {
      await onBrowseTask(t, 'mall')
      return
    }
    if (t.action === 'festival') {
      await onBrowseTask(t, 'festival')
      return
    }
    if (t.action === 'invite') {
      if (!requireAuth('/pages/energy/index')) return
      openLink('invite')
      // 邀请进度由服务端按今日邀请数统计，返回后 onShow 刷新
      setTimeout(() => refreshToday(), 800)
      return
    }
    if (t.action === 'ad') {
      await onAd(t)
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

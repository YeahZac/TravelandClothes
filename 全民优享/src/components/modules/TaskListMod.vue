/* 每日任务：兑好礼列表风格 · 白卡灰底 · 大图无色底 */
<template>
  <view class="wrap">
    <view class="hero">
      <view class="ring-box">
        <view class="ring">
          <view class="ring-track" />
          <view class="ring-fill" :style="{ height: pct + '%' }" />
          <view class="ring-hole">
            <text class="ring-pct">{{ pctLabel }}</text>
          </view>
        </view>
      </view>
      <view class="hero-copy">
        <text class="hero-kicker">DAILY TASKS</text>
        <text class="hero-line">
          今日完成
          <text class="hero-em">{{ done }}/{{ rows.length }}</text>
        </text>
        <text class="hero-hint">每天 00:00 自动重置，可重新完成</text>
      </view>
      <text class="day-chip yx-num">{{ dayLabel }}</text>
    </view>

    <view class="head">
      <text class="title">{{ mod.title || '每日任务' }}</text>
      <text v-if="allLink" class="link" @click="openLink(allLink)">{{ allLabel }}</text>
    </view>

    <view
      v-for="t in rows"
      :key="t.id"
      class="card"
      :class="{ pending: !t.__ok, done: t.__ok && t.status === 'done' }"
      @click="onTask(t)"
    >
      <view class="cover">
        <CmsImage
          v-if="t.__ok && taskIconUrl(t)"
          class="cover-img"
          :class="{ energy: !t.rewardGiftId }"
          :src="taskIconUrl(t)"
          :mode="t.rewardGiftId ? 'aspectFill' : 'aspectFit'"
        />
        <view v-else-if="t.__ok" class="cover-fallback">
          <VIcon :name="iconFor(t)" :size="56" :color="iconColor(t)" />
        </view>
        <view v-else class="cover-fallback">
          <text class="pending-mark">?</text>
        </view>
      </view>
      <view class="body">
        <text class="tn">{{ t.__ok ? t.title : '待配置' }}</text>
        <text v-if="t.__ok && rewardGiftText(t)" class="gift-name">{{ rewardGiftText(t) }}</text>
        <text class="desc">{{
          t.__ok ? taskDescText(t) || '完成即可领取奖励' : '运营后台配置后可完成'
        }}</text>
        <view class="foot">
          <view class="foot-l">
            <text v-if="t.__ok && rewardEnergyText(t)" class="rw">{{ rewardEnergyText(t) }}</text>
            <text v-if="t.__ok && t.progressText" class="prog yx-num">进度 {{ t.progressText }}</text>
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
          <view v-else-if="t.__ok" class="done-pill">
            <text class="done-t">已完成</text>
          </view>
          <text v-else class="done-t">待配置</text>
        </view>
      </view>
    </view>

    <view v-if="!rows.length" class="empty">
      <text class="mute">暂无开启的每日任务</text>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
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
import { shanghaiDayKey, msUntilNextShanghaiMidnight } from '../../utils/dayKey.js'
import VIcon from '../VIcon.vue'
import CmsImage from '../CmsImage.vue'

const props = defineProps({ mod: Object })
const p = computed(() => props.mod.payload || {})
const allLink = computed(() => p.value.allLinkKey || '')
const allLabel = computed(() => p.value.allLabel || '全部')
const limit = computed(() => p.value.limit || 0)
const busyId = ref('')
/** 服务端今日列表（真源，与后台 task_def status=on 对齐） */
const todayList = ref([])
const serverDayKey = ref('')
const localDayKey = ref(shanghaiDayKey())
let midnightTimer = null

const RETIRED_ACTIONS = new Set(['checkin', 'ad', 'mall', 'festival'])

function isRetiredTask(item) {
  const a = normalizeAction((item && (item.action || item.id)) || '')
  const id = String((item && item.id) || '').toLowerCase()
  return RETIRED_ACTIONS.has(a) || id === 'checkin' || id === 'ad'
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
  if (a === 'steps') return 'steps'
  return 'lottery'
}

function defaultDesc(t) {
  const a = normalizeAction(t.action)
  if (a === 'mall_spend') return `今日实付达标 ${t.targetCount || 0} 分`
  if (t.targetCount > 1) return `今日目标 ${t.targetCount} 次`
  return ''
}

/** 奖励拆行：能量 / 好物 / 说明，避免标题被长奖励挤成竖排 */
function rewardEnergyText(t) {
  if (!t) return ''
  if (Number(t.rewardEnergy) > 0) return `能量 +${Number(t.rewardEnergy)}`
  if (Number(t.rewardCoins) > 0) return `金币 +${Number(t.rewardCoins)}`
  const raw = String(t.reward || '')
  const m = raw.match(/能量\s*\+?\s*(\d+)/) || raw.match(/(\d+)\s*能量/)
  if (m) return `能量 +${m[1]}`
  if (/^[能量金币+\d\s·.]+$/.test(raw) && raw.trim()) return raw.trim()
  return ''
}

function rewardGiftText(t) {
  if (!t) return ''
  if (t.rewardGiftName) return String(t.rewardGiftName)
  const raw = String(t.reward || '')
  const parts = raw.split(/[·•|｜]/).map((s) => s.trim()).filter(Boolean)
  const gift = parts.find((p) => !/能量|金币|\+\d+/.test(p))
  return gift || ''
}

function taskDescText(t) {
  const d = String((t && (t.desc || defaultDesc(t))) || '').trim()
  if (!d) return ''
  // 后台常把整段奖励文案塞进 desc，与上面奖励行重复时去掉
  const gift = rewardGiftText(t)
  const energy = rewardEnergyText(t)
  if (gift && d === gift) return defaultDesc(t) || ''
  if (energy && d === energy) return defaultDesc(t) || ''
  if (t.reward && d === String(t.reward).trim()) return defaultDesc(t) || ''
  return d
}

/** 配置侧图标/文案补丁（catalog + 模块 payload） */
function iconPatchMap() {
  const byId = {}
  const catalog =
    (appConfig.catalog && Array.isArray(appConfig.catalog.tasks) && appConfig.catalog.tasks) || []
  const payloadItems = Array.isArray(p.value.items) ? p.value.items : []
  ;[...catalog, ...payloadItems].forEach((it) => {
    if (it && it.id) byId[it.id] = { ...(byId[it.id] || {}), ...it }
  })
  return byId
}

/** 未登录 / 无远端时：仅展示已发布且非下线类型 */
const cfgFallback = computed(() => {
  const payloadItems = Array.isArray(p.value.items) ? p.value.items : []
  const catalog =
    (appConfig.catalog && Array.isArray(appConfig.catalog.tasks) && appConfig.catalog.tasks) || []
  const source = catalog.length ? catalog : payloadItems
  const byId = {}
  payloadItems.forEach((it) => {
    if (it && it.id) byId[it.id] = it
  })
  return source
    .filter((t) => t && t.enabled !== false && !isRetiredTask(t))
    .map((t) => {
      const extra = byId[t.id] || {}
      return {
        ...extra,
        ...t,
        id: t.id,
        title: t.title || extra.title || '',
        desc: extra.desc || t.desc || '',
        reward: t.reward || extra.reward || '',
        action: t.action || extra.action || '',
        iconUrl: extra.iconUrl || t.iconUrl || '',
        iconKey: extra.iconKey || t.iconKey || iconKeyFromAction(t.action || extra.action),
        rewardEnergy: t.rewardEnergy != null ? t.rewardEnergy : extra.rewardEnergy,
        rewardCoins: t.rewardCoins != null ? t.rewardCoins : extra.rewardCoins,
        rewardGiftId: t.rewardGiftId || extra.rewardGiftId || '',
        rewardGiftName: t.rewardGiftName || extra.rewardGiftName || '',
        rewardGiftImageUrl: t.rewardGiftImageUrl || extra.rewardGiftImageUrl || '',
        targetCount: t.targetCount || 1,
        progressText: `0/${t.targetCount || 1}`,
        status: 'todo',
      }
    })
})

const rows = computed(() => {
  const patches = iconPatchMap()
  let source = []
  if (USE_REMOTE && todayList.value.length) {
    // 远端真源：与后台「自定义任务 status=on」一致
    source = todayList.value.filter((t) => t && !isRetiredTask(t))
  } else {
    source = cfgFallback.value
  }
  const mapped = normalizeEntryList(source).map((item) => {
    const extra = patches[item.id] || {}
    const withIcon = {
      ...extra,
      ...item,
      id: item.id,
      title: item.title || extra.title || '',
      desc: item.desc || extra.desc || '',
      reward: item.reward || extra.reward || '',
      action: item.action || extra.action || '',
      iconUrl: extra.iconUrl || item.iconUrl || '',
      iconKey: extra.iconKey || item.iconKey || iconKeyFromAction(item.action || extra.action),
      rewardEnergy: item.rewardEnergy != null ? item.rewardEnergy : extra.rewardEnergy,
      rewardCoins: item.rewardCoins != null ? item.rewardCoins : extra.rewardCoins,
      rewardGiftId: item.rewardGiftId || extra.rewardGiftId || '',
      rewardGiftName: item.rewardGiftName || extra.rewardGiftName || '',
      rewardGiftImageUrl: item.rewardGiftImageUrl || extra.rewardGiftImageUrl || '',
      status: item.status || 'todo',
      progressText: item.progressText || `${item.progress || 0}/${item.targetCount || 1}`,
      targetCount: item.targetCount || extra.targetCount || 1,
    }
    return {
      ...withIcon,
      __ok: isEntryConfigured({ ...withIcon, name: withIcon.title }),
    }
  })
  return limit.value > 0 ? mapped.slice(0, limit.value) : mapped
})

const done = computed(() => rows.value.filter((t) => t.__ok && t.status === 'done').length)
const pct = computed(() => {
  const n = rows.value.length
  if (!n) return 0
  return Math.round((done.value / n) * 100)
})
const pctLabel = computed(() => `${pct.value}%`)
const dayLabel = computed(() => {
  const dk = serverDayKey.value || localDayKey.value
  return dk ? dk.slice(5) : ''
})

function resetLocalTaskStatusForNewDay() {
  if (Array.isArray(session.tasks)) {
    session.tasks.forEach((t) => {
      if (t) t.status = 'todo'
    })
  }
  todayList.value = []
}

function applyTodayPayload(data) {
  const dk = (data && data.dayKey) || shanghaiDayKey()
  if (serverDayKey.value && serverDayKey.value !== dk) {
    resetLocalTaskStatusForNewDay()
  }
  serverDayKey.value = dk
  localDayKey.value = shanghaiDayKey()
  const list = (data && data.list) || []
  todayList.value = list
  list.forEach((t) => {
    if (!t || !t.id) return
    const local = session.tasks.find((x) => x.id === t.id)
    if (local) local.status = t.status || local.status
  })
}

async function refreshToday() {
  const today = shanghaiDayKey()
  if (localDayKey.value && localDayKey.value !== today) {
    resetLocalTaskStatusForNewDay()
    localDayKey.value = today
  }
  if (!(USE_REMOTE && getToken() && isLoggedIn())) {
    todayList.value = []
    return
  }
  try {
    const data = await fetchTodayTasks()
    applyTodayPayload(data)
  } catch (e) {
    console.warn('[TaskListMod] today', e && e.message)
  }
}

function scheduleMidnightRefresh() {
  if (midnightTimer) clearTimeout(midnightTimer)
  const wait = msUntilNextShanghaiMidnight()
  midnightTimer = setTimeout(async () => {
    resetLocalTaskStatusForNewDay()
    localDayKey.value = shanghaiDayKey()
    await refreshToday()
    scheduleMidnightRefresh()
  }, wait + 500)
}

function defaultEnergyIconUrl() {
  const assets = appConfig.assets || {}
  const icons = (appConfig.catalog && appConfig.catalog.icons) || {}
  return (
    assets.coin ||
    assets.energy ||
    icons.coin ||
    icons.energy ||
    '/static/ui/ico-coin.jpg'
  )
}

function giftImageFromCatalog(giftId) {
  const id = String(giftId || '')
  if (!id) return ''
  const gifts = (appConfig.catalog && appConfig.catalog.gifts) || []
  const products = (appConfig.catalog && appConfig.catalog.products) || []
  const hit =
    gifts.find((g) => String(g.id) === id) || products.find((p) => String(p.id) === id)
  return (hit && (hit.imageUrl || hit.coverUrl || hit.thumbUrl || hit.iconUrl)) || ''
}

/** 左侧图标：有礼物奖励 → 礼物图；否则 → 默认能量图标 */
function taskIconUrl(t) {
  if (!t || !t.__ok) return ''
  const giftId = t.rewardGiftId || ''
  if (giftId) {
    return (
      t.rewardGiftImageUrl ||
      giftImageFromCatalog(giftId) ||
      t.iconUrl ||
      ''
    )
  }
  // 纯能量/金币奖励
  if (Number(t.rewardEnergy) > 0 || Number(t.rewardCoins) > 0 || /能量|金币/.test(String(t.reward || ''))) {
    return defaultEnergyIconUrl()
  }
  return t.iconUrl || defaultEnergyIconUrl()
}

function iconFor(t) {
  if (t.rewardGiftId) return 'gift'
  if (Number(t.rewardEnergy) > 0 || Number(t.rewardCoins) > 0) return 'coin'
  if (t.iconKey) return t.iconKey
  return iconKeyFromAction(t.action || t.id)
}
function toneFor(t) {
  if (t.rewardGiftId) return 'sage'
  if (Number(t.rewardEnergy) > 0 || Number(t.rewardCoins) > 0) return 'gold'
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
    if (action === 'steps') {
      uni.navigateTo({ url: '/pages/steps/exchange' })
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

onMounted(() => {
  refreshToday()
  scheduleMidnightRefresh()
})
onShow(() => {
  refreshToday()
})
onUnmounted(() => {
  if (midnightTimer) clearTimeout(midnightTimer)
})
</script>

<style scoped>
.wrap {
  background: #f6f7fb;
  border-radius: 28rpx;
  padding: 20rpx 20rpx 8rpx;
}
.hero {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 16rpx;
  padding: 24rpx 22rpx;
  background: #fff;
  border-radius: 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(17, 24, 39, 0.05);
}
.ring-box {
  flex-shrink: 0;
}
.ring {
  position: relative;
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  overflow: hidden;
  background: #f3f4f6;
}
.ring-track {
  position: absolute;
  inset: 0;
  background: #e5e7eb;
  opacity: 0.7;
}
.ring-fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, #fb7185 0%, #e11d48 100%);
  transition: height 0.35s ease;
}
.ring-hole {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 78rpx;
  height: 78rpx;
  margin-left: -39rpx;
  margin-top: -39rpx;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}
.ring-pct {
  font-size: 26rpx;
  font-weight: 800;
  color: #e11d48;
  font-variant-numeric: tabular-nums;
}
.hero-copy {
  flex: 1;
  min-width: 0;
}
.hero-kicker {
  display: block;
  font-size: 18rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
  color: #9f1239;
  margin-bottom: 6rpx;
}
.hero-line {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #111827;
  line-height: 1.35;
}
.hero-em {
  font-weight: 800;
  color: #e11d48;
}
.hero-hint {
  display: block;
  margin-top: 6rpx;
  font-size: 20rpx;
  color: #6b7280;
}
.day-chip {
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #9ca3af;
  font-weight: 600;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 8rpx 4rpx 14rpx;
}
.title {
  font-size: 32rpx;
  font-weight: 800;
  color: #111827;
}
.link {
  font-size: 22rpx;
  font-weight: 600;
  color: #6b7280;
}
.mute {
  font-size: 22rpx;
  color: #9ca3af;
}
.card {
  display: flex;
  gap: 20rpx;
  margin-bottom: 16rpx;
  padding: 18rpx;
  background: #fff;
  border-radius: 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(17, 24, 39, 0.05);
}
.card.done {
  opacity: 0.92;
}
.card.pending {
  opacity: 0.78;
}
.cover {
  width: 180rpx;
  height: 180rpx;
  border-radius: 16rpx;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cover-img {
  width: 100%;
  height: 100%;
  display: block;
  background: transparent;
}
.cover-img.energy {
  width: 120rpx;
  height: 120rpx;
}
.cover :deep(.cms-img),
.cover :deep(.cms-ph) {
  background: transparent !important;
}
.cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}
.pending-mark {
  font-size: 40rpx;
  font-weight: 700;
  color: #9ca3af;
}
.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.tn {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #111827;
  line-height: 1.35;
  word-break: keep-all;
}
.gift-name {
  display: block;
  margin-top: 8rpx;
  font-size: 28rpx;
  font-weight: 800;
  color: #e11d48;
  line-height: 1.35;
  word-break: break-word;
}
.desc {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #6b7280;
  line-height: 1.4;
  word-break: break-word;
}
.foot {
  margin-top: auto;
  padding-top: 16rpx;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12rpx;
}
.foot-l {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.rw {
  font-size: 28rpx;
  font-weight: 800;
  color: #e11d48;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.prog {
  font-size: 20rpx;
  color: #9ca3af;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.act {
  flex-shrink: 0;
  min-width: 148rpx;
  height: 64rpx;
  margin: 0;
  padding: 0 22rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 64rpx;
}
.act::after {
  border: none;
}
.act.todo {
  background: #111827;
  color: #fff;
  border: none;
}
.act.claim {
  background: #e11d48;
  color: #fff;
  border: none;
}
.act.claim:active,
.act.todo:active {
  transform: scale(0.98);
  opacity: 0.92;
}
.done-pill {
  flex-shrink: 0;
  min-width: 120rpx;
  height: 56rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
}
.done-t {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #9ca3af;
  font-weight: 600;
}
.empty {
  padding: 48rpx 0 40rpx;
  text-align: center;
}
</style>

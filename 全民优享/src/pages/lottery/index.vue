<template>
  <view class="yx-page lottery yx-safe-bottom">
    <view class="hero">
      <text class="kicker">全民优享</text>
      <text class="title">{{ pageName }}</text>
      <text class="sub">转盘开奖 · 中奖可兑实物</text>
      <view class="stat">
        <view class="stat-pill">
          <text class="stat-l">能量</text>
          <view class="bal-wrap">
            <text class="stat-n">{{ energyBal }}</text>
            <EnergyDeltaFx />
          </view>
        </view>
        <view class="stat-pill mute-pill">
          <text class="stat-l">单次</text>
          <text class="stat-n sm">{{ lotteryEnergyCost }}</text>
        </view>
        <view class="stat-pill mute-pill">
          <text class="stat-l">今日剩</text>
          <text class="stat-n sm">{{ todayLeftLabel }}</text>
        </view>
      </view>
    </view>

    <view class="stage">
      <view class="stage-glow" />
      <view class="wheel-wrap" :class="{ spinning, pulse: hubPulse }">
        <view class="rim">
          <view
            v-for="i in 16"
            :key="'lt-' + i"
            class="bead"
            :class="{ on: spinning && beadOn(i) }"
            :style="beadStyle(i)"
          />
        </view>

        <view
          class="wheel"
          :style="{
            transform: `rotate(${rotate}deg)`,
            transition: 'none',
            background: discGradient,
          }"
        >
          <view class="wheel-inner-ring" />
          <view v-for="(p, i) in pool" :key="p.id" class="slice-lab" :style="prizeStyle(i)">
            <CmsImage
              class="prize-ico"
              :src="p.imageUrl || ''"
              mode="aspectFill"
              placeholder="/static/ui/ico-gift.jpg"
              :show-placeholder="true"
            />
            <text class="prize-lab">{{ shortName(p.name) }}</text>
          </view>
        </view>

        <view class="hub">
          <view class="pointer" />
          <button class="spin-btn" :class="{ busy: spinning }" :disabled="spinning" @click="onSpin">
            <text class="spin-t">{{ spinning ? '开奖中' : '抽奖' }}</text>
          </button>
        </view>
      </view>
    </view>

    <view class="card">
      <text class="block-title">规则说明</text>
      <view v-for="(line, idx) in ruleLines" :key="'r-' + idx" class="rule-line">
        <text class="bullet">·</text>
        <text class="rule-t">{{ line }}</text>
      </view>
      <view v-if="!ruleLines.length" class="empty">规则加载中…</view>
      <view class="rule-links">
        <text class="hint-link" @click="goEnergyRules">能量值规则 ›</text>
        <text class="hint-link" @click="goLegalDoc('tos')">用户服务协议 ›</text>
        <text class="hint-link" @click="goMineRecords">中奖与兑换 ›</text>
      </view>
      <ShareEntry compact />
    </view>

    <LotteryWinModal
      :show="winShow"
      :name="winPrize.name"
      :image-url="winPrize.imageUrl"
      :can-redeem="!!(winPrize.claimToken && winPrize.productId)"
      @close="winShow = false"
      @redeem="onWinRedeem"
    />
    <GameFeedbackModal
      v-model:show="loseShow"
      title="未中奖"
      message="很遗憾，大奖与您擦肩而过"
      sub-message="请再接再厉！"
      primary-text="再抽一次"
      variant="lose"
      @primary="onSpin"
    />
    <LoginSheet />
  </view>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { usePageShare } from '../../utils/share.js'
import { lotteryPool as mockPool } from '../../mock/data.js'
import { session, spinLottery } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { request, USE_REMOTE, actionId, getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { goLogin } from '../../utils/loginGate.js'
import {
  assertLoginThenEnergy,
  currentEnergy,
  polishEnergyError,
  promptEnergyShort,
} from '../../utils/energyGate.js'
import { applyWalletEnergy, flashEnergyDelta } from '../../utils/energyFx.js'
import { resolveLinkEntryTitle, LINK_TITLE_FALLBACK } from '../../utils/entrySlots.js'
import CmsImage from '../../components/CmsImage.vue'
import EnergyDeltaFx from '../../components/EnergyDeltaFx.vue'
import LotteryWinModal from '../../components/LotteryWinModal.vue'
import GameFeedbackModal from '../../components/GameFeedbackModal.vue'
import LoginSheet from '../../components/LoginSheet.vue'
import ShareEntry from '../../components/ShareEntry.vue'
import { ENERGY_RULE_LINES, goEnergyRules, goLegalDoc } from '../../utils/energyRulesCopy.js'
import { safeShowToast } from '../../utils/safeUi.js'

const SLICE_A = '#1f2a44'
const SLICE_B = '#2d3b5c'
const SLICE_C = '#243552'

const pageName = computed(
  () => resolveLinkEntryTitle('lottery', appConfig.pages) || LINK_TITLE_FALLBACK.lottery || '幸运抽奖'
)

usePageShare({ channel: 'share_lottery' })

const pool = computed(() => {
  const remote =
    (appConfig.catalog && appConfig.catalog.lottery) ||
    (appConfig.game && appConfig.game.lottery) ||
    []
  const list = remote.length
    ? remote
        .filter((p) => p.status !== 'off')
        .map((p) => {
          const product = p.product || null
          const name = (product && product.name) || p.name
          const prizeType = p.prizeType || p.prize_type
          const raw = (product && product.imageUrl) || p.imageUrl || p.image_url || ''
          return {
            id: p.id,
            name,
            imageUrl: localPrizeIcon(raw, prizeType, name),
            productId: p.productId || p.product_id || (product && product.productId) || '',
            prizeType,
          }
        })
    : mockPool.map((p) => ({
        id: p.id,
        name: p.name,
        imageUrl: localPrizeIcon(p.imageUrl || '', p.prizeType, p.name),
        productId: p.productId || '',
        prizeType: p.prizeType,
      }))
  return list
})

/** 云上缺失的默认 ICON 回退本地 static，避免 COS 404 刷屏 */
function localPrizeIcon(url, prizeType, name) {
  const u = String(url || '')
  const broken = !u || /\/uploads\/ico-|ico-lottery|ico-coin|qmyx\/ico-lottery|qmyx\/ico-coin/.test(u)
  if (!broken) {
    if (u.startsWith('/static/') || /^https?:\/\//.test(u) || u.startsWith('/api/') || u.includes('media/file')) {
      return u
    }
    return u
  }
  const t = String(prizeType || '')
  if (t === 'energy' || t === 'coin' || t === 'points') return '/static/ui/ico-coin.jpg'
  if (t === 'empty' || /谢谢|未中|参与/.test(String(name || ''))) return '/static/ui/ico-lottery.png'
  return '/static/ui/ico-gift.jpg'
}

const WHEEL_R = 292
const LABEL_R = 188

const rotate = ref(0)
const spinning = ref(false)
const hubPulse = ref(false)
const winShow = ref(false)
const loseShow = ref(false)
const winPrize = ref({ name: '', imageUrl: '', productId: '', claimToken: '', prizeType: '' })
const ruleLines = ref([])
const beadTick = ref(0)
const todayUsed = ref(null)
const todayLeft = ref(null)
let pendingResult = null
let beadTimer = null
let spinRaf = null
let beadIntervalMs = 90

const energyBal = computed(
  () => Number(session.user.energy != null ? session.user.energy : session.user.points) || 0
)

const lotteryEnergyCost = computed(() => {
  const rules = appConfig.lotteryRules || {}
  if (Number(rules.energyCost) > 0) return Number(rules.energyCost)
  const eco = (appConfig.game && appConfig.game.economy) || appConfig.economy || {}
  return Number(eco.lotteryEnergyCost) > 0 ? Number(eco.lotteryEnergyCost) : 50
})

const lotteryDailyLimit = computed(() => {
  const rules = appConfig.lotteryRules || {}
  if (Number(rules.dailyLimit) > 0) return Number(rules.dailyLimit)
  if (appConfig.risk && Number(appConfig.risk.perUserDailyLotteryLimit) > 0) {
    return Number(appConfig.risk.perUserDailyLotteryLimit)
  }
  return 15
})

const todayLeftLabel = computed(() => {
  const lim = lotteryDailyLimit.value
  if (todayLeft.value == null) return `${lim}`
  return `${todayLeft.value}/${lim}`
})

function applyQuota(data) {
  if (!data) return
  if (data.todayUsed != null) todayUsed.value = Number(data.todayUsed)
  if (data.todayLeft != null) todayLeft.value = Number(data.todayLeft)
  if (data.dailyLimit != null && appConfig.lotteryRules) {
    appConfig.lotteryRules.dailyLimit = Number(data.dailyLimit)
  }
}

const discGradient = computed(() => {
  const n = Math.max(1, pool.value.length)
  const palette = [SLICE_A, SLICE_B, SLICE_C, SLICE_B]
  const parts = []
  for (let i = 0; i < n; i++) {
    const c = palette[i % palette.length]
    const a0 = (i / n) * 360
    const a1 = ((i + 1) / n) * 360
    parts.push(`${c} ${a0}deg ${a1}deg`)
  }
  return `conic-gradient(from -90deg, ${parts.join(',')})`
})

function shortName(name) {
  const s = String(name || '').trim()
  if (!s) return '奖'
  return s.slice(0, 6)
}

function beadStyle(i) {
  const deg = ((i - 1) / 16) * 360
  return { transform: `rotate(${deg}deg) translateY(-${WHEEL_R}rpx)` }
}

function beadOn(i) {
  return ((beadTick.value + i) % 4) < 2
}

function prizeStyle(i) {
  const n = pool.value.length || 1
  const mid = -90 + (i + 0.5) * (360 / n)
  const radius = n <= 6 ? LABEL_R : n <= 10 ? LABEL_R + 10 : LABEL_R + 20
  return {
    transform: `rotate(${mid}deg) translateY(-${radius}rpx) rotate(${-mid}deg)`,
  }
}

function startBeadChase() {
  stopBeadChase()
  beadIntervalMs = 90
  const tick = () => {
    beadTick.value = (beadTick.value + 1) % 16
    beadTimer = setTimeout(tick, beadIntervalMs)
  }
  beadTimer = setTimeout(tick, beadIntervalMs)
}

function stopBeadChase() {
  if (beadTimer) {
    clearTimeout(beadTimer)
    beadTimer = null
  }
}

function stopSpinRaf() {
  if (spinRaf != null) {
    clearTimeout(spinRaf)
    spinRaf = null
  }
}

/** 多段悬念：加速 → 高速匀速 → 长减速贴目标 */
function animateWheelTo(targetDeg, { duration = 4800 } = {}) {
  return new Promise((resolve) => {
    stopSpinRaf()
    const start = rotate.value
    const delta = targetDeg - start
    const t0 = Date.now()
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / duration)
      let e
      if (t < 0.15) {
        const u = t / 0.15
        e = 0.18 * u * u
      } else if (t < 0.55) {
        const u = (t - 0.15) / 0.4
        e = 0.18 + 0.42 * u
      } else {
        const u = (t - 0.55) / 0.45
        const ease = 1 - Math.pow(1 - u, 3)
        e = 0.6 + 0.4 * ease
      }
      rotate.value = start + delta * e
      // 灯珠节奏随进度：高速密、减速稀
      if (t < 0.55) beadIntervalMs = 45
      else if (t < 0.85) beadIntervalMs = 80
      else beadIntervalMs = 140
      if (t >= 1) {
        rotate.value = targetDeg
        spinRaf = null
        hubPulse.value = true
        setTimeout(() => {
          hubPulse.value = false
        }, 320)
        resolve()
        return
      }
      spinRaf = setTimeout(step, 16)
    }
    step()
  })
}

function withEnergyRuleLines(lines) {
  const base = Array.isArray(lines) ? lines.map((x) => String(x || '').trim()).filter(Boolean) : []
  const has = base.some((l) => /营销积分|不得提现|不是虚拟货币|兑换现金/.test(l))
  if (!has) base.push(...ENERGY_RULE_LINES)
  return base
}

function defaultRules() {
  return withEnergyRuleLines([
    `每次抽奖消耗 ${lotteryEnergyCost.value} 能量值`,
    `每人每日最多抽奖 ${lotteryDailyLimit.value} 次`,
    '完成签到、日常任务可获得能量值，用于继续抽奖',
    '抽奖结果可在「我的 → 中奖与兑换」查看与兑奖',
    '实物中奖后请尽快填写收货地址兑奖',
  ])
}

function isPublicSafeLines(lines) {
  if (!Array.isArray(lines) || !lines.length) return false
  // 旧接口曾把运营参数拼进文案；云端未重部署前本地拦截，避免泄露
  const leak = /谢谢参与基础占比|真中奖概率|日中奖名额|今日已中|防作弊|新注册满|软保底|硬保底|峰顶/
  return !lines.some((l) => leak.test(String(l || '')))
}

async function loadRules() {
  const fromBoot = appConfig.lotteryRules || (appConfig.config && appConfig.config.lotteryRules)
  if (fromBoot) {
    applyQuota(fromBoot)
    if (isPublicSafeLines(fromBoot.lines)) ruleLines.value = withEnergyRuleLines(fromBoot.lines)
  }
  if (USE_REMOTE) {
    try {
      const data = await request('/api/traffic/v1/lottery/rules')
      if (data) {
        applyQuota(data)
        const lines = isPublicSafeLines(data.lines) ? withEnergyRuleLines(data.lines) : []
        appConfig.lotteryRules = {
          ...(appConfig.lotteryRules || {}),
          energyCost: data.energyCost,
          dailyLimit: data.dailyLimit,
          allowPhysical: data.allowPhysical,
          todayUsed: data.todayUsed,
          todayLeft: data.todayLeft,
          lines,
        }
        if (lines.length) {
          ruleLines.value = lines
          return
        }
      }
    } catch (_) {}
  }
  if (!ruleLines.value.length) ruleLines.value = defaultRules()
}

function applyNavTitle() {
  uni.setNavigationBarTitle({ title: pageName.value })
}

let rulesLoadedAt = 0
onMounted(() => {
  applyNavTitle()
  loadRules().finally(() => {
    rulesLoadedAt = Date.now()
  })
})
onShow(() => {
  applyNavTitle()
  // 从兑奖页返回时别每次都打 /lottery/rules；30s 内用缓存，减轻 DB 压力
  if (Date.now() - rulesLoadedAt < 30000 && ruleLines.value.length) return
  loadRules().finally(() => {
    rulesLoadedAt = Date.now()
  })
})
onUnmounted(() => {
  stopBeadChase()
  stopSpinRaf()
})

function ensureLogin() {
  if (USE_REMOTE && !(getToken() && isLoggedIn())) {
    safeShowToast({ title: '请先登录后再抽奖', icon: 'none' })
    setTimeout(() => goLogin('/pages/lottery/index'), 400)
    return false
  }
  return true
}

function indexForPrize(prize) {
  if (!prize) return 0
  const list = pool.value
  let idx = list.findIndex((p) => String(p.id) === String(prize.id))
  if (idx >= 0) return idx
  idx = list.findIndex((p) => p.prizeType === 'empty' || /谢谢|未中|参与/.test(p.name || ''))
  if (idx >= 0 && (prize.prizeType === 'empty' || !prize.prizeType)) return idx
  idx = list.findIndex((p) => p.name === prize.name)
  return idx >= 0 ? idx : 0
}

function targetRotate(index) {
  const n = pool.value.length || 1
  const per = 360 / n
  const mid = -90 + (index + 0.5) * per
  const base = ((rotate.value % 360) + 360) % 360
  const need = (((-mid - base) % 360) + 360) % 360
  const loops = 6 + Math.floor(Math.random() * 2)
  return rotate.value + loops * 360 + need
}

function resolvePrizeImage(prize) {
  if (prize && prize.imageUrl) return prize.imageUrl
  const hit = pool.value.find((p) => String(p.id) === String(prize && prize.id))
  return (hit && hit.imageUrl) || ''
}

function isWin(prize) {
  if (!prize) return false
  return prize.prizeType && prize.prizeType !== 'empty'
}

function goClaim(h) {
  if (!ensureLogin()) return
  const token = encodeURIComponent(h.claimToken || '')
  const pid = encodeURIComponent(h.productId || '')
  uni.navigateTo({
    url: `/pages/order/confirm?type=lottery&productId=${pid}&claimToken=${token}&entryFrom=lottery`,
  })
}

function goMineRecords() {
  uni.navigateTo({ url: '/pages/mine/records?tab=wins' })
}

function onWinRedeem() {
  winShow.value = false
  const p = winPrize.value
  if (p.claimToken && p.productId) {
    goClaim(p)
    return
  }
  if (p.productId) {
    uni.navigateTo({
      url: `/pages/gift/detail?id=${encodeURIComponent(p.productId)}&from=lottery`,
    })
  }
}

function showResult(r) {
  const prize = (r && r.prize) || {}
  if (isWin(prize)) {
    winPrize.value = {
      name: prize.name || '奖品',
      imageUrl: resolvePrizeImage(prize),
      productId: prize.productId || '',
      claimToken: r.claimToken || '',
      prizeType: prize.prizeType || '',
    }
    winShow.value = true
    return
  }
  loseShow.value = true
}

async function onSpin() {
  if (spinning.value) return

  // 本地余额秒开闸门；服务端开奖仍会校验能量，响应带回最新钱包
  const gate = await assertLoginThenEnergy({
    need: lotteryEnergyCost.value,
    redirectPath: '/pages/lottery/index',
    action: '抽奖',
    loginToast: '请先登录后再抽奖',
    preferLocal: true,
  })
  if (!gate.ok) return

  loseShow.value = false
  winShow.value = false
  pendingResult = null

  if (todayLeft.value != null && todayLeft.value <= 0) {
    safeShowToast({ title: '今日抽奖次数已用完', icon: 'none' })
    return
  }

  const energyBefore = currentEnergy()
  spinning.value = true
  startBeadChase()
  await nextTick()

  // 先空转制造悬念，同时请求开奖
  const teaseTarget = rotate.value + 360 * 3 + Math.random() * 120
  const teasePromise = animateWheelTo(teaseTarget, { duration: 1600 })

  let r
  let apiErr = ''
  try {
    if (USE_REMOTE) {
      const data = await request('/api/traffic/v1/lottery/draw', {
        method: 'POST',
        data: { actionId: actionId('lottery') },
        timeout: 15000,
      })
      applyQuota(data)
      if (data.wallet && data.wallet.energy != null) {
        applyWalletEnergy(data.wallet.energy)
        if (data.wallet.points != null) session.user.points = data.wallet.points
        session.user.lotteryChance = 0
        session.user.coins = 0
      } else {
        const prizeVal =
          data.prize && (data.prize.prizeType === 'energy' || data.prize.prizeType === 'coin')
            ? Number(data.prize.prizeValue || 0)
            : 0
        const next = Math.max(0, energyBefore - lotteryEnergyCost.value + prizeVal)
        applyWalletEnergy(next)
      }
      const prize = data.prize || {}
      session.lotteryHistory.unshift({
        id: data.drawId || `r_${Date.now()}`,
        name: prize.name || '奖品',
        time: new Date().toLocaleString(),
        prizeType: prize.prizeType,
        claimToken: data.claimToken || '',
        productId: prize.productId || '',
      })
      r = { ok: true, prize, claimToken: data.claimToken || '' }
    } else {
      const local = spinLottery(lotteryEnergyCost.value)
      flashEnergyDelta(energyBal.value - energyBefore)
      r = local
    }
  } catch (e) {
    apiErr = polishEnergyError((e && e.message) || '抽奖失败', {
      action: '抽奖',
      need: lotteryEnergyCost.value,
    })
    r = null
  }

  await teasePromise

  if (r && r.ok) {
    const idx = indexForPrize(r.prize)
    const finalDeg = targetRotate(idx)
    await animateWheelTo(finalDeg, { duration: 4200 })
    spinning.value = false
    stopBeadChase()
    showResult(r)
    return
  }

  // 失败：短减速停住，不弹未中奖
  await animateWheelTo(rotate.value + 180, { duration: 900 })
  spinning.value = false
  stopBeadChase()
  const failMsg = apiErr || (r && r.msg) || '抽奖失败'
  if (/能量/.test(failMsg)) {
    await promptEnergyShort({
      need: lotteryEnergyCost.value,
      bal: currentEnergy(),
      action: '抽奖',
    })
    return
  }
  safeShowToast({ title: failMsg, icon: 'none' })
}
</script>

<style scoped lang="scss">
.lottery {
  min-height: 100vh;
  padding: 28rpx 28rpx 56rpx;
  color: #f8fafc;
  background:
    radial-gradient(ellipse 90% 55% at 50% -10%, rgba(251, 191, 36, 0.18), transparent 55%),
    radial-gradient(ellipse 70% 45% at 100% 30%, rgba(14, 165, 233, 0.12), transparent 50%),
    linear-gradient(180deg, #0b1220 0%, #111827 48%, #0f172a 100%);
}

.hero .kicker {
  display: block;
  font-size: 22rpx;
  letter-spacing: 0.18em;
  color: #fbbf24;
  font-weight: 700;
}
.hero .title {
  display: block;
  margin-top: 8rpx;
  font-size: 48rpx;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #fff7ed;
}
.hero .sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: rgba(226, 232, 240, 0.72);
}
.stat {
  margin-top: 22rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.stat-pill {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 12rpx 18rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.08);
  border: 1rpx solid rgba(251, 191, 36, 0.28);
}
.mute-pill {
  border-color: rgba(148, 163, 184, 0.25);
}
.stat-l {
  font-size: 20rpx;
  color: #94a3b8;
}
.bal-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.stat-n {
  font-size: 30rpx;
  font-weight: 800;
  color: #fbbf24;
}
.stat-n.sm {
  font-size: 26rpx;
  color: #e2e8f0;
}

.stage {
  position: relative;
  margin: 12rpx auto 8rpx;
  width: 680rpx;
  height: 680rpx;
}
.stage-glow {
  position: absolute;
  inset: 48rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(251, 191, 36, 0.22), transparent 68%);
  filter: blur(8rpx);
  pointer-events: none;
}
.wheel-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}
.rim {
  position: absolute;
  inset: 18rpx;
  border-radius: 50%;
  border: 18rpx solid #c2410c;
  box-shadow:
    0 18rpx 40rpx rgba(0, 0, 0, 0.35),
    inset 0 0 0 4rpx rgba(255, 237, 213, 0.35);
  background: linear-gradient(145deg, #9a3412, #ea580c 45%, #9a3412);
  z-index: 1;
  pointer-events: none;
}
.bead {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 14rpx;
  height: 14rpx;
  margin: -7rpx 0 0 -7rpx;
  border-radius: 50%;
  background: rgba(255, 237, 213, 0.35);
  box-shadow: none;
  transition: background 0.08s linear, box-shadow 0.08s linear;
}
.bead.on {
  background: #fff7ed;
  box-shadow: 0 0 12rpx #fbbf24;
}
.wheel {
  position: absolute;
  left: 48rpx;
  top: 48rpx;
  width: 584rpx;
  height: 584rpx;
  border-radius: 50%;
  overflow: hidden;
  z-index: 2;
  box-shadow: inset 0 0 0 3rpx rgba(255, 255, 255, 0.08);
}
.wheel-inner-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow: inset 0 0 0 10rpx rgba(15, 23, 42, 0.35);
  pointer-events: none;
  z-index: 1;
}
.slice-lab {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 150rpx;
  margin-left: -75rpx;
  margin-top: -78rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  z-index: 3;
}
.prize-ico {
  width: 68rpx;
  height: 68rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.95);
  overflow: hidden;
  box-shadow: 0 6rpx 14rpx rgba(0, 0, 0, 0.28);
}
.prize-lab {
  font-size: 20rpx;
  font-weight: 800;
  color: #fde68a;
  text-align: center;
  line-height: 1.2;
  max-width: 140rpx;
  text-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.45);
}
.hub {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 168rpx;
  height: 168rpx;
  margin: -84rpx 0 0 -84rpx;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pointer {
  position: absolute;
  top: -22rpx;
  left: 50%;
  margin-left: -18rpx;
  width: 0;
  height: 0;
  border-left: 18rpx solid transparent;
  border-right: 18rpx solid transparent;
  border-bottom: 34rpx solid #fbbf24;
  filter: drop-shadow(0 4rpx 6rpx rgba(0, 0, 0, 0.35));
  z-index: 6;
}
.spin-btn {
  width: 156rpx;
  height: 156rpx;
  margin: 0;
  padding: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff7ed, #fbbf24 55%, #d97706);
  border: 6rpx solid #fff7ed;
  box-shadow:
    0 10rpx 24rpx rgba(217, 119, 6, 0.45),
    inset 0 -8rpx 16rpx rgba(146, 64, 14, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.28s ease;
}
.spin-btn::after {
  border: none;
}
.spin-btn.busy,
.spin-btn.busy,
.spin-btn.is-disabled {
  opacity: 0.92;
}
.spin-t {
  color: #7c2d12;
  font-size: 34rpx;
  font-weight: 900;
  letter-spacing: 0.08em;
}
.wheel-wrap.pulse .spin-btn {
  transform: scale(1.06);
}
.wheel-wrap.spinning .spin-btn {
  transform: scale(0.96);
}

.card {
  margin-top: 8rpx;
  padding: 28rpx 24rpx 22rpx;
  border-radius: 28rpx;
  background: rgba(15, 23, 42, 0.72);
  border: 1rpx solid rgba(148, 163, 184, 0.16);
  backdrop-filter: blur(8px);
}
.block-title {
  display: block;
  margin-bottom: 14rpx;
  font-size: 28rpx;
  font-weight: 800;
  color: #f8fafc;
}
.rule-line {
  display: flex;
  gap: 10rpx;
  margin-bottom: 12rpx;
}
.bullet {
  color: #fbbf24;
  font-weight: 800;
  flex-shrink: 0;
}
.rule-t {
  flex: 1;
  font-size: 24rpx;
  color: rgba(226, 232, 240, 0.82);
  line-height: 1.55;
}
.rule-links {
  margin-top: 10rpx;
  padding-top: 14rpx;
  border-top: 1rpx solid rgba(148, 163, 184, 0.16);
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.hint-link {
  display: block;
  font-size: 24rpx;
  color: #fbbf24;
  font-weight: 700;
}
.empty {
  padding: 8rpx 0;
  font-size: 22rpx;
  color: #94a3b8;
}
</style>

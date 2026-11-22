<template>
  <view>
  <view class="page" v-if="!ready">
    <view class="skel card">
      <view class="skel-line w60" />
      <view class="skel-line w90" />
    </view>
    <view class="skel card goods-skel">
      <view class="skel-cover" />
      <view class="skel-body">
        <view class="skel-line w80" />
        <view class="skel-line w50" />
        <view class="skel-line w40" />
      </view>
    </view>
    <view class="skel card">
      <view class="skel-line w70" />
      <view class="skel-line w55" />
    </view>
    <text class="skel-tip">{{ loadTip }}</text>
  </view>
  <view class="page" v-else>
    <view class="card addr" @click="pickAddress">
      <view v-if="addr">
        <view class="row1">
          <text class="name">{{ addr.name }}</text>
          <text class="phone">{{ addr.phone }}</text>
        </view>
        <text class="full">{{ addr.full || addr.detail }}</text>
      </view>
      <view v-else class="addr-empty">
        <text class="ae">请选择收货地址</text>
      </view>
      <text class="chev">›</text>
    </view>

    <view v-if="cartLines.length" class="card goods-multi">
      <view v-for="it in cartLines" :key="it.id" class="multi-row">
        <CmsImage class="cover-sm" :src="it.imageUrl" mode="aspectFit" placeholder="/static/ui/ico-gift.jpg" />
        <view class="gbody">
          <text class="gname">{{ it.name }}</text>
          <text class="gsub">×{{ it.qty }} · ¥{{ ((it.payCashCent != null ? it.payCashCent : it.price * 100) * it.qty / 100).toFixed(1) }}</text>
        </view>
      </view>
    </view>
    <view v-else class="card goods">
      <CmsImage class="cover" :src="product.imageUrl" mode="aspectFit" placeholder="/static/ui/ico-gift.jpg" />
      <view class="gbody">
        <text class="gname">{{ product.name }}</text>
        <text class="gsub">{{ typeLabel }} · 数量 ×{{ qty }}</text>
        <PriceMix :item="priceItem" :qty="qty" size="md" />
        <view class="stepper" v-if="orderType === 'mall' && !cartLines.length">
          <text class="sp" @click="qty = Math.max(1, qty - 1)">－</text>
          <text class="n">{{ qty }}</text>
          <text class="sp" @click="qty = Math.min(99, qty + 1)">＋</text>
        </view>
      </view>
    </view>

    <view class="card bill">
      <view class="line" v-if="mix.showList">
        <text>划线原价</text>
        <text class="strike">¥{{ mix.listPriceYuan.toFixed(mix.listPriceYuan % 1 ? 2 : 0) }}</text>
      </view>
      <view class="line" v-if="mix.payPoints">
        <text>能量值支付</text>
        <text class="em">{{ mix.payPoints }} 能量值</text>
      </view>
      <view class="line" v-if="mix.payCashCent">
        <text>在线支付</text>
        <text class="em">¥{{ (mix.payCashCent / 100).toFixed(1) }}</text>
      </view>
      <view class="line" v-if="!mix.payPoints && !mix.payCashCent">
        <text>应付</text>
        <text class="em">0元</text>
      </view>
      <view class="line tip"><text>履约</text><text>待发货</text></view>
      <view v-if="mix.payMode === 'mix'" class="mix-note">组合支付：先扣能量值，再拉起在线支付补差价</view>
      <view v-if="mix.payPoints" class="energy-rule" @click="goEnergyRules">
        能量值为营销积分，不可提现/转赠/兑红包 · 查看规则 ›
      </view>
    </view>

    <view class="dock">
      <view class="dock-l">
        <text class="pay">{{ dockPay }}</text>
        <text class="mute">{{ submitHint }}</text>
      </view>
      <button class="cta" :loading="submitting" @click="submit">{{ submitLabel }}</button>
    </view>

    <GameFeedbackModal
      v-model:show="failShow"
      :title="failTitle"
      :message="failMessage"
      :sub-message="failSub"
      primary-text="我知道了"
      variant="fail"
    />
  </view>
  <LoginSheet />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { appConfig } from '../../store/appConfig.js'
import { session } from '../../store/session.js'
import { addressState, loadAddresses, defaultAddress } from '../../store/address.js'
import { placeOrder, payOrder } from '../../store/order.js'
import { cart } from '../../store/cart.js'
import { gifts as mockGifts, mallGoods as mockMall } from '../../mock/data.js'
import { fetchGifts, fetchOffer } from '../../api/commerce.js'
import { redeemStage } from '../../store/jar.js'
import { request, USE_REMOTE, actionId, getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { goLogin, currentPagePath } from '../../utils/loginGate.js'
import { resolvePayMix } from '../../utils/payMix.js'
import { assertLoginThenEnergy, polishEnergyError } from '../../utils/energyGate.js'
import { goEnergyRules } from '../../utils/energyRulesCopy.js'
import CmsImage from '../../components/CmsImage.vue'
import PriceMix from '../../components/PriceMix.vue'
import GameFeedbackModal from '../../components/GameFeedbackModal.vue'
import LoginSheet from '../../components/LoginSheet.vue'
import { usePageShare } from '../../utils/share.js'
usePageShare({ channel: 'share_home' })

const ready = ref(false)
const loadTip = ref('正在加载订单…')
const failShow = ref(false)
const failMessage = ref('')
const failTitle = ref('下单失败')
const failSub = ref('请检查地址与能量值后重试')
const orderType = ref('mall')
const productId = ref('')
const claimToken = ref('')
const entryFrom = ref('')
const qty = ref(1)
const fromCart = ref(false)
const cartCheckout = ref(false)
const cartLines = ref([])
const product = ref({})
const giftMeta = ref(null)
const addr = ref(null)
const submitting = ref(false)
/** 准点等渠道覆盖兑价（query 传入） */
const payOverride = ref(null)

const typeLabel = computed(() => {
  if (orderType.value === 'lottery') {
    return entryFrom.value === 'checkin'
      ? '签到实物'
      : entryFrom.value === 'steps'
        ? '步数实物'
        : '抽奖实物'
  }
  return (
    {
      mall: '商城购买',
      gift: '兑好礼',
      jar: '能量罐兑礼',
    }[orderType.value] || '兑换'
  )
})

const mix = computed(() => {
  // 中奖/签到凭证兑奖：应付一律 0 元，不展示渠道标价
  if (orderType.value === 'lottery' || claimToken.value) {
    return resolvePayMix({ payPoints: 0, payCashCent: 0, listPriceCent: 0, payLabel: '0元' })
  }
  if (cartLines.value.length) {
    const payPoints = cartLines.value.reduce((s, i) => s + Number(i.payPoints || 0) * i.qty, 0)
    const payCashCent = cartLines.value.reduce((s, i) => {
      const unit =
        i.payCashCent != null ? Number(i.payCashCent) : Math.round(Number(i.price || 0) * 100)
      return s + unit * i.qty
    }, 0)
    return resolvePayMix({ payPoints, payCashCent, listPriceCent: payCashCent }, { qty: 1 })
  }
  const base = product.value || giftMeta.value || {}
  const ov = payOverride.value
  if (ov && (ov.payPoints > 0 || ov.payCashCent > 0 || ov.force)) {
    return resolvePayMix(
      {
        ...base,
        payPoints: ov.payPoints,
        payCashCent: ov.payCashCent,
        costPoints: ov.payPoints,
        needCash: ov.payCashCent,
      },
      { qty: qty.value }
    )
  }
  return resolvePayMix(base, { qty: qty.value })
})

/** 凭证兑奖：价格条也显示 0 元，避免把渠道标价当成应付 */
const priceItem = computed(() => {
  if (orderType.value === 'lottery' || claimToken.value) {
    return {
      ...(product.value || {}),
      payPoints: 0,
      payCashCent: 0,
      costPoints: 0,
      needCash: 0,
      listPriceCent: 0,
      payLabel: '0元',
      payMode: 'free',
    }
  }
  return product.value
})

const dockPay = computed(() => {
  if (!mix.value.payPoints && !mix.value.payCashCent) return '0元领'
  return mix.value.label
})
const willPayCash = computed(() => mix.value.payCashCent > 0)
const submitLabel = computed(() => {
  if (mix.value.payMode === 'mix') return '能量值+在线支付'
  if (willPayCash.value) return '在线支付'
  if (orderType.value === 'mall') return '确认购买'
  return orderType.value === 'lottery' ? '确认领取' : '确认兑换'
})
const submitHint = computed(() =>
  willPayCash.value ? '先扣能量值，再调起在线支付补差价' : '提交后生成待发货订单'
)

onLoad(async (q) => {
  orderType.value = q.type || 'mall'
  productId.value = q.productId || q.id || ''
  claimToken.value = q.claimToken || ''
  entryFrom.value = String(q.entryFrom || q.from || q.channel || '').trim()
  qty.value = Math.max(1, Number(q.qty || 1))
  fromCart.value = q.fromCart === '1'
  cartCheckout.value = q.cartCheckout === '1'
  if (q.payPoints != null || q.payCashCent != null) {
    payOverride.value = {
      payPoints: Math.max(0, Number(q.payPoints) || 0),
      payCashCent: Math.max(0, Number(q.payCashCent) || 0),
      force: true,
    }
  }
  loadTip.value = '正在加载商品…'
  const boot = async () => {
    if (cartCheckout.value && orderType.value === 'mall') {
      cartLines.value = (cart.items || []).map((i) => ({ ...i }))
      if (!cartLines.value.length) {
        product.value = { id: '', name: '购物车为空', price: 0, imageUrl: '' }
      } else {
        product.value = {
          id: 'cart',
          name: `${cartLines.value[0].name} 等${cartLines.value.length}件`,
          price: 0,
          imageUrl: cartLines.value[0].imageUrl,
        }
      }
    } else {
      // 先用本地 catalog 秒开，再后台补全远程详情
      await resolveProduct({ localOnly: true })
      ready.value = true
      loadTip.value = '同步商品详情…'
      await resolveProduct({ localOnly: false })
    }
    loadTip.value = '加载收货地址…'
    await loadAddresses()
    addr.value = defaultAddress()
    ready.value = true
  }
  // 最长 8s 必须出界面，避免一直白屏
  await Promise.race([
    boot(),
    new Promise((resolve) =>
      setTimeout(() => {
        if (!ready.value) {
          if (!product.value || !product.value.name) {
            product.value = {
              id: productId.value,
              name: '商品加载较慢，可下拉重试',
              price: 0,
              imageUrl: '',
            }
          }
          ready.value = true
        }
        resolve()
      }, 8000)
    ),
  ])
})

onShow(async () => {
  const picked = uni.getStorageSync('qmyx_picked_address_id')
  if (picked) {
    if (!addressState.list.length) await loadAddresses()
    const a = addressState.list.find((x) => String(x.id) === String(picked))
    if (a) addr.value = a
    uni.removeStorageSync('qmyx_picked_address_id')
  } else if (!addr.value) {
    addr.value = defaultAddress()
  }
})

function mapOfferToProduct(hit) {
  if (!hit) return null
  return {
    id: hit.id || hit.productId,
    name: hit.name,
    imageUrl: hit.imageUrl || '',
    costPoints: hit.costPoints != null ? hit.costPoints : hit.payPoints,
    payPoints: hit.payPoints != null ? hit.payPoints : hit.costPoints,
    needCash: hit.needCash != null ? hit.needCash : hit.payCashCent,
    payCashCent: hit.payCashCent != null ? hit.payCashCent : hit.needCash,
    listPriceCent: hit.listPriceCent,
    listPriceYuan: hit.listPriceYuan,
    payMode: hit.payMode,
    payLabel: hit.payLabel || hit.priceText,
  }
}

async function resolveProduct({ localOnly = false } = {}) {
  const id = productId.value
  const catalog = appConfig.catalog || {}
  const gifts = catalog.gifts || []
  const products = catalog.products || []
  const sid = String(id || '')
  const isMall = orderType.value === 'mall'
  // 商城优先 products；兑礼/罐兑/抽奖优先 gifts
  let hit = isMall
    ? products.find((p) => String(p.id) === sid) ||
      mockMall.find((p) => String(p.id) === sid) ||
      gifts.find((g) => String(g.id) === sid)
    : gifts.find((g) => String(g.id) === sid) ||
      products.find((p) => String(p.id) === sid) ||
      mockGifts.find((g) => String(g.id) === sid)

  if (!hit && !localOnly && USE_REMOTE && id && !isMall) {
    try {
      const data = await fetchGifts()
      hit = (data.list || []).find((g) => String(g.id) === sid)
    } catch (e) {}
  }
  // 商城/兑礼：即使本地 catalog 有货，也要拉渠道报价，避免缺 payPoints 被当成纯现金跳过能量闸门
  const needRemoteOffer =
    !localOnly &&
    USE_REMOTE &&
    id &&
    (isMall ||
      !hit ||
      (hit.payPoints == null && hit.costPoints == null && hit.payCashCent == null && hit.needCash == null))
  if (needRemoteOffer) {
    try {
      const path = isMall
        ? `/api/traffic/v1/offers/${encodeURIComponent(id)}?channel=mall`
        : `/api/traffic/v1/offers/${encodeURIComponent(id)}`
      const data = await request(path, { timeout: 8000 })
      const o = data && data.offer
      if (o && o.found !== false && (o.found === true || (o.name && o.name !== o.id))) {
        hit = o
      }
    } catch (e) {
      try {
        const data = await fetchOffer(id)
        const o = data && data.offer
        if (o && o.found !== false) hit = o
      } catch (_) {}
    }
  }
  if (!hit) {
    if (localOnly) return
    product.value = {
      id,
      name: id ? (isMall ? '商品不存在或已下架' : '礼品不存在或已下架') : '商品',
      price: 0,
      pointsOff: 0,
      imageUrl: '',
    }
    giftMeta.value = null
    return
  }
  giftMeta.value = hit
  product.value = mapOfferToProduct(hit)
  if (hit.price != null) product.value.price = hit.price
  productId.value = hit.id || hit.productId || id
}

function pickAddress() {
  uni.navigateTo({ url: '/pages/address/list?pick=1' })
}

function checkGiftGate() {
  const g = giftMeta.value
  if (!g) return ''
  if (g.mode === 'growth' && orderType.value !== 'jar') {
    if (session.growth.current < 100) {
      return `养成进度 ${session.growth.current}%，满后可兑`
    }
  }
  if (g.needStreak && session.checkin.streak < g.needStreak) {
    return `需连签 ${g.needStreak} 天（当前 ${session.checkin.streak}）`
  }
  if (g.needInvite) {
    const valid = Number(session.user.validInviteCount || 0)
    if (valid < g.needInvite) {
      return `需有效邀请 ${g.needInvite} 人（当前 ${valid}）`
    }
  }
  const m = resolvePayMix(g)
  const bal = Number(session.user.energy != null ? session.user.energy : session.user.points) || 0
  if (m.payPoints && bal < m.payPoints) {
    const gap = m.payPoints - bal
    return `还差 ${gap} 能量值才能下单（当前 ${bal} / 需 ${m.payPoints}）`
  }
  return ''
}

async function submit() {
  function showFail(msg, kind = 'order') {
    const isPay = kind === 'pay'
    const isMall = orderType.value === 'mall'
    failTitle.value = isPay ? '支付失败' : isMall ? '下单失败' : '兑换失败'
    failMessage.value = msg || (isPay ? '支付未完成，请稍后重试' : '操作失败，请稍后重试')
    if (isPay) {
      failSub.value = isMall
        ? '订单已生成，可在订单详情继续在线支付'
        : '订单已生成，可在订单详情继续支付'
    } else if (orderType.value === 'lottery') {
      failSub.value = '请检查地址、能量或中奖凭证后重试'
    } else if (isMall) {
      failSub.value = '请检查收货地址与能量值余额后重试'
    } else {
      failSub.value = '请检查地址与能量值后重试'
    }
    failShow.value = true
  }

  const needEnergy = Number(mix.value.payPoints || 0) || 0
  const authGate = await assertLoginThenEnergy({
    need: 0,
    redirectPath: currentPagePath() || '/pages/order/confirm',
    action: orderType.value === 'mall' ? '下单' : '兑换',
    loginToast: orderType.value === 'mall' ? '请先登录后再下单' : '请先登录后再兑换',
  })
  if (!authGate.ok) return

  if (!addr.value) {
    uni.showToast({ title: '请先选择收货地址', icon: 'none' })
    return pickAddress()
  }
  if (orderType.value !== 'mall' && appConfig.risk && appConfig.risk.fused) {
    showFail((appConfig.risk && appConfig.risk.fuseToast) || '激励通道已熔断，暂不可兑礼')
    return
  }
  if (cartCheckout.value && !cartLines.value.length) {
    showFail('购物车为空')
    return
  }
  // 商城/兑礼：下单前强制按最新余额校验能量（含组合价）
  if (needEnergy > 0 || orderType.value === 'mall' || orderType.value === 'gift') {
    const eg = await assertLoginThenEnergy({
      need: needEnergy,
      redirectPath: currentPagePath() || '/pages/order/confirm',
      action: orderType.value === 'mall' ? '下单' : '兑换',
      refresh: true,
    })
    if (!eg.ok) return
  }
  // 凭证兑奖不走兑好礼门槛/能量校验（标价仅作展示，实付为 0）
  if (!(orderType.value === 'lottery' && claimToken.value)) {
    const gate = checkGiftGate()
    if (gate && orderType.value !== 'jar' && orderType.value !== 'mall') {
      if (/能量/.test(gate)) {
        await assertLoginThenEnergy({
          need: needEnergy || mix.value.payPoints || 0,
          action: '兑换',
        })
        return
      }
      showFail(gate)
      return
    }
  }

  if (orderType.value === 'jar') {
    if (USE_REMOTE) {
      try {
        await request('/api/traffic/v1/jar/redeem', {
          method: 'POST',
          data: { actionId: actionId('redeem') },
        })
      } catch (e) {
        showFail((e && e.message) || '能量罐兑换失败')
        return
      }
    } else {
      const r = redeemStage()
      if (!r.ok) {
        showFail(r.msg)
        return
      }
    }
  }

  if (orderType.value === 'lottery' && !claimToken.value) {
    showFail('缺少中奖凭证，请重新抽奖')
    return
  }

  submitting.value = true
  try {
    const payload = {
      orderType: orderType.value,
      productId: productId.value,
      productName: product.value.name,
      qty: qty.value,
      addressId: addr.value.id,
      address: addr.value,
      clearCartAfter: fromCart.value || cartCheckout.value,
      payPoints: mix.value.payPoints,
      payCashCent: mix.value.payCashCent,
      claimToken: claimToken.value || undefined,
      entryFrom: entryFrom.value || (cartCheckout.value ? 'cart' : undefined),
    }
    if (cartCheckout.value && cartLines.value.length) {
      payload.items = cartLines.value.map((i) => ({
        productId: i.id,
        qty: i.qty,
      }))
    }
    // 墙钟兜底：服务端占闸超时后前端按钮不能无限转圈
    const r = await Promise.race([
      placeOrder(payload),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('提交超时，请稍后重试')), 28000)
      ),
    ])
    if (!r.ok) {
      showFail(r.msg || '下单失败')
      return
    }

    const orderNo = r.orderNo || (r.order && (r.order.orderNo || r.order.id))
    // 优先用 orderNo，避免仅数字 id 在补记失败时难排查；详情接口两种都认
    const detailKey = orderNo || (r.order && r.order.id)
    if ((r.needWxPay || willPayCash.value) && orderNo) {
      const pay = await payOrder(orderNo)
      if (!pay.ok) {
        // 先关弹层再跳转，避免模拟器 removeTextView / 根视图竞态
        showFail(pay.msg || '未完成支付', 'pay')
        setTimeout(() => {
          failShow.value = false
          uni.redirectTo({ url: `/pages/order/detail?id=${encodeURIComponent(detailKey)}` })
        }, 1600)
        return
      }
      // 已扣款但入账稍慢：勿 toast+立刻 redirect（模拟器 removeTextView 竞态）
      uni.redirectTo({ url: `/pages/order/detail?id=${encodeURIComponent(detailKey)}` })
      return
    }
    uni.redirectTo({ url: `/pages/order/detail?id=${encodeURIComponent(detailKey)}` })
  } catch (e) {
    const raw = (e && e.message) || '兑换失败'
    if (/能量/.test(raw)) {
      await assertLoginThenEnergy({
        need: needEnergy || mix.value.payPoints || 0,
        action: orderType.value === 'mall' ? '下单' : '兑换',
      })
      return
    }
    showFail(polishEnergyError(raw, { action: orderType.value === 'mall' ? '下单' : '兑换' }))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f6f7fb;
  padding: 24rpx 28rpx 180rpx;
}
.card {
  background: #fff;
  border-radius: 24rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(17, 24, 39, 0.04);
}
.addr {
  position: relative;
  padding-right: 48rpx;
}
.addr-empty .ae {
  font-size: 28rpx;
  font-weight: 700;
  color: #e11d48;
}
.row1 {
  display: flex;
  gap: 16rpx;
  align-items: baseline;
}
.name {
  font-size: 30rpx;
  font-weight: 700;
}
.phone {
  font-size: 26rpx;
  color: #6b7280;
}
.full {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #6b7280;
  line-height: 1.4;
}
.chev {
  position: absolute;
  right: 24rpx;
  top: 50%;
  transform: translateY(-50%);
  font-size: 40rpx;
  color: #9ca3af;
}
.goods {
  display: flex;
  gap: 20rpx;
}
.goods-multi .multi-row {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f3f4f6;
}
.goods-multi .multi-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.goods-multi .multi-row:first-child {
  padding-top: 0;
}
.cover-sm {
  width: 112rpx;
  height: 112rpx;
  border-radius: 14rpx;
  background: #f3f4f6;
  flex-shrink: 0;
}
.cover {
  width: 160rpx;
  height: 160rpx;
  border-radius: 16rpx;
  background: #f3f4f6;
  flex-shrink: 0;
}
.gname {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #111827;
}
.gsub {
  display: block;
  margin: 8rpx 0 12rpx;
  font-size: 22rpx;
  color: #9ca3af;
}
.stepper {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 16rpx;
}
.sp {
  width: 48rpx;
  height: 48rpx;
  text-align: center;
  line-height: 48rpx;
  background: #f3f4f6;
  border-radius: 12rpx;
  font-weight: 700;
}
.n {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.bill .line {
  display: flex;
  justify-content: space-between;
  padding: 14rpx 0;
  font-size: 26rpx;
  color: #374151;
}
.bill .em {
  color: #e11d48;
  font-weight: 800;
}
.bill .strike {
  color: #9ca3af;
  text-decoration: line-through;
}
.bill .tip {
  color: #9ca3af;
  font-size: 22rpx;
}
.mix-note {
  margin-top: 8rpx;
  padding: 12rpx 14rpx;
  background: #fff1f2;
  border-radius: 12rpx;
  font-size: 22rpx;
  color: #9f1239;
}
.energy-rule {
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #6b7280;
  line-height: 1.4;
}
.dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -8rpx 24rpx rgba(17, 24, 39, 0.06);
}
.dock-l {
  min-width: 0;
  flex: 1;
  padding-right: 16rpx;
}
.pay {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  color: #e11d48;
}
.mute {
  display: block;
  font-size: 20rpx;
  color: #9ca3af;
  margin-top: 4rpx;
}
.cta {
  height: 84rpx;
  line-height: 84rpx;
  padding: 0 36rpx;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #e11d48, #f97316);
  color: #fff;
  font-size: 28rpx;
  font-weight: 700;
  border: none;
  flex-shrink: 0;
}
.cta::after {
  border: none;
}
.skel {
  margin: 24rpx 24rpx 0;
  padding: 28rpx;
}
.skel-line {
  height: 28rpx;
  border-radius: 8rpx;
  background: linear-gradient(90deg, #f3f0ea, #ebe6de, #f3f0ea);
  background-size: 200% 100%;
  margin-bottom: 16rpx;
  animation: shimmer 1.2s ease-in-out infinite;
}
.skel-line.w40 { width: 40%; }
.skel-line.w50 { width: 50%; }
.skel-line.w55 { width: 55%; }
.skel-line.w60 { width: 60%; }
.skel-line.w70 { width: 70%; }
.skel-line.w80 { width: 80%; }
.skel-line.w90 { width: 90%; }
.goods-skel {
  display: flex;
  gap: 20rpx;
  align-items: flex-start;
}
.skel-cover {
  width: 160rpx;
  height: 160rpx;
  border-radius: 16rpx;
  background: #ebe6de;
  flex-shrink: 0;
}
.skel-body {
  flex: 1;
  padding-top: 8rpx;
}
.skel-tip {
  display: block;
  text-align: center;
  margin-top: 32rpx;
  font-size: 24rpx;
  color: #9ca3af;
}
@keyframes shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
</style>

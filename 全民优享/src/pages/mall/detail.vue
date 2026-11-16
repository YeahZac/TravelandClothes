<template>
  <view class="page yx-safe-bottom" v-if="product">
    <swiper class="hero" circular indicator-dots autoplay>
      <swiper-item v-for="(img, i) in coverList" :key="i">
        <CmsImage class="hero-img" :src="img" mode="aspectFill" placeholder="/static/ui/ico-gift.jpg" />
      </swiper-item>
    </swiper>

    <view class="panel price-panel">
      <view class="price-row">
        <PriceMix :item="product" size="lg" :badge="product.tag || ''" />
      </view>
      <view v-if="mix.payMode === 'mix'" class="mix-tip">
        <text class="mix-ico">惠</text>
        <text>能量值先抵一部分，差额在线支付，比原价更划算</text>
      </view>
      <text class="name">{{ product.name }}</text>
      <text v-if="product.subtitle" class="sub">{{ product.subtitle }}</text>
      <view class="meta-row">
        <text class="stock">库存 {{ product.stock != null ? product.stock : '—' }}</text>
        <text class="sold">热兑中</text>
      </view>
    </view>

    <view v-if="gallery.length" class="panel">
      <text class="sec-title">商品图集</text>
      <CmsImage
        v-for="(g, i) in gallery"
        :key="'g' + i"
        class="long"
        :src="g"
        mode="widthFix"
        @click="preview(i)"
      />
    </view>

    <view v-if="product.detailHtml" class="panel">
      <text class="sec-title">商品详情</text>
      <rich-text class="rich" :nodes="safeHtml" />
    </view>

    <view class="bar">
      <view class="bar-price">
        <PriceMix :item="product" size="sm" />
      </view>
      <button class="ghost" @click="addCart">加购</button>
      <button class="buy" @click="buyNow">{{ mix.ctaText }}</button>
    </view>
  </view>
  <view v-else class="empty">商品不存在或已下架</view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { appConfig } from '../../store/appConfig.js'
import { addToCart } from '../../store/cart.js'
import { goConfirm } from '../../store/order.js'
import { fetchOffer } from '../../api/commerce.js'
import { USE_REMOTE } from '../../api/request.js'
import { assetUrl } from '../../utils/assetUrl.js'
import { resolvePayMix } from '../../utils/payMix.js'
import { assertLoginThenEnergy } from '../../utils/energyGate.js'
import { currentPagePath } from '../../utils/loginGate.js'
import CmsImage from '../../components/CmsImage.vue'
import PriceMix from '../../components/PriceMix.vue'
import { usePageShare, buildInviteQuery } from '../../utils/share.js'

const product = ref(null)
const mix = computed(() => resolvePayMix(product.value || {}))
const productId = ref('')

usePageShare(() => {
  const p = product.value || {}
  const id = productId.value || p.id || ''
  const inviteQ = buildInviteQuery({ channel: 'share_product' })
  return {
    channel: 'share_product',
    path: id
      ? `/pages/mall/detail?id=${encodeURIComponent(id)}&${inviteQ}`
      : undefined,
    query: id ? `id=${encodeURIComponent(id)}` : '',
    imageUrl: p.imageUrl || '',
  }
})

onLoad(async (q) => {
  const id = String((q && q.id) || '')
  productId.value = id
  const list = (appConfig.catalog && appConfig.catalog.products) || []
  let hit = list.find((p) => String(p.id) === id)
  if (!hit) {
    const mods = ((((appConfig.pages || {}).mall || {}).modules) || []).find((m) => m.type === 'goods_grid')
    const items = (mods && mods.payload && mods.payload.items) || []
    hit = items.find((x) => String(x.id) === id)
  }
  if (!hit && USE_REMOTE && id) {
    try {
      const data = await fetchOffer(id)
      const o = data && data.offer
      if (o && o.found !== false && (o.name || o.id)) hit = o
    } catch (e) {}
  }
  product.value = hit ? normalize(hit) : null
})

function normalize(p) {
  const base = { remote: true, assetBase: appConfig.assetBase }
  const gallery = (p.gallery || []).map((u) => assetUrl(u, base)).filter(Boolean)
  return {
    ...p,
    id: p.id || p.productId,
    imageUrl: assetUrl(p.imageUrl, base) || '',
    gallery,
    detailHtml: p.detailHtml || '',
    subtitle: p.subtitle || '',
    payPoints: p.payPoints != null ? p.payPoints : p.costPoints,
    payCashCent: p.payCashCent != null ? p.payCashCent : p.needCash,
    price: p.price != null ? p.price : (Number(p.payCashCent || p.needCash || 0) / 100),
  }
}

const coverList = computed(() => {
  const p = product.value
  if (!p) return ['/static/ui/ico-gift.jpg']
  const list = []
  if (p.imageUrl) list.push(p.imageUrl)
  ;(p.gallery || []).forEach((u) => {
    if (u && !list.includes(u)) list.push(u)
  })
  return list.length ? list : ['/static/ui/ico-gift.jpg']
})

const gallery = computed(() => (product.value && product.value.gallery) || [])

const safeHtml = computed(() => {
  const raw = (product.value && product.value.detailHtml) || ''
  return String(raw).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
})

async function preview(i) {
  const { ensureLocalImage } = await import('../../utils/cloudImage.js')
  const urls = []
  for (const u of gallery.value) {
    const local = await ensureLocalImage(u)
    if (local) urls.push(local)
  }
  if (!urls.length) return
  uni.previewImage({ urls, current: urls[Math.min(i, urls.length - 1)] })
}

function addCart() {
  if (!product.value) return
  addToCart(product.value, 1)
  uni.showToast({ title: '已加入购物车', icon: 'none' })
}

async function buyNow() {
  if (!product.value) return
  const need = Number(mix.value.payPoints || 0) || 0
  const gate = await assertLoginThenEnergy({
    need,
    redirectPath: currentPagePath() || '/pages/mall/detail',
    action: '下单',
    loginToast: '请先登录后再下单',
  })
  if (!gate.ok) return
  goConfirm({ type: 'mall', productId: product.value.id, qty: 1 })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f6f8;
  padding-bottom: 140rpx;
}
.hero {
  height: 750rpx;
  background: #fff;
}
.hero-img {
  width: 100%;
  height: 750rpx;
}
.panel {
  margin: 20rpx 24rpx;
  padding: 28rpx;
  background: #fff;
  border-radius: 20rpx;
}
.price-panel {
  margin-top: -24rpx;
  position: relative;
  z-index: 2;
  box-shadow: 0 12rpx 32rpx rgba(225, 29, 72, 0.08);
}
.mix-tip {
  margin-top: 16rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 12rpx 14rpx;
  background: #fff1f2;
  border-radius: 12rpx;
  font-size: 22rpx;
  color: #9f1239;
}
.mix-ico {
  width: 36rpx;
  height: 36rpx;
  border-radius: 8rpx;
  background: #e11d48;
  color: #fff;
  font-size: 20rpx;
  font-weight: 800;
  text-align: center;
  line-height: 36rpx;
  flex-shrink: 0;
}
.name {
  display: block;
  margin-top: 20rpx;
  font-size: 36rpx;
  font-weight: 700;
  color: #111827;
  line-height: 1.35;
}
.sub {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #6b7280;
  line-height: 1.4;
}
.meta-row {
  margin-top: 18rpx;
  display: flex;
  justify-content: space-between;
}
.stock,
.sold {
  font-size: 22rpx;
  color: #9ca3af;
}
.sold {
  color: #e11d48;
  font-weight: 600;
}
.sec-title {
  display: block;
  margin-bottom: 16rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #121826;
}
.long {
  width: 100%;
  display: block;
  margin-bottom: 12rpx;
  border-radius: 12rpx;
}
.rich {
  font-size: 26rpx;
  color: #374151;
  line-height: 1.7;
}
.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  display: flex;
  gap: 12rpx;
  align-items: center;
  box-shadow: 0 -8rpx 24rpx rgba(18, 24, 38, 0.06);
}
.bar-price {
  flex: 1;
  min-width: 0;
}
.ghost,
.buy {
  height: 88rpx;
  line-height: 88rpx;
  margin: 0;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 700;
  padding: 0 28rpx;
}
.ghost {
  background: #fff;
  color: #111827;
  border: 2rpx solid #111827;
}
.buy {
  background: linear-gradient(90deg, #e11d48, #f97316);
  color: #fff;
  border: none;
  min-width: 220rpx;
}
.ghost::after,
.buy::after {
  border: none;
}
.empty {
  padding: 120rpx 40rpx;
  text-align: center;
  color: #9ca3af;
}
</style>

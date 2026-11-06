<template>
  <view class="page yx-safe-bottom" v-if="product">
    <swiper class="hero" circular indicator-dots autoplay>
      <swiper-item v-for="(img, i) in coverList" :key="i">
        <CmsImage class="hero-img" :src="img" mode="aspectFill" placeholder="/static/ui/ico-gift.png" />
      </swiper-item>
    </swiper>

    <view class="panel">
      <view class="price-row">
        <text class="price yx-num">¥{{ Number(product.price || 0).toFixed(2) }}</text>
        <text v-if="product.tag" class="tag">{{ product.tag }}</text>
      </view>
      <text class="name">{{ product.name }}</text>
      <text v-if="product.subtitle" class="sub">{{ product.subtitle }}</text>
      <text class="stock">库存 {{ product.stock != null ? product.stock : '—' }}</text>
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
      <button class="ghost" @click="addCart">加入购物车</button>
      <button class="buy" @click="buyNow">立即购买</button>
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
import { assetUrl } from '../../utils/assetUrl.js'
import CmsImage from '../../components/CmsImage.vue'

const product = ref(null)

onLoad((q) => {
  const id = String((q && q.id) || '')
  const list = (appConfig.catalog && appConfig.catalog.products) || []
  const hit = list.find((p) => p.id === id)
  if (hit) {
    product.value = normalize(hit)
    return
  }
  // 壳层 mall 网格兜底
  const mods = ((((appConfig.pages || {}).mall || {}).modules) || []).find((m) => m.type === 'goods_grid')
  const items = (mods && mods.payload && mods.payload.items) || []
  const g = items.find((x) => x.id === id)
  product.value = g ? normalize(g) : null
})

function normalize(p) {
  const base = { remote: true, assetBase: appConfig.assetBase }
  const gallery = (p.gallery || []).map((u) => assetUrl(u, base)).filter(Boolean)
  return {
    ...p,
    imageUrl: assetUrl(p.imageUrl, base) || '',
    gallery,
    detailHtml: p.detailHtml || '',
    subtitle: p.subtitle || '',
  }
}

const coverList = computed(() => {
  const p = product.value
  if (!p) return ['/static/ui/ico-gift.png']
  const list = []
  if (p.imageUrl) list.push(p.imageUrl)
  ;(p.gallery || []).forEach((u) => {
    if (u && !list.includes(u)) list.push(u)
  })
  return list.length ? list : ['/static/ui/ico-gift.png']
})

const gallery = computed(() => (product.value && product.value.gallery) || [])

const safeHtml = computed(() => {
  const raw = (product.value && product.value.detailHtml) || ''
  // 简易消毒：去掉 script
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

function buyNow() {
  if (!product.value) return
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
.price-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.price {
  font-size: 44rpx;
  font-weight: 700;
  color: #c45c26;
}
.tag {
  font-size: 22rpx;
  color: #fff;
  background: #121826;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}
.name {
  display: block;
  margin-top: 16rpx;
  font-size: 34rpx;
  font-weight: 600;
  color: #121826;
  line-height: 1.35;
}
.sub {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #6b7280;
  line-height: 1.4;
}
.stock {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #9ca3af;
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
  gap: 16rpx;
  box-shadow: 0 -8rpx 24rpx rgba(18, 24, 38, 0.06);
}
.ghost,
.buy {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  margin: 0;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 600;
}
.ghost {
  background: #fff;
  color: #121826;
  border: 2rpx solid #121826;
}
.buy {
  background: #0b6e4f;
  color: #fff;
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

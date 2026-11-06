<template>
  <view class="page">
    <view v-if="!addressState.list.length" class="empty">
      <text class="et">还没有收货地址</text>
      <text class="es">兑换实物礼品前请先添加</text>
    </view>
    <view
      v-for="a in addressState.list"
      :key="a.id"
      class="card"
      @click="onPick(a)"
    >
      <view class="row1">
        <text class="name">{{ a.name }}</text>
        <text class="phone">{{ a.phone }}</text>
        <text v-if="a.isDefault" class="badge">默认</text>
      </view>
      <text class="full">{{ a.full || a.detail }}</text>
      <view class="ops" @click.stop>
        <text class="op" @click="edit(a)">编辑</text>
        <text class="op" v-if="!a.isDefault" @click="onDefault(a)">设默认</text>
        <text class="op danger" @click="onDel(a)">删除</text>
      </view>
    </view>
    <view class="dock">
      <button class="cta" @click="add">新增地址</button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { addressState, loadAddresses, makeDefault, removeAddress } from '../../store/address.js'

const pickMode = ref(false)

onLoad((q) => {
  pickMode.value = q.pick === '1'
})

onShow(() => {
  loadAddresses()
})

function add() {
  uni.navigateTo({ url: '/pages/address/edit' })
}
function edit(a) {
  uni.navigateTo({ url: `/pages/address/edit?id=${a.id}` })
}
function onPick(a) {
  if (!pickMode.value) return
  uni.setStorageSync('qmyx_picked_address_id', a.id)
  uni.navigateBack()
}
async function onDefault(a) {
  await makeDefault(a.id)
  uni.showToast({ title: '已设为默认', icon: 'none' })
}
function onDel(a) {
  uni.showModal({
    title: '删除地址',
    content: '确定删除该地址？',
    success: async (res) => {
      if (!res.confirm) return
      await removeAddress(a.id)
    },
  })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--paper, #fbf8f4);
  padding: 24rpx 32rpx 160rpx;
}
.empty {
  padding: 120rpx 0;
  text-align: center;
}
.et {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--ink, #2b2520);
}
.es {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: var(--ink-3, #a89b91);
}
.card {
  background: #fff;
  border-radius: 28rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  border: 1rpx solid var(--line, #eae0d5);
}
.row1 {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.name {
  font-size: 30rpx;
  font-weight: 700;
}
.phone {
  font-size: 26rpx;
  color: var(--ink-2, #6e6258);
}
.badge {
  margin-left: auto;
  font-size: 20rpx;
  color: #5a8055;
  background: #e8efe2;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  font-weight: 600;
}
.full {
  display: block;
  margin-top: 12rpx;
  font-size: 26rpx;
  color: var(--ink-2, #6e6258);
  line-height: 1.45;
}
.ops {
  display: flex;
  gap: 28rpx;
  margin-top: 20rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid var(--line-soft, #f0e8dd);
}
.op {
  font-size: 24rpx;
  color: var(--ink-2, #6e6258);
  font-weight: 600;
}
.op.danger {
  color: #c23a2a;
}
.dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid var(--line, #eae0d5);
}
.cta {
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 999rpx;
  background: var(--accent, #d83068);
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  border: none;
}
.cta::after {
  border: none;
}
</style>

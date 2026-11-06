<template>
  <view class="page">
    <view class="card">
      <view class="row"><text class="lab">收货人</text><input v-model="form.name" placeholder="姓名" /></view>
      <view class="row"><text class="lab">手机号</text><input v-model="form.phone" type="number" maxlength="11" placeholder="11 位手机号" /></view>
      <view class="row"><text class="lab">省</text><input v-model="form.province" placeholder="如 广东省" /></view>
      <view class="row"><text class="lab">市</text><input v-model="form.city" placeholder="如 广州市" /></view>
      <view class="row"><text class="lab">区</text><input v-model="form.district" placeholder="如 天河区" /></view>
      <view class="row top"><text class="lab">详细地址</text><textarea v-model="form.detail" placeholder="街道门牌号" /></view>
      <view class="row switch">
        <text class="lab">设为默认</text>
        <switch :checked="form.isDefault" color="#D83068" @change="onSwitch" />
      </view>
    </view>
    <button class="cta" :loading="saving" @click="save">保存</button>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { addressState, loadAddresses, upsertAddress } from '../../store/address.js'

const form = reactive({
  id: null,
  name: '',
  phone: '',
  province: '广东省',
  city: '广州市',
  district: '',
  detail: '',
  isDefault: false,
})
const saving = ref(false)

onLoad(async (q) => {
  await loadAddresses()
  if (q.id) {
    const a = addressState.list.find((x) => String(x.id) === String(q.id))
    if (a) {
      Object.assign(form, {
        id: a.id,
        name: a.name,
        phone: a.phone,
        province: a.province || '',
        city: a.city || '',
        district: a.district || '',
        detail: a.detail || '',
        isDefault: !!a.isDefault,
      })
    }
  }
})

function onSwitch(e) {
  form.isDefault = !!e.detail.value
}

async function save() {
  if (!form.name || !form.phone || !form.detail) {
    uni.showToast({ title: '请完善必填信息', icon: 'none' })
    return
  }
  saving.value = true
  try {
    await upsertAddress({ ...form })
    uni.showToast({ title: '已保存', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 500)
  } catch (e) {
    uni.showToast({ title: e.message || '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--paper, #fbf8f4);
  padding: 24rpx 32rpx;
}
.card {
  background: #fff;
  border-radius: 28rpx;
  padding: 8rpx 28rpx;
  border: 1rpx solid var(--line, #eae0d5);
}
.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 24rpx 0;
  border-bottom: 1rpx solid var(--line-soft, #f0e8dd);
}
.row.top {
  align-items: flex-start;
}
.row:last-child {
  border-bottom: none;
}
.lab {
  width: 140rpx;
  flex-shrink: 0;
  font-size: 26rpx;
  color: var(--ink-2, #6e6258);
}
input,
textarea {
  flex: 1;
  font-size: 28rpx;
  color: var(--ink, #2b2520);
}
textarea {
  min-height: 120rpx;
}
.switch {
  justify-content: space-between;
}
.cta {
  margin-top: 40rpx;
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

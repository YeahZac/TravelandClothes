<template>
  <view class="page">
    <view class="card">
      <view class="row">
        <text class="lab">收货人</text>
        <input v-model="form.name" placeholder="姓名" />
      </view>
      <view class="row">
        <text class="lab">手机号</text>
        <input v-model="form.phone" type="number" maxlength="11" placeholder="11 位手机号" />
      </view>

      <picker mode="region" :value="regionValue" @change="onRegionChange">
        <view class="row pick">
          <text class="lab">省市区</text>
          <text class="val" :class="{ mute: !regionText }">{{ regionText || '请选择省 / 市 / 区' }}</text>
          <text class="chev">›</text>
        </view>
      </picker>

      <view class="row top">
        <text class="lab">详细地址</text>
        <textarea v-model="form.detail" placeholder="街道门牌号、楼栋单元" />
      </view>
      <view class="row switch">
        <text class="lab">设为默认</text>
        <switch :checked="form.isDefault" color="#0b6e4f" @change="onSwitch" />
      </view>
    </view>
    <button class="cta" :loading="saving" @click="save">保存</button>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { addressState, loadAddresses, upsertAddress } from '../../store/address.js'
import { getToken, USE_REMOTE } from '../../api/request.js'

const form = reactive({
  id: null,
  name: '',
  phone: '',
  province: '',
  city: '',
  district: '',
  detail: '',
  isDefault: false,
})
const saving = ref(false)

const regionValue = computed(() => {
  if (form.province && form.city && form.district) {
    return [form.province, form.city, form.district]
  }
  return []
})

const regionText = computed(() => {
  if (!form.province) return ''
  return `${form.province} ${form.city} ${form.district}`.trim()
})

onLoad(async (q) => {
  try {
    await loadAddresses()
  } catch (_) {}
  if (q && q.id) {
    const a = addressState.list.find((x) => String(x.id) === String(q.id))
    if (a) {
      Object.assign(form, {
        id: a.id,
        name: a.name || '',
        phone: a.phone || '',
        province: a.province || '',
        city: a.city || '',
        district: a.district || '',
        detail: a.detail || '',
        isDefault: !!a.isDefault,
      })
    }
  }
})

function onRegionChange(e) {
  const v = (e.detail && e.detail.value) || []
  form.province = v[0] || ''
  form.city = v[1] || ''
  form.district = v[2] || ''
}

function onSwitch(e) {
  form.isDefault = !!(e.detail && e.detail.value)
}

async function save() {
  if (USE_REMOTE && !getToken()) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => uni.navigateTo({ url: '/pages/login/index' }), 400)
    return
  }
  const phone = String(form.phone || '').replace(/\s+/g, '')
  if (!form.name || !phone || !form.detail) {
    uni.showToast({ title: '请完善姓名、手机号与详细地址', icon: 'none' })
    return
  }
  if (!/^1\d{10}$/.test(phone)) {
    uni.showToast({ title: '手机号格式不正确', icon: 'none' })
    return
  }
  if (!form.province || !form.city || !form.district) {
    uni.showToast({ title: '请选择省市区', icon: 'none' })
    return
  }

  const payload = {
    name: String(form.name).trim(),
    phone,
    province: form.province,
    city: form.city,
    district: form.district,
    detail: String(form.detail).trim(),
    isDefault: !!form.isDefault,
  }
  if (form.id) payload.id = form.id

  saving.value = true
  try {
    await upsertAddress(payload)
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 500)
  } catch (e) {
    const msg = (e && e.message) || '保存失败'
    uni.showToast({ title: msg, icon: 'none' })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--paper, #f5f6f8);
  padding: 24rpx 32rpx;
}
.card {
  background: #fff;
  border-radius: 28rpx;
  padding: 8rpx 28rpx;
  border: 1rpx solid var(--line, #e6e8ee);
}
.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 24rpx 0;
  border-bottom: 1rpx solid var(--line-soft, #eef0f4);
}
.row.top {
  align-items: flex-start;
}
.row.pick {
  min-height: 48rpx;
}
.row:last-child {
  border-bottom: none;
}
.lab {
  width: 140rpx;
  flex-shrink: 0;
  font-size: 26rpx;
  color: var(--ink-2, #6b7280);
}
.val {
  flex: 1;
  font-size: 28rpx;
  color: var(--ink, #121826);
}
.val.mute {
  color: #9ca3af;
}
.chev {
  color: #9ca3af;
  font-size: 36rpx;
  line-height: 1;
}
input,
textarea {
  flex: 1;
  font-size: 28rpx;
  color: var(--ink, #121826);
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
  background: #0b6e4f;
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  border: none;
}
.cta::after {
  border: none;
}
</style>

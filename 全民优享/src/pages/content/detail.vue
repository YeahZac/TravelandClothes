<template>
  <view class="yx-page detail yx-safe-bottom">
    <view v-if="loading" class="yx-card"><text class="yx-muted">加载中…</text></view>
    <view v-else-if="error" class="yx-card">
      <text class="title">{{ error }}</text>
      <button class="yx-btn yx-btn-blue" @click="back">返回</button>
    </view>
    <view v-else class="yx-card">
      <text v-if="article.tag" class="yx-tag yx-tag-blue">{{ article.tag }}</text>
      <text class="title">{{ article.title || title }}</text>
      <text v-if="article.publishedAt" class="yx-muted">{{ formatChinaTime(article.publishedAt) }}</text>
      <view class="blocks">
        <view v-for="(b, i) in article.blocks || []" :key="'b' + i" class="blk">
          <text v-if="b.type === 'text'" class="body">{{ b.content }}</text>
          <CmsImage
            v-else-if="b.type === 'image'"
            class="blk-img"
            :src="b.url"
            mode="widthFix"
            placeholder="/static/ui/ico-gift.jpg"
          />
          <rich-text v-else-if="b.type === 'html'" class="rich" :nodes="sanitizeHtml(b.content)" />
        </view>
      </view>
      <button class="yx-btn yx-btn-blue" @click="back">我知道了</button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { request, USE_REMOTE } from '../../api/request.js'
import { contents } from '../../mock/data.js'
import CmsImage from '../../components/CmsImage.vue'
import { formatChinaTime } from '../../utils/chinaTime.js'
import { usePageShare, buildInviteQuery } from '../../utils/share.js'

const id = ref('')
const title = ref('')
const loading = ref(true)
const error = ref('')
const article = ref({ title: '', tag: '', blocks: [], publishedAt: '' })

usePageShare(() => {
  const aid = id.value || ''
  const inviteQ = buildInviteQuery({ channel: 'share_content' })
  return {
    channel: 'share_content',
    path: aid ? `/pages/content/detail?id=${encodeURIComponent(aid)}&${inviteQ}` : undefined,
    query: aid ? `id=${encodeURIComponent(aid)}` : '',
  }
})

function sanitizeHtml(raw) {
  // 运营可控简单 HTML；去掉脚本
  return String(raw || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+=(["']).*?\1/gi, '')
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (USE_REMOTE && id.value && id.value !== 'webview') {
      const data = await request(`/api/traffic/v1/articles/${encodeURIComponent(id.value)}`, {
        method: 'GET',
        timeout: 15000,
      })
      article.value = {
        title: data.title || title.value,
        tag: data.tag || '',
        summary: data.summary || '',
        publishedAt: data.publishedAt || '',
        blocks: Array.isArray(data.blocks) ? data.blocks : [],
      }
      if (!article.value.blocks.length && data.summary) {
        article.value.blocks = [{ type: 'text', content: data.summary }]
      }
      return
    }
    const hit = contents.find((c) => c.id === id.value)
    article.value = {
      title: title.value || (hit && hit.title) || '详情',
      tag: hit && hit.type === 'policy' ? '政策' : '动态',
      publishedAt: '',
      blocks: [
        {
          type: 'text',
          content:
            (hit && hit.summary) ||
            '运营内容详情占位。请在运营台「文章」中配置正文块后重新打开。',
        },
      ],
    }
  } catch (e) {
    error.value = (e && e.message) || '加载失败'
  } finally {
    loading.value = false
  }
}

onLoad((q) => {
  id.value = (q && q.id) || ''
  title.value = q && q.title ? decodeURIComponent(q.title) : '详情'
  load()
})

function back() {
  uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/home/index' }) })
}
</script>

<style scoped lang="scss">
.detail {
  padding: 24rpx 28rpx;
}
.title {
  display: block;
  margin: 16rpx 0 8rpx;
  font-size: 36rpx;
  font-weight: 800;
}
.blocks {
  margin: 24rpx 0 32rpx;
}
.blk {
  margin-bottom: 24rpx;
}
.body {
  display: block;
  font-size: 28rpx;
  color: #5c574f;
  line-height: 1.7;
  white-space: pre-wrap;
}
.blk-img {
  width: 100%;
  min-height: 200rpx;
  border-radius: 16rpx;
  overflow: hidden;
}
.rich {
  font-size: 28rpx;
  color: #5c574f;
  line-height: 1.7;
}
.yx-btn {
  width: 100%;
}
</style>

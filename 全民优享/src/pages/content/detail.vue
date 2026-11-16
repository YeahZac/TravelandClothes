<template>
  <!-- 完整 HTML 文档：web-view 才能保留 CSS/版式；与原生组件互斥 -->
  <web-view v-if="pageUrl" :src="pageUrl" />
  <view v-else class="yx-page detail yx-safe-bottom">
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
          <rich-text
            v-else-if="b.type === 'html'"
            class="rich"
            :nodes="htmlNodes(b)"
          />
        </view>
      </view>
      <button class="yx-btn yx-btn-blue" @click="back">我知道了</button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { request, USE_REMOTE, CMS_BASE } from '../../api/request.js'
import { contents } from '../../mock/data.js'
import CmsImage from '../../components/CmsImage.vue'
import { formatChinaTime } from '../../utils/chinaTime.js'
import { usePageShare, buildInviteQuery } from '../../utils/share.js'

const id = ref('')
const title = ref('')
const loading = ref(true)
const error = ref('')
const pageUrl = ref('')
const article = ref({ title: '', tag: '', blocks: [], publishedAt: '', renderMode: 'native' })

usePageShare(() => {
  const aid = id.value || ''
  const inviteQ = buildInviteQuery({ channel: 'share_content' })
  return {
    channel: 'share_content',
    path: aid && aid !== 'webview' ? `/pages/content/detail?id=${encodeURIComponent(aid)}&${inviteQ}` : undefined,
    query: aid && aid !== 'webview' ? `id=${encodeURIComponent(aid)}` : '',
  }
})

function stripScripts(raw) {
  return String(raw || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+=(["']).*?\1/gi, '')
}

/** rich-text 不吃整页文档：优先用后端抽出的 body，再本地兜底剥 head */
function toRichHtml(raw) {
  let s = stripScripts(raw)
  if (!s) return ''
  const bodyMatch = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) s = bodyMatch[1]
  s = s
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<title[\s\S]*?<\/title>/gi, '')
  return s.trim()
}

function htmlNodes(b) {
  if (!b) return ''
  if (b.richHtml) return stripScripts(b.richHtml)
  return toRichHtml(b.content)
}

function looksLikeFullPage(html) {
  const s = String(html || '')
  return (
    /<!DOCTYPE\s+html/i.test(s) ||
    /<html[\s>]/i.test(s) ||
    /<body[\s>]/i.test(s) ||
    /<style[\s>]/i.test(s) ||
    /<link\b[^>]*stylesheet/i.test(s)
  )
}

function resolvePageUrl(data) {
  if (!data || !id.value || id.value === 'webview') return ''
  if (data.renderMode === 'page' || data.pagePath) {
    const path = data.pagePath || `/api/traffic/v1/articles/${encodeURIComponent(id.value)}/page.html`
    if (/^https?:\/\//i.test(path)) return path
    return `${CMS_BASE}${path.startsWith('/') ? path : `/${path}`}`
  }
  const blocks = Array.isArray(data.blocks) ? data.blocks : []
  const needPage = blocks.some(
    (b) => b && b.type === 'html' && (b.renderMode === 'page' || looksLikeFullPage(b.content))
  )
  if (!needPage) return ''
  return `${CMS_BASE}/api/traffic/v1/articles/${encodeURIComponent(id.value)}/page.html`
}

async function load() {
  loading.value = true
  error.value = ''
  pageUrl.value = ''
  try {
    if (id.value === 'webview') {
      // 外部 H5 直开
      return
    }
    if (USE_REMOTE && id.value) {
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
        renderMode: data.renderMode || 'native',
        pagePath: data.pagePath || '',
      }
      if (!article.value.blocks.length && data.summary) {
        article.value.blocks = [{ type: 'text', content: data.summary }]
      }
      pageUrl.value = resolvePageUrl(data)
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
  if (id.value === 'webview' && q && q.url) {
    try {
      pageUrl.value = decodeURIComponent(q.url)
    } catch (_) {
      pageUrl.value = q.url
    }
    loading.value = false
    return
  }
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

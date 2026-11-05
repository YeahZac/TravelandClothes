# 全民优享 · 能量罐（多端小程序）

uni-app Vue3 工程：微信 / 抖音 / 快手 / 支付宝一套代码。壳层文案、图片、底栏、模块列表由 **traffic-cms** 下发；玩法数值仍走本地 session（后续可接业务 API）。

配套文档：[`docs/流量产品-配置接口与多端方案.md`](../docs/流量产品-配置接口与多端方案.md)

## 依赖

```bash
cd 全民优享
npm install
```

另开终端启动配置服务：

```bash
cd traffic-cms
npm install
npm start   # http://127.0.0.1:3100
```

小程序 CMS 地址在 `src/api/request.js` 的 `CMS_BASE`；CMS 不可达时自动用 `src/config/fallback.json`。

## 四端开发 / 编译

| 端 | 开发 | 出包 |
|----|------|------|
| 微信 | `npm run dev:mp-weixin` | `npm run build:mp-weixin` |
| 抖音 | `npm run dev:mp-toutiao` | `npm run build:mp-toutiao` |
| 快手 | `npm run dev:mp-kuaishou` | `npm run build:mp-kuaishou` |
| 支付宝 | `npm run dev:mp-alipay` | `npm run build:mp-alipay` |

产物：`dist/dev/mp-*` 或 `dist/build/mp-*`，用对应开发者工具打开。

`src/manifest.json` 中各端 `appid` 按账号资质填写（微信已填项目 AppID；其余为占位空串）。

## 配置驱动说明

- 启动：`App.onLaunch` → `loadAppConfig()` → `GET /api/traffic/v1/bootstrap`
- 页面：`pages/*/index.vue` 仅渲染 `pageModules(pageKey)` + `ModuleRenderer`
- 底栏：原生 `tabBar`（本地 `static/tab` 图标）；运营文案可用配置 + `uni.setTabBarItem` 覆盖
- 运营改图文：打开 `http://127.0.0.1:3100/admin/` → 保存草稿 → 发布 → 小程序冷启动或 onShow 发现新 version 后刷新

## H5 预览（可选）

```bash
npm run dev:h5
```

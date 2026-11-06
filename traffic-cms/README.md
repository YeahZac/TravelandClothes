# traffic-cms

全民优享流量产品 · 壳层配置 + 运营后台（与同袍会文旅库解耦）。

## 启动

```bash
cd traffic-cms
npm install
npm start
# 运营台 http://127.0.0.1:3100/qmyx/
# 公网（云托管自定义域名）https://qmyx.linyitech.cloud/qmyx/
```

挂域名见 `deploy/nginx-qmyx.conf.example`：页面走 `/qmyx/`，接口仍走 `/api/traffic/`，不占用飞帆的 `/admin/`。

## 管理后台模块

| 模块 | 能力 |
|------|------|
| 总览 | DAU 相关 KPI、日/周/月收入与成本、分类汇总 |
| 规则/壳层 | 品牌、能量罐参数、Tab、页面 JSON；保存草稿 → 发布 |
| 用户 | 搜索、封禁、调整抽次/钱包 |
| 图标素材 | COS 上传、图标库 CRUD，同步 assets / tabBar |
| 商品库存 | 售价/成本/库存/预警；同步 mall 模块 |
| 抽奖概率 | 权重归一化概率、实物绑 SKU |
| 任务完成 | 任务定义 + 按日完成明细 |
| 兑换订单 | 待发货 → 发货 → 完成 |
| 收支统计 | 收入/激励成本流水，支持手工记账 |

改商品 / 奖池 / 图标后会写入**草稿**；小程序要立刻看到，请点「发布上线」或依赖 `GET /catalog` 实时接口。

## 关键接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/traffic/v1/bootstrap` | 壳层 + `catalog`（商品/奖池/任务/图标） |
| GET | `/api/traffic/v1/catalog` | 实时目录 |
| GET | `/api/traffic/v1/admin/stats` | 日周月收支 |
| * | `/api/traffic/v1/admin/*` | 用户/商品/抽奖/任务/兑换/图标/财务 |
| POST | `/api/traffic/v1/lottery/draw` | 服务端开奖 |
| POST | `/api/traffic/v1/orders/create` | 下单记账 |

存储：SQLite `data/qmyx.sqlite`（并镜像 `draft.json` / `published.json`）；图片：`uploads/qmyx/`。

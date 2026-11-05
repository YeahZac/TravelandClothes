# 流量产品 · 后端 API / 数据库 / COS / 前端缓存

> 配套：`traffic-cms/`（Node API）+ `全民优享/`（uni-app 四端）  
> 原则：**壳层配置、文案、图片、游戏规则全部后端下发**；前端只保留玩法交互与本地缓存。

## 1. 总览

```
小程序 (微信/抖音/快手/支付宝)
    │  GET /bootstrap?platform=&channel=&version=
    │  GET /meta （轻量版本探测）
    │  GET /assets/manifest
    │  POST /jar/* （能量罐动作，幂等）
    ▼
traffic-cms (:3100)
    ├─ SQLite（开发） / MySQL（生产，同 schema）
    ├─ COS 适配器（本地 uploads/ 或腾讯云 COS）
    └─ 管理端 /admin 发布配置
```

## 2. COS 文件夹约定

Bucket 前缀：`qmyx/`（全民优享）

| Key 前缀 | 用途 | 示例 |
|---|---|---|
| `qmyx/brand/` | Logo / 启动图 | `logo.png` |
| `qmyx/tabbar/` | 底栏图标 | `home.png` `home-active.png` |
| `qmyx/banners/` | Banner | `festival.png` `mall.png` |
| `qmyx/icons/` | 玩法图标 | `coin.png` `gift.png` |
| `qmyx/energy/` | 能量罐舞台 | `can-shell.png` |
| `qmyx/festival/` | 汉服节 | `guest-*.png` |
| `qmyx/mall/` | 商品图 | `sku-*.jpg` |
| `qmyx/avatars/` | 用户/好友头像 | `u_*.jpg` |
| `qmyx/share/` | 分享图 | `invite-card.png` |

配置里统一存 **相对 key**（如 `/cos/qmyx/icons/coin.png`），bootstrap 时拼成 CDN 绝对 URL。  
本地开发：`COS_MODE=local` → 映射到 `traffic-cms/uploads/qmyx/...`，HTTP 路径仍为 `/uploads/qmyx/...`。

## 3. 数据库（见 `traffic-cms/sql/schema.sql`）

核心表：

| 表 | 职责 |
|---|---|
| `config_draft` / `config_published` | 壳层 JSON（含 game / copy / pages） |
| `asset_object` | COS 对象登记（key、etag、mime、用途） |
| `user_account` | 多端 openid 映射 |
| `user_wallet` | 能量 / 积分 / 抽次（服务端权威） |
| `jar_state` | 水位、待收、冷却、关卡 |
| `jar_ledger` | 动作幂等账本（action_id 唯一） |
| `friend_edge` / `social_feed` | 好友与「谁偷过我」 |
| `subscribe_grant` | 订阅消息授权 |

## 4. HTTP API（`/api/traffic/v1`）

统一响应：`{ code: 0, msg, data }`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/meta` | `{ version, publishedAt, assetBase, cdnHost }` 轻量探测 |
| GET | `/bootstrap` | 全量壳层；`?version=` 相同则 `304`/`code:304` |
| GET | `/config/:pageKey` | 单页切片 |
| GET | `/assets/manifest` | 资源清单 + etag |
| POST | `/auth/login` | `{ platform, code }` → token + user |
| GET | `/me` | 钱包 + 罐子摘要 |
| GET | `/jar/state` | 罐子完整状态 |
| POST | `/jar/harvest` | body `{ actionId }` |
| POST | `/jar/water` | body `{ actionId }` |
| POST | `/jar/steal` | body `{ actionId, friendId }` |
| POST | `/jar/help` | body `{ actionId, friendId }` |
| POST | `/jar/clear-event` | body `{ actionId }` |
| POST | `/jar/redeem` | 满罐兑礼 |
| GET | `/jar/feed` | 社交动态 |
| POST | `/subscribe/grant` | 上报模板授权结果 |
| Admin | `/admin/*` | 草稿 / 发布 / 上传（既有） |

## 5. 前端缓存策略

| 层 | Key | TTL / 失效 |
|---|---|---|
| meta 探测 | 每次 `onShow` / 冷启动 | 网络成功则对比 version |
| bootstrap 全量 | `qmyx_cfg_v{version}` + `qmyx_cfg_current` | version 变才替换；失败用磁盘缓存；再失败用包内 fallback |
| 资源 URL | 配置内已是绝对 CDN | 小程序自身图片缓存；manifest etag 变化时刷新列表 |
| 钱包/罐子 | 内存 + `qmyx_jar_snapshot` | 动作成功后写回；冷启动先展示快照再拉取 |

拉取节奏：

1. `onLaunch` → 读本地 current → 并行 `GET /meta`  
2. meta.version ≠ local → `GET /bootstrap` → 落盘 → 应用  
3. `onShow` → 节流 60s 再 `/meta`；能量罐页额外 `/jar/state`  
4. 任何写动作带客户端 `actionId`（uuid），服务端幂等

## 6. 环境变量

```bash
PORT=3100
COS_MODE=local|tencent
COS_BUCKET=
COS_REGION=
COS_SECRET_ID=
COS_SECRET_KEY=
COS_CDN_HOST=https://cdn.example.com
DB_PATH=./data/qmyx.sqlite
```

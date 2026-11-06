# 微信云托管部署（同袍会环境 · 覆盖 test-sever）

## 目标

| 项 | 值 |
|---|---|
| Git | `YeahZac/TravelandClothes` · `main` |
| 云托管服务 | `test-sever` |
| 环境 ID | `prod-d7gnz9s0j20275c05` |
| 数据库 | **原库** `travel_clothes`（CynosDB，新表与旧文旅表共存） |
| COS | `7072-prod-d7gnz9s0j20275c05-1492159324` · 前缀 `qmyx/` |

## 1. 推代码

```bash
git push origin main
```

云托管控制台 → 服务 `test-sever` → 用该仓库 Dockerfile 重新部署。

## 2. 控制台注入环境变量（必填）

在云托管「服务设置 → 环境变量」填入真实值（`${...}` 占位不会自动解析）：

- `DB_PASSWORD` — 原 MySQL root 密码
- `WX_SECRET` — 小程序 AppSecret
- `COS_SECRET_ID` / `COS_SECRET_KEY` — 若容器无法用默认角色上传
- `PUBLIC_BASE_URL` — 云托管**公网域名**（支付回调用）
- `WX_PAY_NOTIFY_URL` — 建议 `${PUBLIC_BASE_URL}/api/traffic/v1/pay/wx/notify`
- `WX_API_V3_KEY` / `WX_MCH_SERIAL_NO`
- `WX_MCH_KEY_PEM` / `WX_MCH_CERT_PEM` — PEM 全文（可用 `\n` 表示换行）

确认 **实例副本最小值 = 1**。

## 3. 数据库

启动时自动执行 `sql/schema.mysql.sql`，在 `travel_clothes` 内创建全民优享表  
（`user_account` / `product` / `redeem_order` …）。**不会删**旧的 `users` / `orders` 等文旅表。

## 4. 小程序

`全民优享` 已用 `wx.cloud.callContainer`（`ENV_ID` + `X-WX-SERVICE: test-sever`）。  
需在小程序后台开通「云托管」并与该环境关联。

## 5. 验收

```
GET /ping
GET /api/traffic/v1/pay/wx/status
GET /api/traffic/v1/catalog
```

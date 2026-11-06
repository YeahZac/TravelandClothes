# 微信云托管部署（同袍会 · test-sever · 自定义域名）

## 结论（先看）

| 问题 | 答案 |
|---|---|
| 能不能用「域名下面某个地址」访问？ | **能。** 这是 **URL 路径**，不是 COS/服务器上的文件夹。 |
| 自定义域名怎么挂？ | **1 个自定义域名只能绑定 1 个服务**。绑到 `test-sever` 后，该域名全部流量进本容器。 |
| 根域名 `linyitech.cloud` 现在怎样？ | DNS 仍是 **A → 43.136.114.251（VPS）**，根站是 **赛轨**；`/qmyx/` 是 VPS 上另一套 Express。**还没真正进云托管。** |
| 推荐做法 | 绑定子域 **`qmyx.linyitech.cloud` → `test-sever`**，根域留给赛轨。 |

绑定成功后可用地址：

| 用途 | URL |
|---|---|
| 运营台 | `https://qmyx.linyitech.cloud/qmyx/` |
| API | `https://qmyx.linyitech.cloud/api/traffic/v1/...` |
| 探活 | `https://qmyx.linyitech.cloud/ping` |
| 支付回调 | `https://qmyx.linyitech.cloud/api/traffic/v1/pay/wx/notify` |
| 根路径 | `https://qmyx.linyitech.cloud/` → 302 到 `/qmyx/` |

小程序业务请求继续走 `wx.cloud.callContainer`（不依赖自定义域名）；自定义域名给 **运营台 / 支付回调 / HTTPS 回退** 用。

若坚持把 **`linyitech.cloud` 整域**绑到 `test-sever`：路径同样可用，但 **赛轨官网会被顶掉**（根路径变成运营台跳转）。不推荐。

---

## 目标环境

| 项 | 值 |
|---|---|
| Git | `YeahZac/TravelandClothes` · `main` |
| 云托管服务 | `test-sever` |
| 环境 ID | `prod-d7gnz9s0j20275c05` |
| 数据库 | `travel_clothes`（CynosDB，新表与旧文旅表共存） |
| COS | `7072-prod-d7gnz9s0j20275c05-1492159324` · 前缀 `qmyx/` |
| 自定义域名（推荐） | `qmyx.linyitech.cloud` |

---

## A. 代码推到最新 main

```bash
git push origin main
```

云托管控制台 → 服务 `test-sever` → 用该仓库 Dockerfile **重新部署**（覆盖旧版本）。  
确认 **实例副本最小值 = 1**。

---

## B. 自定义域名落地（必须做 DNS，否则永远打到 VPS）

### B1. 控制台绑定

1. 微信云托管 → **服务管理** → `test-sever` → **自定义域名** → 绑定  
2. 域名填：`qmyx.linyitech.cloud`（推荐）  
3. HTTPS：上传已备案域名的 **nginx 格式**证书 + 私钥  
4. 确认关联服务是 **`test-sever`**（不是 `linyi-online`）  
5. 绑定后列表会出现 **CNAME 目标**（形如 `xxx.wxcloudrun.com` / `xxx.tcloudbase.com`）——**照抄**

若你已误绑根域 `linyitech.cloud`：解绑后改绑 `qmyx.linyitech.cloud`，避免赛轨被覆盖。

### B2. DNS（DNSPod / 腾讯云 DNS）

当前根域：

```text
linyitech.cloud  A  43.136.114.251   ← VPS，保留给赛轨
```

新增（或修改）子域：

```text
主机记录: qmyx
记录类型: CNAME
记录值:   <控制台返回的 CNAME>
```

**不要**把根域 A 记录改成云托管，除非你确定放弃根站赛轨。

生效后自检：

```bash
dig +short qmyx.linyitech.cloud CNAME
# 应看到云托管 CNAME，而不是 43.136.114.251

curl -sI https://qmyx.linyitech.cloud/ping
curl -s  https://qmyx.linyitech.cloud/api/traffic/v1/pay/wx/status
# 浏览器打开 https://qmyx.linyitech.cloud/qmyx/
```

### B3. 云托管环境变量（控制台注入真实值）

`${...}` 占位 **不会**自动展开，支付回调必须写死完整 URL：

| 变量 | 建议值 |
|---|---|
| `PUBLIC_BASE_URL` | `https://qmyx.linyitech.cloud` |
| `WX_PAY_NOTIFY_URL` | `https://qmyx.linyitech.cloud/api/traffic/v1/pay/wx/notify` |
| `DB_PASSWORD` | CynosDB root 密码 |
| `WX_SECRET` | 小程序 AppSecret |
| `COS_SECRET_ID` / `COS_SECRET_KEY` | 无默认角色时必填 |
| `WX_API_V3_KEY` / `WX_MCH_SERIAL_NO` | 商户平台 |
| `WX_MCH_KEY_PEM` / `WX_MCH_CERT_PEM` | PEM 全文；换行可用 `\n`；**变量名勿尾随空格** |

改完环境变量后 **滚动重启 / 重新部署** 一次才生效。

微信商户平台把「支付回调 URL」配成与 `WX_PAY_NOTIFY_URL` 完全一致。

---

## C. 数据库与 COS

启动时自动执行 `sql/schema.mysql.sql`，在 `travel_clothes` 建全民优享表  
（`user_account` / `product` / `redeem_order` …）。**不删**旧文旅表。

COS 对象建议统一前缀 `qmyx/`，与 `COS_PUBLIC_BASE` 拼公开 URL。

---

## D. 小程序

`全民优享`：`wx.cloud.callContainer`，`env=prod-d7gnz9s0j20275c05`，`X-WX-SERVICE: test-sever`。  
小程序后台开通云托管并关联该环境。HTTPS 回退基址见 `src/api/request.js` 的 `CMS_BASE`。

---

## E. 关掉 VPS 双跑（切完 DNS 再做）

`qmyx.linyitech.cloud` 已稳定指向云托管、运营台与支付回调验证通过后：

1. VPS Nginx **去掉** `/qmyx/`、`/api/traffic/` 反代（或整站停掉 :3100 上的旧 traffic-cms）  
2. 根域 `linyitech.cloud` 继续只跑赛轨  
3. 勿再把支付回调指回 `https://linyitech.cloud/...`（除非你真的把根域绑到了云托管）

---

## F. 验收清单

```text
GET  https://qmyx.linyitech.cloud/ping
GET  https://qmyx.linyitech.cloud/api/traffic/v1/pay/wx/status
GET  https://qmyx.linyitech.cloud/api/traffic/v1/catalog
打开 https://qmyx.linyitech.cloud/qmyx/          → 运营台
打开 https://linyitech.cloud/                   → 仍是赛轨
小程序任务/商城/下单                             → callContainer 通
微信支付一笔测试单                               → 商户平台收到 notify
```

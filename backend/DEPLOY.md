# 微信云托管部署指南

## 一、创建 MySQL 数据库

1. 打开微信开发者工具 → **云托管** → **数据库**
2. 点击 **创建数据库实例**
   - 数据库类型：MySQL
   - 版本：MySQL 8.0
   - 规格：入门级（1核2G）即可，后续可扩容
   - 设置 root 密码并记录
3. 创建完成后，记录连接信息：
   - **内网地址**（DB_HOST）：`xxx.cdb.internal`（云托管容器用内网地址）
   - **端口**（DB_PORT）：`3306`
   - **用户名**（DB_USER）：`root`
   - **密码**（DB_PASSWORD）：你设置的密码

## 二、初始化表结构

1. 在云托管数据库控制台打开 **phpMyAdmin** 或命令行
2. 执行 `backend/database/schema.sql` 中的全部 SQL
3. 确认表已创建：`SHOW TABLES;`（应看到 14 张表）

## 三、部署后端服务

1. 将代码推送到 GitHub（`https://github.com/YeahZac/TravelandClothes.git`）
2. 微信开发者工具 → **云托管** → **服务列表** → **新建服务**
   - 服务名称：`travel-clothes-backend`
   - 代码来源：GitHub 仓库 `YeahZac/TravelandClothes`
   - 分支：`main`
   - 端口：`3000`
3. **环境变量**设置：
   ```
   DB_HOST=xxx.cdb.internal
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=你的数据库密码
   DB_NAME=travel_clothes
   WX_APPID=你的小程序appid
   WX_SECRET=你的小程序secret
   ```
4. 点击 **部署**，等待构建完成
5. 部署成功后获得服务访问域名，如：
   `https://travel-clothes-backend-xxx.cdn.bspapp.com`

## 四、小程序对接

在小程序中调用后端 API：

```js
// 小程序请求示例
const BASE_URL = 'https://travel-clothes-backend-xxx.cdn.bspapp.com'

wx.request({
  url: `${BASE_URL}/api/member/${userId}`,
  method: 'GET',
  success(res) {
    console.log(res.data)
  }
})
```

> **注意**：云托管服务与小程序之间可通过内网调用，无需配置合法域名。
> 在 `app.js` 中初始化时使用云托管内网调用更安全。

## 五、数据库表关系

```
users (用户)
  └─ members (会员成长/等级)
       ├─ growth_records (成长值流水)
       ├─ annual_cards (年卡)
       │    └─ verifications (核销记录)
       ├─ passports (护照)
       │    └─ stamps (盖章)
       ├─ badges (勋章)
       ├─ orders (订单)
       └─ posts (动态)
            └─ likes (点赞)

scenes (景区)
routes (线路)
card_skus (年卡SKU)
benefits (权益配置)
```

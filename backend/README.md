# 同袍会会员体系后端

旅行与汉服平台后端服务，基于 Node.js + Express + MySQL。

## 技术栈
- Express 4.x
- MySQL 5.7+/8.0 (mysql2)
- 微信小程序登录 (code2session)

## 目录结构
```
backend/
├── database/schema.sql      # 数据库建表脚本
├── src/
│   ├── app.js               # Express 入口
│   ├── config/database.js   # MySQL 连接池
│   ├── routes/              # API 路由
│   │   ├── user.js          # 用户登录/资料
│   │   ├── member.js        # 会员成长值/等级
│   │   ├── card.js          # 年卡购买/核销/续费/转赠
│   │   ├── passport.js      # 集章护照/勋章
│   │   ├── order.js         # 订单/支付/退款
│   │   └── post.js          # 动态/打卡/点赞
│   └── utils/response.js    # 响应格式/成长值配置
└── .env.example             # 环境变量模板
```

## API 接口

### 用户
- `POST /api/user/login` 微信登录
- `POST /api/user/profile` 更新资料
- `GET /api/user/:userId` 查询用户

### 会员（成长值+等级）
- `GET /api/member/:userId` 会员信息
- `POST /api/member/growth` 累计成长值
- `GET /api/member/:userId/records` 成长值流水
- `POST /api/member/check-dormant` 休眠检查

### 年卡
- `GET /api/card/skus` SKU列表
- `POST /api/card/purchase` 购买年卡
- `GET /api/card/:userId` 我的年卡
- `POST /api/card/verify` 核销年卡
- `POST /api/card/renew` 续费
- `POST /api/card/transfer` 转赠

### 集章护照
- `GET /api/passport/:userId` 我的护照+进度
- `POST /api/passport/stamp` 盖章
- `POST /api/passport/badge/claim` 领取实体勋章
- `GET /api/passport/:userId/badges` 我的勋章

### 订单
- `POST /api/order/create` 创建订单
- `POST /api/order/pay-callback` 支付回调
- `GET /api/order/:userId` 我的订单
- `POST /api/order/refund` 退款

### 动态
- `POST /api/post/create` 发布动态
- `GET /api/post/` 动态列表
- `POST /api/post/like` 点赞
- `POST /api/post/feature` 官方收录

## 本地开发
```bash
cd backend
cp .env.example .env   # 填入数据库配置
npm install
npm run dev
```

## 数据库初始化
```bash
mysql -u root -p < database/schema.sql
```

## 部署到微信云托管
1. 在云托管控制台创建 MySQL 数据库实例
2. 将数据库连接信息填入环境变量
3. 容器构建并部署
4. 执行 `database/schema.sql` 初始化表结构

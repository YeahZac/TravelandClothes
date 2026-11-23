# 年会抽奖 · 腾讯云短信与部署说明

## 入口

| 端 | 路径 |
|----|------|
| 主办方后台 | `https://你的域名/gala-admin/` |
| PC 大屏 | 后台点「打开大屏」，或 `/gala-screen/?code=场次码&token=控场token` |
| 小程序签到 | 扫大屏二维码 → `pages/gala/checkin`（scene=`g`+场次码） |

## 环境变量（勿提交 Git）

在云托管 / 本地 `.env` 配置：

```bash
# 腾讯云短信（主办方手机号登录）
SMS_SECRET_ID=AKIDxxxx
SMS_SECRET_KEY=xxxx
SMS_SDK_APP_ID=1400xxxxxx
SMS_SIGN_NAME=你的签名
SMS_TEMPLATE_ID=1234567
SMS_REGION=ap-guangzhou

# 可选
SMS_DEV_CODE=888888
GALA_HOST_TTL_DAYS=30
```

### 腾讯云控制台你需要准备

1. **访问管理 CAM**：创建子账号，授予 `QcloudSMSFullAccess`（或更细的短信发送权限），拿到 `SecretId` / `SecretKey`。
2. **短信 SmsSdkAppId**：短信控制台 → 应用管理 → SdkAppId。
3. **短信签名**：国内短信签名（建议与主体「海川」一致），审核通过后填 `SMS_SIGN_NAME`。
4. **验证码模板**：内容建议  
   `您的验证码是{1}，{2}分钟内有效。如非本人操作请忽略。`  
   审核通过后填模板 ID 到 `SMS_TEMPLATE_ID`。

未配置短信时：服务日志会打印验证码，可用 `888888`（或 `SMS_DEV_CODE`）登录联调。

## API 前缀

`/api/gala/v1/*`（与能量用户 token 隔离，主办方用短信会话 token）。

## 主题规则

- 场次奖项数 ≤5：PC 抽奖/结果用科技蓝
- 场次奖项数 >5：用深色金喜报
- 签到上墙固定红金灯笼 + 弹幕飘屏

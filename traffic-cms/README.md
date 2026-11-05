# traffic-cms

全民优享流量产品壳层配置服务（与同袍会文旅库解耦）。

## 启动

```bash
cd traffic-cms
npm install
npm start
# http://127.0.0.1:3100/admin/
```

## 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/traffic/v1/bootstrap?platform=mp-weixin` | 小程序启动配置 |
| GET | `/api/traffic/v1/config/:pageKey` | 单页配置 |
| GET/PUT | `/api/traffic/v1/admin/config` | 草稿读写 |
| POST | `/api/traffic/v1/admin/publish` | 发布 |
| POST | `/api/traffic/v1/admin/upload` | 上传图片 |

存储：`data/draft.json` / `data/published.json`；图片：`uploads/`。

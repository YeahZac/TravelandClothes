# 袍旅 · 文旅票务原型 Demo

移动端网页原型：景区门票 / 汉服活动 / 同袍会会员与徽章 / 套票组合，含购物车与模拟支付全流程。

## 在线官网

**正式地址（GitHub Pages）：**  
https://yeahzac.github.io/TravelandClothes/

**当前可直接打开（镜像预览）：**  
https://htmlpreview.github.io/?https://github.com/YeahZac/TravelandClothes/blob/main/index.html

仓库：https://github.com/YeahZac/TravelandClothes

> GitHub Actions 已配置自动部署。若正式地址仍为 404：打开仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**，保存后重新跑一次 workflow「Deploy GitHub Pages」。

本地预览：

```bash
python3 -m http.server 8765
```

浏览器打开 `http://127.0.0.1:8765/`。

## 云托管素材

微信云托管存储桶：`7072-prod-d7gnz9s0j20275c05-1492159324`（上海）  
CDN 基址：`https://7072-prod-d7gnz9s0j20275c05-1492159324.tcb.qcloud.la/mock/`  
（直链 `*.cos.ap-shanghai.myqcloud.com` 为私有读，请用上述 CDN 域名）

## 功能范围

- 景区门票（白云山、陈家祠、长隆、余荫山房、南沙湿地）
- 汉服节活动票
- 超值套票组合
- 同袍会会员档位 + 徽章加购
- 购物车 → 确认订单 → 模拟支付 → 电子票码

支付为演示流程，不会真实扣款；数据保存在浏览器 localStorage。

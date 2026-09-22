# 袍旅 · 文旅票务原型 Demo

移动端网页原型：景区门票 / 汉服活动 / 同袍会会员与徽章 / 套票组合，含购物车与模拟支付全流程。

## 在线官网

正式预览（GitHub Pages）：

**https://yeahzac.github.io/TravelandClothes/**

仓库地址：https://github.com/YeahZac/TravelandClothes

> 若打开 404：到仓库 Settings → Pages，确认 Source 为 GitHub Actions，并允许 Actions 运行一次 `Deploy GitHub Pages`。

本地预览：

```bash
python3 -m http.server 8765
```

浏览器打开 `http://127.0.0.1:8765/`，手机同 Wi‑Fi 可用电脑局域网 IP 访问。

## 功能范围

- 景区门票（白云山、陈家祠、长隆、余荫山房、南沙湿地）
- 汉服节活动票
- 超值套票组合
- 同袍会会员档位 + 徽章加购
- 购物车 → 确认订单 → 模拟支付 → 电子票码

支付为演示流程，不会真实扣款；数据保存在浏览器 localStorage。

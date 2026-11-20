/**
 * 云托管入口：强制 0.0.0.0，listen 后立刻异步暖库。
 * Dockerfile CMD 指向本文件。
 *
 * 注意：若控制台「实例副本最小值=0」，容器会缩到 0，看起来像「打开地址才启动」——
 * 那是平台冷启，不是本进程懒监听。请保持 minNum/minReplicas=1。
 */
process.env.CMS_BIND_HOST = process.env.CMS_BIND_HOST || '0.0.0.0'
// 默认 0：listen 后立刻 bootDb，避免业务接口要等 3s 才就绪
process.env.CMS_DEFER_BOOT_MS = process.env.CMS_DEFER_BOOT_MS || '0'
process.env.CMS_AUTO_START = '1'
require('./server')

/**
 * 云托管入口：强制 0.0.0.0 + 延迟 DB 启动。
 * Dockerfile CMD 指向本文件。
 */
process.env.CMS_BIND_HOST = process.env.CMS_BIND_HOST || '0.0.0.0'
process.env.CMS_DEFER_BOOT_MS = process.env.CMS_DEFER_BOOT_MS || '3000'
process.env.CMS_AUTO_START = '1'
require('./server')

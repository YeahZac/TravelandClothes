/** 兼容旧 seed / 脚本：转发到 configService */
const configService = require('./services/configService')

module.exports = {
  getPublished: configService.getPublished,
  getDraft: configService.getDraft,
  saveDraft: configService.saveDraft,
  publish: configService.publish,
  absolutize: configService.absolutize,
}

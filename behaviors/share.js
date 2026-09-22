const { showMenus } = require('../utils/share')

module.exports = Behavior({
  onShow() {
    showMenus()
  }
})

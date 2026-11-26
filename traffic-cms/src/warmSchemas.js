/**
 * 启动期一次性 async 建表/补列，禁止请求路径 deasync DDL。
 */
const dbMod = require('./db')

async function run(sql) {
  try {
    await dbMod.queryAsync(sql)
  } catch (e) {
    if (
      e &&
      (e.code === 'ER_TABLE_EXISTS_ERROR' ||
        e.code === 'ER_DUP_FIELDNAME' ||
        e.code === 'ER_DUP_KEYNAME' ||
        e.code === 'ER_DUP_ENTRY' ||
        /Duplicate|already exists/i.test(e.message || ''))
    ) {
      return
    }
    console.warn('[warmSchema]', (e && e.message) || e, String(sql).slice(0, 60).replace(/\s+/g, ' '))
  }
}

async function addCol(table, col, def) {
  try {
    const [rows] = await dbMod.queryAsync(
      `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, col]
    )
    if (rows && rows[0]) return
  } catch (_) {
    /* 探测失败则尝试 ADD，靠 DUP 忽略 */
  }
  await run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
}

async function columnExists(table, col) {
  try {
    const [rows] = await dbMod.queryAsync(
      `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, col]
    )
    return !!(rows && rows[0])
  } catch (_) {
    return false
  }
}

/** auth_token：统一为 expires_at（与 authService 一致） */
async function migrateAuthTokenExpiresColumn() {
  const hasNew = await columnExists('auth_token', 'expires_at')
  const hasOld = await columnExists('auth_token', 'expire_at')
  if (hasNew && !hasOld) return
  if (!hasNew && hasOld) {
    await run(
      `ALTER TABLE auth_token CHANGE COLUMN expire_at expires_at VARCHAR(40) NOT NULL DEFAULT ''`
    )
    console.log('[warmSchema] auth_token.expire_at → expires_at')
    return
  }
  if (hasNew && hasOld) {
    await run(
      `UPDATE auth_token SET expires_at=expire_at
       WHERE (expires_at IS NULL OR expires_at='') AND expire_at IS NOT NULL AND expire_at!=''`
    )
    await run(`ALTER TABLE auth_token DROP COLUMN expire_at`)
    console.log('[warmSchema] auth_token dropped legacy expire_at')
  }
}

async function warmMysqlExtras() {
  // lottery
  await addCol('lottery_draw', 'action_id', "VARCHAR(64) NOT NULL DEFAULT ''")
  await addCol('lottery_draw', 'prize_type', "VARCHAR(32) NOT NULL DEFAULT ''")
  await addCol('lottery_draw', 'product_id', "VARCHAR(64) NOT NULL DEFAULT ''")
  await addCol('lottery_prize', 'rarity', "VARCHAR(8) NOT NULL DEFAULT 'N'")
  await addCol('lottery_prize', 'pool_id', "VARCHAR(64) NOT NULL DEFAULT 'default'")
  await addCol('product', 'kind', "VARCHAR(32) NOT NULL DEFAULT ''")
  await addCol('user_account', 'risk_flag', 'INT NOT NULL DEFAULT 0')
  await addCol('user_account', 'risk_score', 'INT NOT NULL DEFAULT 0')
  await addCol('user_account', 'risk_level', "VARCHAR(16) NOT NULL DEFAULT 'clean'")
  await addCol('user_account', 'risk_factors_json', 'TEXT')
  await addCol('user_account', 'risk_scored_at', "VARCHAR(40) NOT NULL DEFAULT ''")
  await run(`CREATE TABLE IF NOT EXISTS user_promoter (
    user_id INT NOT NULL PRIMARY KEY,
    real_name VARCHAR(64) NOT NULL DEFAULT '',
    school VARCHAR(128) NOT NULL DEFAULT '',
    region VARCHAR(128) NOT NULL DEFAULT '',
    campus VARCHAR(128) NOT NULL DEFAULT '',
    note VARCHAR(512) NOT NULL DEFAULT '',
    status VARCHAR(16) NOT NULL DEFAULT 'on',
    bound_at VARCHAR(40) NOT NULL DEFAULT '',
    updated_at VARCHAR(40) NOT NULL DEFAULT ''
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await run(`CREATE TABLE IF NOT EXISTS promoter_settlement (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount_cent INT NOT NULL DEFAULT 0,
    method VARCHAR(32) NOT NULL DEFAULT 'wechat',
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    apply_at VARCHAR(40) NOT NULL DEFAULT '',
    settle_at VARCHAR(40) NOT NULL DEFAULT '',
    period_from VARCHAR(16) NOT NULL DEFAULT '',
    period_to VARCHAR(16) NOT NULL DEFAULT '',
    invite_count_snapshot INT NOT NULL DEFAULT 0,
    valid_invite_snapshot INT NOT NULL DEFAULT 0,
    unit_price_cent INT NOT NULL DEFAULT 0,
    note VARCHAR(512) NOT NULL DEFAULT '',
    reject_reason VARCHAR(256) NOT NULL DEFAULT '',
    operator VARCHAR(64) NOT NULL DEFAULT '',
    finance_id BIGINT NOT NULL DEFAULT 0,
    created_at VARCHAR(40) NOT NULL DEFAULT '',
    updated_at VARCHAR(40) NOT NULL DEFAULT '',
    KEY idx_promoter_settle_user (user_id, status),
    KEY idx_promoter_settle_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await run(`CREATE TABLE IF NOT EXISTS lottery_win_claim (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    claim_token VARCHAR(64) NOT NULL,
    draw_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    prize_id VARCHAR(64) NOT NULL,
    sku_id VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    expire_at VARCHAR(40) NOT NULL,
    order_no VARCHAR(64) NOT NULL DEFAULT '',
    created_at VARCHAR(40) NOT NULL,
    UNIQUE KEY uk_claim_token (claim_token),
    KEY idx_claim_user (user_id, status)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS user_lottery_pity (
    user_id INT NOT NULL,
    pool_id VARCHAR(64) NOT NULL DEFAULT 'default',
    miss_streak INT NOT NULL DEFAULT 0,
    updated_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (user_id, pool_id)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS lottery_pool (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'on',
    start_at VARCHAR(40) NOT NULL DEFAULT '',
    end_at VARCHAR(40) NOT NULL DEFAULT '',
    updated_at VARCHAR(40) NOT NULL
  )`)
  await run(`CREATE TABLE IF NOT EXISTS lottery_action_lock (
    user_id INT NOT NULL,
    action_id VARCHAR(64) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (user_id, action_id)
  )`)
  try {
    await dbMod.queryAsync(
      `INSERT IGNORE INTO lottery_pool (id,name,status,start_at,end_at,updated_at) VALUES ('default','默认奖池','on','','',?)`,
      [dbMod.nowIso()]
    )
  } catch (_) {}

  // flash
  await run(`CREATE TABLE IF NOT EXISTS flash_slot (
    id VARCHAR(64) NOT NULL PRIMARY KEY, title VARCHAR(128) NOT NULL,
    tag VARCHAR(32) NOT NULL DEFAULT '', start_hm VARCHAR(8) NOT NULL DEFAULT '00:00',
    end_hm VARCHAR(8) NOT NULL DEFAULT '00:02', hour_num INT NOT NULL DEFAULT 0,
    product_id VARCHAR(64) NOT NULL DEFAULT '', pay_energy INT NOT NULL DEFAULT 0,
    pay_cash_cent INT NOT NULL DEFAULT 0, window_sec INT NOT NULL DEFAULT 120,
    daily_stock INT NOT NULL DEFAULT 9999, sort_order INT NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'off', updated_at VARCHAR(40) NULL
  )`)
  await run(`CREATE TABLE IF NOT EXISTS flash_redeem_log (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, slot_id VARCHAR(64) NOT NULL,
    user_id INT NOT NULL, product_id VARCHAR(64) NOT NULL, day VARCHAR(16) NOT NULL,
    created_at VARCHAR(40) NOT NULL, order_no VARCHAR(64) NOT NULL DEFAULT '',
    KEY idx_flash_log_day (day, slot_id)
  )`)
  await addCol('flash_slot', 'hour_num', 'INT NOT NULL DEFAULT 0')
  await addCol('flash_slot', 'pay_energy', 'INT NOT NULL DEFAULT 0')
  await addCol('flash_slot', 'pay_cash_cent', 'INT NOT NULL DEFAULT 0')
  await addCol('flash_slot', 'window_sec', 'INT NOT NULL DEFAULT 120')
  await addCol('flash_redeem_log', 'order_no', "VARCHAR(64) NOT NULL DEFAULT ''")
  await run(`CREATE UNIQUE INDEX uk_flash_log_user_slot_day ON flash_redeem_log(user_id, slot_id, day)`)

  // festival
  await run(`CREATE TABLE IF NOT EXISTS festival_ticket (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ticket_no VARCHAR(40) NOT NULL, verify_code VARCHAR(64) NOT NULL,
    order_no VARCHAR(64) NOT NULL, user_id BIGINT NOT NULL, sku_id VARCHAR(64) NOT NULL,
    sku_name VARCHAR(128) NOT NULL DEFAULT '', day_label VARCHAR(32) NOT NULL DEFAULT '',
    audience VARCHAR(16) NOT NULL DEFAULT 'adult', visitor VARCHAR(64) NOT NULL DEFAULT '',
    phone VARCHAR(20) NOT NULL DEFAULT '', status VARCHAR(16) NOT NULL DEFAULT 'valid',
    verified_at VARCHAR(40) NOT NULL DEFAULT '', verified_by VARCHAR(64) NOT NULL DEFAULT '',
    created_at VARCHAR(40) NOT NULL,
    UNIQUE KEY uk_festival_ticket_no (ticket_no),
    UNIQUE KEY uk_festival_verify (verify_code),
    KEY idx_festival_ticket_user (user_id),
    KEY idx_festival_ticket_order (order_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await run(`CREATE TABLE IF NOT EXISTS festival_issue_lock (
    order_no VARCHAR(64) NOT NULL PRIMARY KEY,
    created_at VARCHAR(40) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  // cart / feedback / task / tree / checkin / steps / auth
  await run(`CREATE TABLE IF NOT EXISTS user_cart (
    user_id INT NOT NULL, product_id VARCHAR(64) NOT NULL, qty INT NOT NULL DEFAULT 1,
    updated_at VARCHAR(40) NOT NULL, PRIMARY KEY (user_id, product_id), KEY idx_cart_user (user_id)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS user_feedback (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL DEFAULT 0,
    contact VARCHAR(128) NOT NULL DEFAULT '', content TEXT NOT NULL, images_json TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open', admin_reply TEXT,
    created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL,
    replied_at VARCHAR(40) NOT NULL DEFAULT '',
    KEY idx_fb_user (user_id), KEY idx_fb_status (status), KEY idx_fb_created (created_at)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS task_action_event (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL,
    action_key VARCHAR(32) NOT NULL, day_key VARCHAR(10) NOT NULL, created_at VARCHAR(40) NOT NULL,
    KEY idx_task_action_user_day (user_id, action_key, day_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await addCol('task_def', 'target_count', 'INT NOT NULL DEFAULT 1')
  await addCol('task_def', 'reward_gift_id', "VARCHAR(64) NOT NULL DEFAULT ''")
  await addCol('task_def', 'desc_text', "VARCHAR(256) NOT NULL DEFAULT ''")

  await addCol('jar_state', 'seed_id', "VARCHAR(64) NOT NULL DEFAULT 'seed_elm'")
  await addCol('jar_state', 'phase', "VARCHAR(32) NOT NULL DEFAULT 'seed'")
  await addCol('jar_state', 'nutrition', 'INT NOT NULL DEFAULT 0')
  await addCol('jar_state', 'tree_started_at', "VARCHAR(40) NOT NULL DEFAULT ''")
  await addCol('jar_state', 'tree_cycle', 'INT NOT NULL DEFAULT 1')
  await addCol('jar_state', 'fertilize_ready_at', 'BIGINT NOT NULL DEFAULT 0')
  await addCol('jar_state', 'light_ready_at', 'BIGINT NOT NULL DEFAULT 0')
  await run(`CREATE TABLE IF NOT EXISTS tree_drop (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, owner_id INT NOT NULL, day_key VARCHAR(16) NOT NULL,
    amount INT NOT NULL DEFAULT 0, remaining INT NOT NULL DEFAULT 0, created_at VARCHAR(40) NOT NULL,
    UNIQUE KEY uk_owner_day (owner_id, day_key)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS user_seed (
    user_id INT NOT NULL, seed_id VARCHAR(64) NOT NULL, qty INT NOT NULL DEFAULT 0,
    updated_at VARCHAR(40) NOT NULL, PRIMARY KEY (user_id, seed_id)
  )`)

  await run(`CREATE TABLE IF NOT EXISTS user_checkin (
    user_id INT NOT NULL, day_key VARCHAR(16) NOT NULL, streak INT NOT NULL DEFAULT 1,
    reward_json TEXT, source VARCHAR(32) NOT NULL DEFAULT 'checkin',
    created_at VARCHAR(40) NOT NULL, PRIMARY KEY (user_id, day_key), KEY idx_checkin_day (day_key)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS user_steps_day (
    user_id INT NOT NULL, day_key VARCHAR(16) NOT NULL, steps INT NOT NULL DEFAULT 0,
    source VARCHAR(32) NOT NULL DEFAULT 'report', claimed_json VARCHAR(512) NOT NULL DEFAULT '[]',
    energy_claimed INT NOT NULL DEFAULT 0, updated_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (user_id, day_key)
  )`)
  await run(`CREATE TABLE IF NOT EXISTS auth_token (
    token VARCHAR(128) NOT NULL PRIMARY KEY, user_id INT NOT NULL,
    created_at VARCHAR(40) NOT NULL, expires_at VARCHAR(40) NOT NULL DEFAULT '',
    KEY idx_auth_token_user (user_id)
  )`)
  // 历史 schema 用 expire_at，鉴权读写 expires_at —— 启动时对齐列名
  await migrateAuthTokenExpiresColumn()

  // ops extras
  await addCol('redeem_order', 'tracking_no', "VARCHAR(64) NOT NULL DEFAULT ''")
  await addCol('redeem_order', 'carrier', "VARCHAR(64) NOT NULL DEFAULT ''")
  await addCol('redeem_order', 'shipped_at', "VARCHAR(40) NOT NULL DEFAULT ''")
  await addCol('redeem_order', 'entry_from', "VARCHAR(64) NOT NULL DEFAULT ''")
  await addCol('redeem_order', 'wx_shipping_status', "VARCHAR(16) NOT NULL DEFAULT 'none'")
  await addCol('redeem_order', 'wx_shipping_msg', "VARCHAR(512) NOT NULL DEFAULT ''")
  await addCol('redeem_order', 'wx_shipping_at', "VARCHAR(40) NOT NULL DEFAULT ''")
  await run(`ALTER TABLE admin_audit MODIFY COLUMN detail_json MEDIUMTEXT NOT NULL`)

  await run(`CREATE TABLE IF NOT EXISTS wallet_ledger (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, delta INT NOT NULL,
    balance_after INT NOT NULL DEFAULT 0, direction VARCHAR(16) NOT NULL DEFAULT 'in',
    note VARCHAR(191) NOT NULL DEFAULT '', ref_type VARCHAR(32) NOT NULL DEFAULT '',
    ref_id VARCHAR(64) NOT NULL DEFAULT '', created_at VARCHAR(40) NOT NULL,
    KEY idx_wl_user (user_id), KEY idx_wl_created (created_at)
  )`)
}

async function warmAllSchemasAsync() {
  if (dbMod.DIALECT !== 'mysql') {
    dbMod.markSchemasWarmed()
    return { ok: true, skipped: 'sqlite' }
  }
  // 已有服务 async DDL
  const steps = [
    ['article', () => require('./services/articleService').ensureSchemaAsync()],
    ['flash', () => require('./services/flashRedeemService').ensureSchemaAsync()],
    ['mediaBlob', () => require('./services/mediaBlobService').ensureTableAsync()],
    ['gala', () => require('./services/galaService').ensureSchemaAsync()],
  ]
  for (const [name, fn] of steps) {
    try {
      await fn()
    } catch (e) {
      console.warn('[warmSchema]', name, e && e.message)
    }
  }
  await warmMysqlExtras()
  // 标记各服务 schemaReady，避免请求路径再进 DDL
  const markers = [
    () => require('./services/lotteryService').ensureSchema(),
    () => require('./services/flashRedeemService').ensureSchema(),
    () => require('./services/festivalTicketService').ensureSchema(),
    () => require('./services/cartService').ensureSchema(),
    () => require('./services/feedbackService').ensureSchema(),
    () => require('./services/taskService').ensureSchema(),
    () => require('./services/treeService').ensureSchema(),
    () => require('./services/articleService').ensureSchema(),
    () => require('./services/opsService').ensureSchemaExtras(),
    () => require('./services/currencyService').ensureWalletLedger(),
    () => require('./services/checkinService').ensureTables(),
    () => require('./services/stepsService').ensureTables(),
    () => require('./services/galaService').ensureSchema(),
    () => require('./services/promoterService').ensureSchema(),
    () => require('./services/promoterService').ensureSettlementSchema(),
    () => require('./services/riskService').ensureSchema(),
  ]
  for (const fn of markers) {
    try {
      fn()
    } catch (e) {
      console.warn('[warmSchema] mark', e && e.message)
    }
  }
  dbMod.markSchemasWarmed()
  console.log('[warmSchema] all schemas warmed')
  return { ok: true }
}

module.exports = { warmAllSchemasAsync }

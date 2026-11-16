-- =============================================================================
-- 全民优享 · 补齐「主 schema 漏掉、曾由代码懒建」的表
-- 库名：travel_clothes（腾讯云 CynosDB，与同袍会旧表共存）
-- 用法：在该库执行本文件；全程 IF NOT EXISTS / 可重复执行
-- 主文件仍是 schema.mysql.sql；本文件只补缺口
-- =============================================================================
SET NAMES utf8mb4;
USE travel_clothes;

-- ---------- 抽奖扩展 ----------
CREATE TABLE IF NOT EXISTS lottery_win_claim (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_lottery_pity (
  user_id INT NOT NULL,
  pool_id VARCHAR(64) NOT NULL DEFAULT 'default',
  miss_streak INT NOT NULL DEFAULT 0,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, pool_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lottery_pool (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'on',
  start_at VARCHAR(40) NOT NULL DEFAULT '',
  end_at VARCHAR(40) NOT NULL DEFAULT '',
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lottery_action_lock (
  user_id INT NOT NULL,
  action_id VARCHAR(64) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, action_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO lottery_pool (id, name, status, start_at, end_at, updated_at)
VALUES ('default', '默认奖池', 'on', '', '', UTC_TIMESTAMP());

-- ---------- 准点兑换 ----------
CREATE TABLE IF NOT EXISTS flash_slot (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  title VARCHAR(128) NOT NULL,
  tag VARCHAR(32) NOT NULL DEFAULT '',
  start_hm VARCHAR(8) NOT NULL DEFAULT '00:00',
  end_hm VARCHAR(8) NOT NULL DEFAULT '00:02',
  hour_num INT NOT NULL DEFAULT 0,
  product_id VARCHAR(64) NOT NULL DEFAULT '',
  pay_energy INT NOT NULL DEFAULT 0,
  pay_cash_cent INT NOT NULL DEFAULT 0,
  window_sec INT NOT NULL DEFAULT 120,
  daily_stock INT NOT NULL DEFAULT 9999,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'off',
  updated_at VARCHAR(40) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS flash_redeem_log (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slot_id VARCHAR(64) NOT NULL,
  user_id INT NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  day VARCHAR(16) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  order_no VARCHAR(64) NOT NULL DEFAULT '',
  KEY idx_flash_log_day (day, slot_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 若库内已有重复 (user_id,slot_id,day) 行，本索引会失败；可先查重再建
-- CREATE UNIQUE INDEX uk_flash_log_user_slot_day ON flash_redeem_log(user_id, slot_id, day);

-- ---------- 汉服节票 ----------
CREATE TABLE IF NOT EXISTS festival_ticket (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_no VARCHAR(40) NOT NULL,
  verify_code VARCHAR(64) NOT NULL,
  order_no VARCHAR(64) NOT NULL,
  user_id BIGINT NOT NULL,
  sku_id VARCHAR(64) NOT NULL,
  sku_name VARCHAR(128) NOT NULL DEFAULT '',
  day_label VARCHAR(32) NOT NULL DEFAULT '',
  audience VARCHAR(16) NOT NULL DEFAULT 'adult',
  visitor VARCHAR(64) NOT NULL DEFAULT '',
  phone VARCHAR(20) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'valid',
  verified_at VARCHAR(40) NOT NULL DEFAULT '',
  verified_by VARCHAR(64) NOT NULL DEFAULT '',
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uk_festival_ticket_no (ticket_no),
  UNIQUE KEY uk_festival_verify (verify_code),
  KEY idx_festival_ticket_user (user_id),
  KEY idx_festival_ticket_order (order_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS festival_issue_lock (
  order_no VARCHAR(64) NOT NULL PRIMARY KEY,
  created_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 购物车 / 反馈 / 树 / 登录态 / 流水 ----------
CREATE TABLE IF NOT EXISTS user_cart (
  user_id INT NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, product_id),
  KEY idx_cart_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_feedback (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 0,
  contact VARCHAR(128) NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  images_json TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  admin_reply TEXT,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  replied_at VARCHAR(40) NOT NULL DEFAULT '',
  KEY idx_fb_user (user_id),
  KEY idx_fb_status (status),
  KEY idx_fb_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tree_drop (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  day_key VARCHAR(16) NOT NULL,
  amount INT NOT NULL DEFAULT 0,
  remaining INT NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uk_owner_day (owner_id, day_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_seed (
  user_id INT NOT NULL,
  seed_id VARCHAR(64) NOT NULL,
  qty INT NOT NULL DEFAULT 0,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, seed_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_token (
  token VARCHAR(128) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  expire_at VARCHAR(40) NOT NULL DEFAULT '',
  KEY idx_auth_token_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  delta INT NOT NULL,
  balance_after INT NOT NULL DEFAULT 0,
  direction VARCHAR(16) NOT NULL DEFAULT 'in',
  note VARCHAR(191) NOT NULL DEFAULT '',
  ref_type VARCHAR(32) NOT NULL DEFAULT '',
  ref_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at VARCHAR(40) NOT NULL,
  KEY idx_wl_user (user_id),
  KEY idx_wl_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 支付回调落库 / 测试号 / 社交日统计 ----------
CREATE TABLE IF NOT EXISTS wx_pay_notify (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  out_trade_no VARCHAR(64) NOT NULL,
  transaction_id VARCHAR(128) NOT NULL DEFAULT '',
  payload_json MEDIUMTEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uk_wx_pay_notify (out_trade_no, transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wx_refund_notify (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  out_trade_no VARCHAR(64) NOT NULL,
  out_refund_no VARCHAR(64) NOT NULL DEFAULT '',
  refund_id VARCHAR(128) NOT NULL DEFAULT '',
  amount_cent INT NOT NULL DEFAULT 0,
  payload_json MEDIUMTEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uk_wx_refund_out (out_refund_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_test_sandbox (
  user_id INT NOT NULL PRIMARY KEY,
  enabled TINYINT NOT NULL DEFAULT 1,
  energy_granted INT NOT NULL DEFAULT 0,
  lottery_bonus INT NOT NULL DEFAULT 0,
  lottery_bonus_day VARCHAR(16) NOT NULL DEFAULT '',
  bypass_draw_limit TINYINT NOT NULL DEFAULT 0,
  bypass_energy_cost TINYINT NOT NULL DEFAULT 0,
  note VARCHAR(255) NOT NULL DEFAULT '',
  meta_json TEXT,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  KEY idx_test_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS social_action_day (
  user_id INT NOT NULL,
  day_key VARCHAR(16) NOT NULL,
  steals INT NOT NULL DEFAULT 0,
  helps INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 旧表补列（已存在则跳过；执行前可用 information_schema 核对）----------
-- 下列 ALTER 若列已存在会报 Duplicate column，忽略即可

-- ALTER TABLE user_account ADD COLUMN risk_flag INT NOT NULL DEFAULT 0;
-- ALTER TABLE lottery_draw ADD COLUMN action_id VARCHAR(64) NOT NULL DEFAULT '';
-- ALTER TABLE lottery_draw ADD COLUMN prize_type VARCHAR(32) NOT NULL DEFAULT '';
-- ALTER TABLE lottery_draw ADD COLUMN product_id VARCHAR(64) NOT NULL DEFAULT '';
-- ALTER TABLE lottery_prize ADD COLUMN rarity VARCHAR(8) NOT NULL DEFAULT 'N';
-- ALTER TABLE lottery_prize ADD COLUMN pool_id VARCHAR(64) NOT NULL DEFAULT 'default';
-- ALTER TABLE product ADD COLUMN kind VARCHAR(32) NOT NULL DEFAULT '';
-- ALTER TABLE redeem_order ADD COLUMN tracking_no VARCHAR(64) NOT NULL DEFAULT '';
-- ALTER TABLE redeem_order ADD COLUMN carrier VARCHAR(64) NOT NULL DEFAULT '';
-- ALTER TABLE redeem_order ADD COLUMN shipped_at VARCHAR(40) NOT NULL DEFAULT '';
-- ALTER TABLE redeem_order ADD COLUMN entry_from VARCHAR(64) NOT NULL DEFAULT '';
-- ALTER TABLE jar_state ADD COLUMN seed_id VARCHAR(64) NOT NULL DEFAULT 'seed_elm';
-- ALTER TABLE jar_state ADD COLUMN phase VARCHAR(32) NOT NULL DEFAULT 'seed';
-- ALTER TABLE jar_state ADD COLUMN nutrition INT NOT NULL DEFAULT 0;
-- ALTER TABLE jar_state ADD COLUMN tree_started_at VARCHAR(40) NOT NULL DEFAULT '';
-- ALTER TABLE jar_state ADD COLUMN tree_cycle INT NOT NULL DEFAULT 1;
-- ALTER TABLE jar_state ADD COLUMN fertilize_ready_at BIGINT NOT NULL DEFAULT 0;
-- ALTER TABLE jar_state ADD COLUMN light_ready_at BIGINT NOT NULL DEFAULT 0;
-- ALTER TABLE admin_audit MODIFY COLUMN detail_json MEDIUMTEXT NOT NULL;

-- ========== 验收：缺表会打出 missing ==========
SELECT t.tbl AS expected_table,
       CASE WHEN c.table_name IS NULL THEN 'MISSING' ELSE 'ok' END AS status
FROM (
  SELECT 'config_draft' AS tbl UNION ALL SELECT 'config_published' UNION ALL SELECT 'config_history'
  UNION ALL SELECT 'asset_object' UNION ALL SELECT 'media_blob' UNION ALL SELECT 'user_account'
  UNION ALL SELECT 'user_wallet' UNION ALL SELECT 'jar_state' UNION ALL SELECT 'jar_ledger'
  UNION ALL SELECT 'friend_edge' UNION ALL SELECT 'social_feed' UNION ALL SELECT 'subscribe_grant'
  UNION ALL SELECT 'product' UNION ALL SELECT 'channel_listing' UNION ALL SELECT 'lottery_prize'
  UNION ALL SELECT 'task_def' UNION ALL SELECT 'task_completion' UNION ALL SELECT 'task_action_event'
  UNION ALL SELECT 'redeem_order' UNION ALL SELECT 'finance_ledger' UNION ALL SELECT 'icon_asset'
  UNION ALL SELECT 'lottery_draw' UNION ALL SELECT 'user_address' UNION ALL SELECT 'ops_config'
  UNION ALL SELECT 'content_banner' UNION ALL SELECT 'content_copy' UNION ALL SELECT 'channel_def'
  UNION ALL SELECT 'admin_audit' UNION ALL SELECT 'user_steps_day' UNION ALL SELECT 'user_checkin'
  UNION ALL SELECT 'iaa_reward' UNION ALL SELECT 'subscribe_outbox' UNION ALL SELECT 'invite_event'
  UNION ALL SELECT 'invite_reward_hold' UNION ALL SELECT 'cms_article'
  UNION ALL SELECT 'lottery_win_claim' UNION ALL SELECT 'user_lottery_pity' UNION ALL SELECT 'lottery_pool'
  UNION ALL SELECT 'lottery_action_lock' UNION ALL SELECT 'flash_slot' UNION ALL SELECT 'flash_redeem_log'
  UNION ALL SELECT 'festival_ticket' UNION ALL SELECT 'festival_issue_lock' UNION ALL SELECT 'user_cart'
  UNION ALL SELECT 'user_feedback' UNION ALL SELECT 'tree_drop' UNION ALL SELECT 'user_seed'
  UNION ALL SELECT 'auth_token' UNION ALL SELECT 'wallet_ledger' UNION ALL SELECT 'wx_pay_notify'
  UNION ALL SELECT 'wx_refund_notify' UNION ALL SELECT 'user_test_sandbox' UNION ALL SELECT 'social_action_day'
) t
LEFT JOIN information_schema.tables c
  ON c.table_schema = DATABASE() AND c.table_name = t.tbl
ORDER BY status DESC, expected_table;

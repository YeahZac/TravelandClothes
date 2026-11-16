-- 全民优享表 · 写入同袍会原库 travel_clothes（与旧文旅表共存）
-- MySQL / CynosDB：禁止 TEXT/BLOB 带 DEFAULT（5.7 / 严格模式会报错）
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS config_draft (
  id            INT NOT NULL PRIMARY KEY,
  version       VARCHAR(32) NOT NULL DEFAULT '0',
  payload_json  MEDIUMTEXT NOT NULL,
  updated_at    VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS config_published (
  id            INT NOT NULL PRIMARY KEY,
  version       VARCHAR(32) NOT NULL,
  payload_json  MEDIUMTEXT NOT NULL,
  published_at  VARCHAR(40) NOT NULL,
  updated_at    VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS config_history (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version       VARCHAR(32) NOT NULL,
  payload_json  MEDIUMTEXT NOT NULL,
  published_at  VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_object (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cos_key       VARCHAR(512) NOT NULL UNIQUE,
  purpose       VARCHAR(64) NOT NULL DEFAULT 'misc',
  mime          VARCHAR(128) NOT NULL DEFAULT 'application/octet-stream',
  bytes         INT NOT NULL DEFAULT 0,
  etag          VARCHAR(128) NOT NULL DEFAULT '',
  created_at    VARCHAR(40) NOT NULL
);

-- COS 不可用时的媒体回落（≤2MB），供 /media/file 代理读取
CREATE TABLE IF NOT EXISTS media_blob (
  cos_key       VARCHAR(512) NOT NULL PRIMARY KEY,
  mime          VARCHAR(128) NOT NULL,
  etag          VARCHAR(128) NOT NULL DEFAULT '',
  bytes         INT NOT NULL DEFAULT 0,
  body          LONGBLOB NOT NULL,
  updated_at    VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_account (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  platform      VARCHAR(32) NOT NULL,
  openid        VARCHAR(128) NOT NULL,
  unionid       VARCHAR(128) NOT NULL DEFAULT '',
  nick_name     VARCHAR(64) NOT NULL DEFAULT '',
  avatar_url    VARCHAR(512) NOT NULL DEFAULT '',
  invite_code   VARCHAR(32) NOT NULL DEFAULT '',
  channel       VARCHAR(64) NOT NULL DEFAULT 'organic',
  session_key   VARCHAR(128) NOT NULL DEFAULT '',
  status        VARCHAR(16) NOT NULL DEFAULT 'active',
  remark        VARCHAR(255) NOT NULL DEFAULT '',
  inviter_id    INT NULL,
  gender        VARCHAR(16) NOT NULL DEFAULT '',
  province      VARCHAR(64) NOT NULL DEFAULT '',
  city          VARCHAR(64) NOT NULL DEFAULT '',
  district      VARCHAR(64) NOT NULL DEFAULT '',
  last_active_at VARCHAR(40) NOT NULL DEFAULT '',
  active_count  INT NOT NULL DEFAULT 0,
  created_at    VARCHAR(40) NOT NULL,
  updated_at    VARCHAR(40) NOT NULL,
  UNIQUE(platform, openid)
);

CREATE TABLE IF NOT EXISTS user_wallet (
  user_id       INT NOT NULL PRIMARY KEY,
  energy        INT NOT NULL DEFAULT 0,
  points        INT NOT NULL DEFAULT 0,
  coins         INT NOT NULL DEFAULT 0,
  lottery_chance INT NOT NULL DEFAULT 0,
  updated_at    VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS jar_state (
  user_id         INT NOT NULL PRIMARY KEY,
  stage           INT NOT NULL DEFAULT 1,
  liquid          INT NOT NULL DEFAULT 0,
  pending         INT NOT NULL DEFAULT 0,
  next_harvest_at BIGINT NOT NULL DEFAULT 0,
  water_ready_at  BIGINT NOT NULL DEFAULT 0,
  water_count     INT NOT NULL DEFAULT 0,
  steals_left     INT NOT NULL DEFAULT 3,
  helped_json     VARCHAR(1024) NOT NULL DEFAULT '[]',
  event_json      MEDIUMTEXT NULL,
  updated_at      VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS jar_ledger (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  action_id     VARCHAR(64) NOT NULL,
  action_type   VARCHAR(32) NOT NULL,
  delta_energy  INT NOT NULL DEFAULT 0,
  delta_liquid  INT NOT NULL DEFAULT 0,
  meta_json     VARCHAR(1024) NOT NULL DEFAULT '{}',
  created_at    VARCHAR(40) NOT NULL,
  UNIQUE(user_id, action_id)
);

CREATE TABLE IF NOT EXISTS friend_edge (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  friend_user_id INT NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at    VARCHAR(40) NOT NULL,
  UNIQUE(user_id, friend_user_id)
);

CREATE TABLE IF NOT EXISTS social_feed (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  actor_name    VARCHAR(64) NOT NULL,
  feed_type     VARCHAR(16) NOT NULL,
  amount        INT NOT NULL DEFAULT 0,
  tip           VARCHAR(128) NOT NULL DEFAULT '',
  created_at    VARCHAR(40) NOT NULL,
  read_flag     INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subscribe_grant (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  tmpl_key      VARCHAR(64) NOT NULL,
  tmpl_id       VARCHAR(128) NOT NULL,
  status        VARCHAR(16) NOT NULL,
  granted_at    VARCHAR(40) NOT NULL,
  UNIQUE(user_id, tmpl_key)
);

CREATE INDEX idx_ledger_user ON jar_ledger(user_id, created_at(40));
CREATE INDEX idx_feed_user ON social_feed(user_id, created_at(40));
CREATE INDEX idx_asset_purpose ON asset_object(purpose);

CREATE TABLE IF NOT EXISTS product (
  id            VARCHAR(64) PRIMARY KEY,
  name          VARCHAR(128) NOT NULL,
  category      VARCHAR(64) NOT NULL DEFAULT '推荐',
  price_cent    INT NOT NULL DEFAULT 0,
  cost_cent     INT NOT NULL DEFAULT 0,
  points_off    DOUBLE NOT NULL DEFAULT 0,
  stock         INT NOT NULL DEFAULT 0,
  stock_alarm   INT NOT NULL DEFAULT 10,
  image_url     VARCHAR(512) NOT NULL DEFAULT '',
  tag           VARCHAR(64) NOT NULL DEFAULT '',
  status        VARCHAR(16) NOT NULL DEFAULT 'on',
  sort_order    INT NOT NULL DEFAULT 0,
  meta_json     VARCHAR(1024) NOT NULL DEFAULT '{}',
  updated_at    VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_listing (
  id            VARCHAR(64) NOT NULL PRIMARY KEY,
  channel       VARCHAR(16) NOT NULL,
  product_id    VARCHAR(64) NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  status        VARCHAR(16) NOT NULL DEFAULT 'on',
  price_cent    INT NOT NULL DEFAULT 0,
  meta_json     MEDIUMTEXT NOT NULL,
  updated_at    VARCHAR(40) NOT NULL,
  UNIQUE KEY uk_channel_product (channel, product_id),
  KEY idx_listing_channel (channel, status, sort_order)
);

CREATE TABLE IF NOT EXISTS lottery_prize (
  id            VARCHAR(64) PRIMARY KEY,
  name          VARCHAR(128) NOT NULL,
  prize_type    VARCHAR(32) NOT NULL DEFAULT 'coin',
  prize_value   INT NOT NULL DEFAULT 0,
  product_id    VARCHAR(64) NOT NULL DEFAULT '',
  weight        INT NOT NULL DEFAULT 1,
  stock         INT NOT NULL DEFAULT -1,
  image_url     VARCHAR(512) NOT NULL DEFAULT '',
  status        VARCHAR(16) NOT NULL DEFAULT 'on',
  sort_order    INT NOT NULL DEFAULT 0,
  updated_at    VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS task_def (
  id            VARCHAR(64) PRIMARY KEY,
  title         VARCHAR(128) NOT NULL,
  action_key    VARCHAR(64) NOT NULL DEFAULT '',
  reward_desc   VARCHAR(128) NOT NULL DEFAULT '',
  reward_energy INT NOT NULL DEFAULT 0,
  reward_coins  INT NOT NULL DEFAULT 0,
  daily_limit   INT NOT NULL DEFAULT 1,
  target_count  INT NOT NULL DEFAULT 1,
  reward_gift_id VARCHAR(64) NOT NULL DEFAULT '',
  desc_text     VARCHAR(256) NOT NULL DEFAULT '',
  status        VARCHAR(16) NOT NULL DEFAULT 'on',
  sort_order    INT NOT NULL DEFAULT 0,
  updated_at    VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS task_completion (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  task_id       VARCHAR(64) NOT NULL,
  day_key       VARCHAR(16) NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'done',
  reward_json   VARCHAR(512) NOT NULL DEFAULT '{}',
  created_at    VARCHAR(40) NOT NULL,
  UNIQUE(user_id, task_id, day_key)
);

CREATE TABLE IF NOT EXISTS task_action_event (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT NOT NULL,
  action_key    VARCHAR(32) NOT NULL,
  day_key       VARCHAR(10) NOT NULL,
  created_at    VARCHAR(40) NOT NULL,
  KEY idx_task_action_user_day (user_id, action_key, day_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS redeem_order (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_no      VARCHAR(64) NOT NULL UNIQUE,
  user_id       INT NOT NULL,
  order_type    VARCHAR(32) NOT NULL DEFAULT 'gift',
  product_id    VARCHAR(64) NOT NULL DEFAULT '',
  product_name  VARCHAR(128) NOT NULL DEFAULT '',
  qty           INT NOT NULL DEFAULT 1,
  pay_points    INT NOT NULL DEFAULT 0,
  pay_cash_cent INT NOT NULL DEFAULT 0,
  cost_cent     INT NOT NULL DEFAULT 0,
  status        VARCHAR(16) NOT NULL DEFAULT 'pending',
  pay_status    VARCHAR(16) NOT NULL DEFAULT 'none',
  wx_prepay_id  VARCHAR(128) NOT NULL DEFAULT '',
  wx_transaction_id VARCHAR(128) NOT NULL DEFAULT '',
  paid_at       VARCHAR(40) NOT NULL DEFAULT '',
  refund_status VARCHAR(16) NOT NULL DEFAULT 'none',
  refund_cent   INT NOT NULL DEFAULT 0,
  wx_refund_id  VARCHAR(128) NOT NULL DEFAULT '',
  refunded_at   VARCHAR(40) NOT NULL DEFAULT '',
  tracking_no   VARCHAR(64) NOT NULL DEFAULT '',
  carrier       VARCHAR(64) NOT NULL DEFAULT '',
  shipped_at    VARCHAR(40) NOT NULL DEFAULT '',
  entry_from    VARCHAR(64) NOT NULL DEFAULT '',
  items_json    MEDIUMTEXT NULL,
  address_json  VARCHAR(1024) NOT NULL DEFAULT '{}',
  created_at    VARCHAR(40) NOT NULL,
  updated_at    VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_ledger (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  day_key       VARCHAR(16) NOT NULL,
  entry_type    VARCHAR(32) NOT NULL,
  category      VARCHAR(64) NOT NULL DEFAULT 'misc',
  amount_cent   INT NOT NULL,
  ref_type      VARCHAR(32) NOT NULL DEFAULT '',
  ref_id        VARCHAR(64) NOT NULL DEFAULT '',
  note          VARCHAR(255) NOT NULL DEFAULT '',
  created_at    VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS icon_asset (
  id            VARCHAR(64) PRIMARY KEY,
  label         VARCHAR(128) NOT NULL DEFAULT '',
  purpose       VARCHAR(64) NOT NULL DEFAULT 'icons',
  path          VARCHAR(512) NOT NULL,
  updated_at    VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS lottery_draw (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  prize_id      VARCHAR(64) NOT NULL,
  prize_name    VARCHAR(128) NOT NULL,
  cost_cent     INT NOT NULL DEFAULT 0,
  created_at    VARCHAR(40) NOT NULL
);

CREATE INDEX idx_product_status ON product(status, sort_order);
CREATE INDEX idx_lottery_status ON lottery_prize(status, sort_order);
CREATE INDEX idx_task_day ON task_completion(day_key, task_id);
CREATE INDEX idx_redeem_status ON redeem_order(status, created_at(40));
CREATE INDEX idx_finance_day ON finance_ledger(day_key, entry_type);
CREATE INDEX idx_lottery_draw_day ON lottery_draw(created_at(40));

CREATE TABLE IF NOT EXISTS user_address (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  name          VARCHAR(64) NOT NULL,
  phone         VARCHAR(32) NOT NULL,
  province      VARCHAR(64) NOT NULL DEFAULT '',
  city          VARCHAR(64) NOT NULL DEFAULT '',
  district      VARCHAR(64) NOT NULL DEFAULT '',
  detail        VARCHAR(255) NOT NULL,
  is_default    INT NOT NULL DEFAULT 0,
  created_at    VARCHAR(40) NOT NULL,
  updated_at    VARCHAR(40) NOT NULL
);

CREATE INDEX idx_address_user ON user_address(user_id, is_default);

CREATE TABLE IF NOT EXISTS ops_config (
  id            INT NOT NULL PRIMARY KEY,
  payload_json  MEDIUMTEXT NOT NULL,
  updated_at    VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS content_banner (
  id            VARCHAR(64) PRIMARY KEY,
  page_key      VARCHAR(32) NOT NULL DEFAULT 'home',
  title         VARCHAR(128) NOT NULL DEFAULT '',
  sub           VARCHAR(255) NOT NULL DEFAULT '',
  image_url     VARCHAR(512) NOT NULL DEFAULT '',
  link_key      VARCHAR(64) NOT NULL DEFAULT '',
  tone          VARCHAR(32) NOT NULL DEFAULT 'orange',
  sort_order    INT NOT NULL DEFAULT 0,
  status        VARCHAR(16) NOT NULL DEFAULT 'on',
  updated_at    VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS content_copy (
  id            VARCHAR(64) PRIMARY KEY,
  label         VARCHAR(128) NOT NULL DEFAULT '',
  body          MEDIUMTEXT NOT NULL,
  surface       VARCHAR(64) NOT NULL DEFAULT 'global',
  updated_at    VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_def (
  id            VARCHAR(64) PRIMARY KEY,
  name          VARCHAR(128) NOT NULL,
  note          VARCHAR(255) NOT NULL DEFAULT '',
  status        VARCHAR(16) NOT NULL DEFAULT 'on',
  updated_at    VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor         VARCHAR(64) NOT NULL DEFAULT 'admin',
  action        VARCHAR(128) NOT NULL,
  target        VARCHAR(128) NOT NULL DEFAULT '',
  detail_json   MEDIUMTEXT NOT NULL,
  created_at    VARCHAR(40) NOT NULL
);

-- P2：微信运动分档 / IAA / 订阅出站
CREATE TABLE IF NOT EXISTS user_steps_day (
  user_id         INT NOT NULL,
  day_key         VARCHAR(16) NOT NULL,
  steps           INT NOT NULL DEFAULT 0,
  source          VARCHAR(32) NOT NULL DEFAULT 'report',
  claimed_json    VARCHAR(512) NOT NULL DEFAULT '[]',
  energy_claimed  INT NOT NULL DEFAULT 0,
  updated_at      VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, day_key)
);
CREATE INDEX idx_steps_day ON user_steps_day(day_key);

CREATE TABLE IF NOT EXISTS user_checkin (
  user_id     INT NOT NULL,
  day_key     VARCHAR(16) NOT NULL,
  streak      INT NOT NULL DEFAULT 1,
  reward_json VARCHAR(512) NOT NULL DEFAULT '{}',
  source      VARCHAR(32) NOT NULL DEFAULT 'checkin',
  created_at  VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, day_key)
);

CREATE TABLE IF NOT EXISTS iaa_reward (
  id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  day_key      VARCHAR(16) NOT NULL,
  kind         VARCHAR(32) NOT NULL,
  action_id    VARCHAR(64) NOT NULL UNIQUE,
  reward_json  VARCHAR(512) NOT NULL DEFAULT '{}',
  created_at   VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS subscribe_outbox (
  id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  tmpl_key     VARCHAR(64) NOT NULL,
  payload_json VARCHAR(1024) NOT NULL DEFAULT '{}',
  status       VARCHAR(16) NOT NULL DEFAULT 'pending',
  ready_at     INT NOT NULL DEFAULT 0,
  sent_at      VARCHAR(40) NULL,
  created_at   VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS invite_event (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  inviter_id    INT NOT NULL,
  invitee_id    INT NOT NULL,
  day_key       VARCHAR(16) NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at    VARCHAR(40) NOT NULL,
  confirmed_at  VARCHAR(40) NULL,
  UNIQUE(invitee_id)
);

CREATE TABLE IF NOT EXISTS invite_reward_hold (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  tier_need     INT NOT NULL DEFAULT 0,
  reward_json   VARCHAR(512) NOT NULL DEFAULT '{}',
  unlock_at     INT NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'frozen',
  created_at    VARCHAR(40) NOT NULL,
  claimed_at    VARCHAR(40) NULL
);

CREATE INDEX idx_banner_page ON content_banner(page_key, status, sort_order);
CREATE INDEX idx_audit_time ON admin_audit(created_at(40));
CREATE INDEX idx_iaa_user_day ON iaa_reward(user_id, day_key, kind);
CREATE INDEX idx_sub_outbox ON subscribe_outbox(status, ready_at);

CREATE TABLE IF NOT EXISTS cms_article (
  id            VARCHAR(64) NOT NULL PRIMARY KEY,
  title         VARCHAR(200) NOT NULL,
  summary       VARCHAR(512) NOT NULL DEFAULT '',
  tag           VARCHAR(32) NOT NULL DEFAULT '',
  cover_url     VARCHAR(512) NOT NULL DEFAULT '',
  status        VARCHAR(16) NOT NULL DEFAULT 'on',
  sort_order    INT NOT NULL DEFAULT 0,
  use_as_notice INT NOT NULL DEFAULT 0,
  blocks_json   MEDIUMTEXT NOT NULL,
  published_at  VARCHAR(40) NOT NULL DEFAULT '',
  updated_at    VARCHAR(40) NOT NULL
);

-- 以下曾只在业务代码 ensureSchema 懒建；并入主 schema，禁止运行时 DDL
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
);

CREATE TABLE IF NOT EXISTS user_lottery_pity (
  user_id INT NOT NULL,
  pool_id VARCHAR(64) NOT NULL DEFAULT 'default',
  miss_streak INT NOT NULL DEFAULT 0,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, pool_id)
);

CREATE TABLE IF NOT EXISTS lottery_pool (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'on',
  start_at VARCHAR(40) NOT NULL DEFAULT '',
  end_at VARCHAR(40) NOT NULL DEFAULT '',
  updated_at VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS lottery_action_lock (
  user_id INT NOT NULL,
  action_id VARCHAR(64) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, action_id)
);

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
);

CREATE TABLE IF NOT EXISTS flash_redeem_log (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slot_id VARCHAR(64) NOT NULL,
  user_id INT NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  day VARCHAR(16) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  order_no VARCHAR(64) NOT NULL DEFAULT '',
  KEY idx_flash_log_day (day, slot_id)
);

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
);

CREATE TABLE IF NOT EXISTS festival_issue_lock (
  order_no VARCHAR(64) NOT NULL PRIMARY KEY,
  created_at VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_cart (
  user_id INT NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, product_id),
  KEY idx_cart_user (user_id)
);

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
);

CREATE TABLE IF NOT EXISTS tree_drop (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  day_key VARCHAR(16) NOT NULL,
  amount INT NOT NULL DEFAULT 0,
  remaining INT NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uk_owner_day (owner_id, day_key)
);

CREATE TABLE IF NOT EXISTS user_seed (
  user_id INT NOT NULL,
  seed_id VARCHAR(64) NOT NULL,
  qty INT NOT NULL DEFAULT 0,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, seed_id)
);

CREATE TABLE IF NOT EXISTS auth_token (
  token VARCHAR(128) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  expire_at VARCHAR(40) NOT NULL DEFAULT '',
  KEY idx_auth_token_user (user_id)
);

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
);

CREATE TABLE IF NOT EXISTS wx_pay_notify (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  out_trade_no VARCHAR(64) NOT NULL,
  transaction_id VARCHAR(128) NOT NULL DEFAULT '',
  payload_json MEDIUMTEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uk_wx_pay_notify (out_trade_no, transaction_id)
);

CREATE TABLE IF NOT EXISTS wx_refund_notify (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  out_trade_no VARCHAR(64) NOT NULL,
  out_refund_no VARCHAR(64) NOT NULL DEFAULT '',
  refund_id VARCHAR(128) NOT NULL DEFAULT '',
  amount_cent INT NOT NULL DEFAULT 0,
  payload_json MEDIUMTEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uk_wx_refund_out (out_refund_no)
);

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
);

CREATE TABLE IF NOT EXISTS social_action_day (
  user_id INT NOT NULL,
  day_key VARCHAR(16) NOT NULL,
  steals INT NOT NULL DEFAULT 0,
  helps INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day_key)
);


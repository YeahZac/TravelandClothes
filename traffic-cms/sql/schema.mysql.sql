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
  next_harvest_at INT NOT NULL DEFAULT 0,
  water_ready_at  INT NOT NULL DEFAULT 0,
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

CREATE INDEX idx_ledger_user ON jar_ledger(user_id, created_at);
CREATE INDEX idx_feed_user ON social_feed(user_id, created_at);
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
  tracking_no   VARCHAR(64) NOT NULL DEFAULT '',
  carrier       VARCHAR(64) NOT NULL DEFAULT '',
  shipped_at    VARCHAR(40) NOT NULL DEFAULT '',
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
CREATE INDEX idx_redeem_status ON redeem_order(status, created_at);
CREATE INDEX idx_finance_day ON finance_ledger(day_key, entry_type);
CREATE INDEX idx_lottery_draw_day ON lottery_draw(created_at);

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
  detail_json   VARCHAR(1024) NOT NULL DEFAULT '{}',
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
CREATE INDEX idx_audit_time ON admin_audit(created_at);
CREATE INDEX idx_steps_day ON user_steps_day(day_key);
CREATE INDEX idx_iaa_user_day ON iaa_reward(user_id, day_key, kind);
CREATE INDEX idx_sub_outbox ON subscribe_outbox(status, ready_at);

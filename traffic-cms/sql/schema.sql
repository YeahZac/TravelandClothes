-- 全民优享 · 流量产品库表（MySQL 8 / SQLite 兼容写法，生产用 MySQL）
-- 字符集：utf8mb4

CREATE TABLE IF NOT EXISTS config_draft (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  version       VARCHAR(32) NOT NULL DEFAULT '0',
  payload_json  TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS config_published (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  version       VARCHAR(32) NOT NULL,
  payload_json  TEXT NOT NULL,
  published_at  TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS config_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  version       VARCHAR(32) NOT NULL,
  payload_json  TEXT NOT NULL,
  published_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_object (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cos_key       VARCHAR(512) NOT NULL UNIQUE,
  purpose       VARCHAR(64) NOT NULL DEFAULT 'misc',
  mime          VARCHAR(128) NOT NULL DEFAULT 'application/octet-stream',
  bytes         INTEGER NOT NULL DEFAULT 0,
  etag          VARCHAR(128) NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_blob (
  cos_key       TEXT PRIMARY KEY,
  mime          TEXT NOT NULL,
  etag          TEXT NOT NULL DEFAULT '',
  bytes         INTEGER NOT NULL DEFAULT 0,
  body          BLOB NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_account (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  platform      VARCHAR(32) NOT NULL,
  openid        VARCHAR(128) NOT NULL,
  unionid       VARCHAR(128) NOT NULL DEFAULT '',
  nick_name     VARCHAR(64) NOT NULL DEFAULT '',
  avatar_url    VARCHAR(512) NOT NULL DEFAULT '',
  invite_code   VARCHAR(32) NOT NULL DEFAULT '',
  channel       VARCHAR(64) NOT NULL DEFAULT 'organic',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(platform, openid)
);

CREATE TABLE IF NOT EXISTS user_wallet (
  user_id       INTEGER PRIMARY KEY,
  energy        INTEGER NOT NULL DEFAULT 0,
  points        INTEGER NOT NULL DEFAULT 0,
  coins         INTEGER NOT NULL DEFAULT 0,
  lottery_chance INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jar_state (
  user_id         INTEGER PRIMARY KEY,
  stage           INTEGER NOT NULL DEFAULT 1,
  liquid          INTEGER NOT NULL DEFAULT 0,
  pending         INTEGER NOT NULL DEFAULT 0,
  next_harvest_at INTEGER NOT NULL DEFAULT 0,
  water_ready_at  INTEGER NOT NULL DEFAULT 0,
  water_count     INTEGER NOT NULL DEFAULT 0,
  steals_left     INTEGER NOT NULL DEFAULT 3,
  helped_json     TEXT NOT NULL DEFAULT '[]',
  event_json      TEXT,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jar_ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  action_id     VARCHAR(64) NOT NULL,
  action_type   VARCHAR(32) NOT NULL,
  delta_energy  INTEGER NOT NULL DEFAULT 0,
  delta_liquid  INTEGER NOT NULL DEFAULT 0,
  meta_json     TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL,
  UNIQUE(user_id, action_id)
);

CREATE TABLE IF NOT EXISTS friend_edge (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  friend_user_id INTEGER NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  UNIQUE(user_id, friend_user_id)
);

CREATE TABLE IF NOT EXISTS social_feed (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  actor_name    VARCHAR(64) NOT NULL,
  feed_type     VARCHAR(16) NOT NULL,
  amount        INTEGER NOT NULL DEFAULT 0,
  tip           VARCHAR(128) NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  read_flag     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subscribe_grant (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  tmpl_key      VARCHAR(64) NOT NULL,
  tmpl_id       VARCHAR(128) NOT NULL,
  status        VARCHAR(16) NOT NULL,
  granted_at    TEXT NOT NULL,
  UNIQUE(user_id, tmpl_key)
);

CREATE INDEX IF NOT EXISTS idx_ledger_user ON jar_ledger(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_feed_user ON social_feed(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_asset_purpose ON asset_object(purpose);

-- —— 运营后台扩展（商品 / 抽奖 / 任务 / 兑换 / 财务 / 图标）——

CREATE TABLE IF NOT EXISTS product (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT '推荐',
  price_cent    INTEGER NOT NULL DEFAULT 0,
  cost_cent     INTEGER NOT NULL DEFAULT 0,
  points_off    REAL NOT NULL DEFAULT 0,
  stock         INTEGER NOT NULL DEFAULT 0,
  stock_alarm   INTEGER NOT NULL DEFAULT 10,
  image_url     TEXT NOT NULL DEFAULT '',
  tag           TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'on',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  meta_json     TEXT NOT NULL DEFAULT '{}',
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lottery_prize (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  prize_type    TEXT NOT NULL DEFAULT 'coin',
  prize_value   INTEGER NOT NULL DEFAULT 0,
  product_id    TEXT NOT NULL DEFAULT '',
  weight        INTEGER NOT NULL DEFAULT 1,
  stock         INTEGER NOT NULL DEFAULT -1,
  image_url     TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'on',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_def (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  action_key    TEXT NOT NULL DEFAULT '',
  reward_desc   TEXT NOT NULL DEFAULT '',
  reward_energy INTEGER NOT NULL DEFAULT 0,
  reward_coins  INTEGER NOT NULL DEFAULT 0,
  daily_limit   INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'on',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_completion (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  task_id       TEXT NOT NULL,
  day_key       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'done',
  reward_json   TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL,
  UNIQUE(user_id, task_id, day_key)
);

CREATE TABLE IF NOT EXISTS redeem_order (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no      TEXT NOT NULL UNIQUE,
  user_id       INTEGER NOT NULL,
  order_type    TEXT NOT NULL DEFAULT 'gift',
  product_id    TEXT NOT NULL DEFAULT '',
  product_name  TEXT NOT NULL DEFAULT '',
  qty           INTEGER NOT NULL DEFAULT 1,
  pay_points    INTEGER NOT NULL DEFAULT 0,
  pay_cash_cent INTEGER NOT NULL DEFAULT 0,
  cost_cent     INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',
  pay_status    TEXT NOT NULL DEFAULT 'none',
  wx_prepay_id  TEXT NOT NULL DEFAULT '',
  wx_transaction_id TEXT NOT NULL DEFAULT '',
  paid_at       TEXT NOT NULL DEFAULT '',
  address_json  TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day_key       TEXT NOT NULL,
  entry_type    TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'misc',
  amount_cent   INTEGER NOT NULL,
  ref_type      TEXT NOT NULL DEFAULT '',
  ref_id        TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS icon_asset (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL DEFAULT '',
  purpose       TEXT NOT NULL DEFAULT 'icons',
  path          TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lottery_draw (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  prize_id      TEXT NOT NULL,
  prize_name    TEXT NOT NULL,
  cost_cent     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_status ON product(status, sort_order);
CREATE INDEX IF NOT EXISTS idx_lottery_status ON lottery_prize(status, sort_order);
CREATE INDEX IF NOT EXISTS idx_task_day ON task_completion(day_key, task_id);
CREATE INDEX IF NOT EXISTS idx_redeem_status ON redeem_order(status, created_at);
CREATE INDEX IF NOT EXISTS idx_finance_day ON finance_ledger(day_key, entry_type);
CREATE INDEX IF NOT EXISTS idx_lottery_draw_day ON lottery_draw(created_at);

CREATE TABLE IF NOT EXISTS user_address (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  province      TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  district      TEXT NOT NULL DEFAULT '',
  detail        TEXT NOT NULL,
  is_default    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_address_user ON user_address(user_id, is_default);

-- —— 运营风控 / 内容 / 渠道 / 审计 / 履约 ——

CREATE TABLE IF NOT EXISTS ops_config (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  payload_json  TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_banner (
  id            TEXT PRIMARY KEY,
  page_key      TEXT NOT NULL DEFAULT 'home',
  title         TEXT NOT NULL DEFAULT '',
  sub           TEXT NOT NULL DEFAULT '',
  image_url     TEXT NOT NULL DEFAULT '',
  link_key      TEXT NOT NULL DEFAULT '',
  tone          TEXT NOT NULL DEFAULT 'orange',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'on',
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_copy (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  surface       TEXT NOT NULL DEFAULT 'global',
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_def (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'on',
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor         TEXT NOT NULL DEFAULT 'admin',
  action        TEXT NOT NULL,
  target        TEXT NOT NULL DEFAULT '',
  detail_json   TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL
);

-- P2：微信运动分档 / IAA / 订阅出站
CREATE TABLE IF NOT EXISTS user_steps_day (
  user_id         INTEGER NOT NULL,
  day_key         TEXT NOT NULL,
  steps           INTEGER NOT NULL DEFAULT 0,
  source          TEXT NOT NULL DEFAULT 'report',
  claimed_json    TEXT NOT NULL DEFAULT '[]',
  energy_claimed  INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (user_id, day_key)
);

CREATE TABLE IF NOT EXISTS user_checkin (
  user_id     INTEGER NOT NULL,
  day_key     TEXT NOT NULL,
  streak      INTEGER NOT NULL DEFAULT 1,
  reward_json TEXT NOT NULL DEFAULT '{}',
  source      TEXT NOT NULL DEFAULT 'checkin',
  created_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, day_key)
);

CREATE TABLE IF NOT EXISTS iaa_reward (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  day_key      TEXT NOT NULL,
  kind         TEXT NOT NULL,
  action_id    TEXT NOT NULL UNIQUE,
  reward_json  TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscribe_outbox (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  tmpl_key     TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'pending',
  ready_at     INTEGER NOT NULL DEFAULT 0,
  sent_at      TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_banner_page ON content_banner(page_key, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_audit_time ON admin_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_steps_day ON user_steps_day(day_key);
CREATE INDEX IF NOT EXISTS idx_iaa_user_day ON iaa_reward(user_id, day_key, kind);
CREATE INDEX IF NOT EXISTS idx_sub_outbox ON subscribe_outbox(status, ready_at);

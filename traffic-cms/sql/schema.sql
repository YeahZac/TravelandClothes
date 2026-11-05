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

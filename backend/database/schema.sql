-- 同袍会会员体系 数据库 Schema v1.0
-- 适用于微信云托管 MySQL 5.7+/8.0
-- 字符集 utf8mb4，支持 emoji

CREATE DATABASE IF NOT EXISTS travel_clothes DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE travel_clothes;

-- ===== 用户表 =====
CREATE TABLE IF NOT EXISTS users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  openid VARCHAR(64) NOT NULL UNIQUE COMMENT '微信openid',
  unionid VARCHAR(64) DEFAULT NULL COMMENT '微信unionid',
  nickname VARCHAR(64) DEFAULT NULL,
  avatar_url VARCHAR(512) DEFAULT NULL,
  phone VARCHAR(20) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_openid (openid)
) ENGINE=InnoDB COMMENT='用户基础信息';

-- ===== 会员表（成长值+等级+持卡状态） =====
CREATE TABLE IF NOT EXISTS members (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  growth_value INT DEFAULT 0 COMMENT '成长值（永久累计）',
  level TINYINT DEFAULT 0 COMMENT '0普通 1素袍 2青袍 3玄袍 4金袍',
  card_status TINYINT DEFAULT 0 COMMENT '0无卡 1持卡 2休眠',
  is_dormant TINYINT DEFAULT 0 COMMENT '是否休眠',
  dormant_at TIMESTAMP NULL COMMENT '休眠时间',
  last_checkin_at TIMESTAMP NULL COMMENT '最后核销时间',
  saved_fen INT DEFAULT 0 COMMENT '年卡累计抵扣分',
  trial_used TINYINT DEFAULT 0 COMMENT '是否已用7天试用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_level (level)
) ENGINE=InnoDB COMMENT='会员成长与等级';

-- ===== 成长值流水表 =====
CREATE TABLE IF NOT EXISTS growth_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  action_type VARCHAR(32) NOT NULL COMMENT 'consume/checkin/post/like/invite/route/festival/task/repost',
  action_value INT NOT NULL COMMENT '本次获得成长值',
  ref_id VARCHAR(64) DEFAULT NULL COMMENT '关联订单/打卡ID',
  ref_type VARCHAR(32) DEFAULT NULL COMMENT 'order/checkin/post',
  month_cap_used INT DEFAULT 0 COMMENT '本月已用行为值上限',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_member (member_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB COMMENT='成长值流水';

-- ===== 年卡SKU表 =====
CREATE TABLE IF NOT EXISTS card_skus (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sku_code VARCHAR(32) NOT NULL UNIQUE COMMENT 'standard/earlybird/family/enterprise',
  name VARCHAR(64) NOT NULL,
  price INT NOT NULL COMMENT '分',
  scenic_times INT DEFAULT 10 COMMENT '景区次数',
  hotel_nights INT DEFAULT 3 COMMENT '酒店协议晚数',
  show_times INT DEFAULT 2 COMMENT '演出次数',
  rent_times INT DEFAULT 3 COMMENT '汉服租赁次数',
  study_times INT DEFAULT 0 COMMENT '研学次数',
  max_companions INT DEFAULT 4 COMMENT '同行人数',
  is_active TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='年卡SKU配置';

-- 年卡SKU初始数据
INSERT INTO card_skus (sku_code, name, price, scenic_times, hotel_nights, show_times, rent_times, study_times, max_companions) VALUES
  ('standard', '标准款', 39900, 10, 3, 2, 3, 0, 4),
  ('earlybird', '早鸟款', 29900, 10, 3, 2, 3, 0, 4),
  ('family', '家庭款', 99900, 20, 6, 4, 3, 5, 4),
  ('enterprise', '企业款', 0, 0, 0, 0, 0, 0, 4)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- ===== 年卡表（用户持有的年卡） =====
CREATE TABLE IF NOT EXISTS annual_cards (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  card_no VARCHAR(32) NOT NULL UNIQUE COMMENT '卡号',
  member_id BIGINT NOT NULL,
  sku_code VARCHAR(32) NOT NULL,
  price INT NOT NULL COMMENT '实付分',
  remain_scenic INT DEFAULT 10,
  remain_hotel INT DEFAULT 3,
  remain_show INT DEFAULT 2,
  remain_rent INT DEFAULT 3,
  remain_study INT DEFAULT 0,
  status TINYINT DEFAULT 0 COMMENT '0未激活 1有效 2已到期 3已转赠 4已退款',
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expire_at TIMESTAMP NOT NULL,
  transferred_to BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_member (member_id),
  INDEX idx_status (status),
  INDEX idx_expire (expire_at)
) ENGINE=InnoDB COMMENT='用户年卡';

-- ===== 线路表 =====
CREATE TABLE IF NOT EXISTS routes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  route_code VARCHAR(32) NOT NULL UNIQUE COMMENT 'silk/bayarea/southwest',
  name VARCHAR(64) NOT NULL,
  required_stamps INT DEFAULT 3,
  reward_badge_name VARCHAR(64),
  is_active TINYINT DEFAULT 1
) ENGINE=InnoDB COMMENT='集章线路';

INSERT INTO routes (route_code, name, required_stamps, reward_badge_name) VALUES
  ('silk', '丝路线', 4, '丝路金属徽章'),
  ('bayarea', '湾区线', 3, '湾区金属徽章'),
  ('southwest', '西南线', 3, '西南金属徽章')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- ===== 景区表 =====
CREATE TABLE IF NOT EXISTS scenes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  scene_code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  city VARCHAR(64),
  route_id BIGINT DEFAULT NULL,
  has_green_channel TINYINT DEFAULT 0 COMMENT '是否有绿色通道',
  has_rest_area TINYINT DEFAULT 0 COMMENT '是否有休息专区',
  has_stamp_point TINYINT DEFAULT 0 COMMENT '是否有实体盖章点',
  is_active TINYINT DEFAULT 1
) ENGINE=InnoDB COMMENT='景区';

-- ===== 护照表 =====
CREATE TABLE IF NOT EXISTS passports (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL UNIQUE,
  has_physical_book TINYINT DEFAULT 0 COMMENT '是否有皮质实体本',
  book_serial VARCHAR(32) DEFAULT NULL COMMENT '实体本编号',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_member (member_id)
) ENGINE=InnoDB COMMENT='集章护照';

-- ===== 盖章记录表 =====
CREATE TABLE IF NOT EXISTS stamps (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  passport_id BIGINT NOT NULL,
  scene_id BIGINT NOT NULL,
  route_id BIGINT DEFAULT NULL,
  is_physical TINYINT DEFAULT 0 COMMENT '是否实物章',
  stamped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_passport_scene (passport_id, scene_id),
  INDEX idx_passport (passport_id),
  INDEX idx_route (route_id)
) ENGINE=InnoDB COMMENT='盖章记录';

-- ===== 勋章表 =====
CREATE TABLE IF NOT EXISTS badges (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  badge_type VARCHAR(32) NOT NULL COMMENT 'route_silk/route_bayarea/route_southwest/grand_prize',
  route_id BIGINT DEFAULT NULL,
  serial_no VARCHAR(32) DEFAULT NULL COMMENT '编号',
  status TINYINT DEFAULT 0 COMMENT '0虚拟 1已领取实体 2已邮寄',
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_member (member_id)
) ENGINE=InnoDB COMMENT='勋章';

-- ===== 订单表 =====
CREATE TABLE IF NOT EXISTS orders (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(32) NOT NULL UNIQUE,
  member_id BIGINT NOT NULL,
  type VARCHAR(32) NOT NULL COMMENT 'card/ticket/hotel/show/rent/trial',
  ref_id VARCHAR(64) DEFAULT NULL COMMENT '关联SKU/景区/服务ID',
  title VARCHAR(128) DEFAULT NULL,
  cover VARCHAR(512) DEFAULT NULL,
  place VARCHAR(128) DEFAULT NULL,
  qty INT DEFAULT 1,
  visitor VARCHAR(64) DEFAULT NULL,
  phone VARCHAR(20) DEFAULT NULL,
  use_day DATE DEFAULT NULL,
  amount INT NOT NULL COMMENT '门市价分',
  pay_amount INT DEFAULT 0 COMMENT '实付分',
  covered_by_card TINYINT DEFAULT 0 COMMENT '是否年卡抵扣',
  status TINYINT DEFAULT 0 COMMENT '0待支付 1已支付 2已核销 3已退款 4已取消',
  paid_at TIMESTAMP NULL,
  refunded_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_member (member_id),
  INDEX idx_status (status),
  INDEX idx_order_no (order_no)
) ENGINE=InnoDB COMMENT='订单';

-- ===== 核销记录表 =====
CREATE TABLE IF NOT EXISTS verifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  order_id BIGINT DEFAULT NULL,
  card_id BIGINT DEFAULT NULL COMMENT '年卡核销',
  scene_id BIGINT DEFAULT NULL COMMENT '景区核销',
  type VARCHAR(32) NOT NULL COMMENT 'scenic/hotel/show/rent/study',
  companions INT DEFAULT 1 COMMENT '同行人数',
  verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_member (member_id),
  INDEX idx_scene (scene_id)
) ENGINE=InnoDB COMMENT='核销记录';

-- ===== 动态/打卡表 =====
CREATE TABLE IF NOT EXISTS posts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  type VARCHAR(32) DEFAULT 'checkin' COMMENT 'checkin/guide/hanfu/food',
  content TEXT,
  images JSON DEFAULT NULL,
  location VARCHAR(128) DEFAULT NULL,
  scene_id BIGINT DEFAULT NULL,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  is_official TINYINT DEFAULT 0 COMMENT '是否官方收录',
  status TINYINT DEFAULT 1 COMMENT '0审核中 1正常 2隐藏',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_member (member_id),
  INDEX idx_scene (scene_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB COMMENT='动态/打卡';

-- ===== 点赞表 =====
CREATE TABLE IF NOT EXISTS likes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  post_id BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_member_post (member_id, post_id),
  INDEX idx_post (post_id)
) ENGINE=InnoDB COMMENT='点赞';

-- ===== 权益表 =====
CREATE TABLE IF NOT EXISTS benefits (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  benefit_code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(64) NOT NULL,
  required_level TINYINT DEFAULT 0 COMMENT '要求等级',
  require_card TINYINT DEFAULT 0 COMMENT '是否要求持卡',
  description VARCHAR(256),
  is_active TINYINT DEFAULT 1
) ENGINE=InnoDB COMMENT='权益配置';

INSERT INTO benefits (benefit_code, name, required_level, require_card, description) VALUES
  ('green_channel', '绿色排队通道', 1, 1, '持卡袍会员快速入园'),
  ('rest_area', '同袍休息专区', 1, 1, '补妆/寄存/饮水/汉服整理'),
  ('quota_reserve', '旺季预约配额', 1, 1, '节假日袍会员预留配额先抢'),
  ('free_tickets', '年卡免票次数', 1, 1, '按SKU含N次景区'),
  ('joint_purchase', '联名权益购买', 2, 1, '联名款提前解锁购买资格'),
  ('show_seat', '演出优选座位', 1, 1, '前3排或中区'),
  ('physical_badge', '实体金属徽章', 3, 1, '集齐线路自动得'),
  ('leather_passport', '皮质实体护照本', 1, 1, '刻名+编号'),
  ('transfer_gift', '转赠裂变', 1, 1, '年卡可转赠'),
  ('parade_c', '巡游C位候选', 3, 1, '执炬+持卡'),
  ('annual_gala', '年会盛典入场', 3, 1, '玄袍+持卡'),
  ('talent_cert', '达人认证', 4, 1, '执炬+持卡')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- ===== 权益核销记录 =====
CREATE TABLE IF NOT EXISTS benefit_verifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  benefit_code VARCHAR(32) NOT NULL,
  scene_id BIGINT DEFAULT NULL,
  verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_member (member_id)
) ENGINE=InnoDB COMMENT='权益核销记录';

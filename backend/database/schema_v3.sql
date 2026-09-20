-- 用户互动表

-- 收藏
CREATE TABLE IF NOT EXISTS favorites (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  target_type VARCHAR(32) NOT NULL COMMENT 'spot/garment/event/service/article',
  target_id BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_fav (member_id, target_type, target_id),
  INDEX idx_member (member_id)
) ENGINE=InnoDB COMMENT='收藏';

-- 评论
CREATE TABLE IF NOT EXISTS comments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  post_id BIGINT DEFAULT NULL,
  target_type VARCHAR(32) DEFAULT 'post',
  target_id BIGINT DEFAULT NULL,
  content TEXT NOT NULL,
  parent_id BIGINT DEFAULT NULL COMMENT '回复某评论',
  status TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_post (post_id),
  INDEX idx_member (member_id)
) ENGINE=InnoDB COMMENT='评论';

-- 会话
CREATE TABLE IF NOT EXISTS conversations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  target_type VARCHAR(32) DEFAULT 'user' COMMENT 'user/group/system',
  target_id BIGINT DEFAULT NULL,
  target_name VARCHAR(128) DEFAULT NULL,
  target_avatar VARCHAR(512) DEFAULT NULL,
  last_message TEXT,
  unread INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_member (member_id)
) ENGINE=InnoDB COMMENT='会话';

-- 消息
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT NOT NULL,
  sender_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  msg_type VARCHAR(32) DEFAULT 'text' COMMENT 'text/image/system',
  is_read TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_conv (conversation_id),
  INDEX idx_sender (sender_id)
) ENGINE=InnoDB COMMENT='聊天消息';

-- 通知
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  type VARCHAR(32) NOT NULL COMMENT 'like/comment/fan/system/order/benefit',
  title VARCHAR(128) NOT NULL,
  content TEXT,
  link VARCHAR(512) DEFAULT NULL,
  is_read TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_member (member_id),
  INDEX idx_read (is_read)
) ENGINE=InnoDB COMMENT='通知';

-- 管理员
CREATE TABLE IF NOT EXISTS admins (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password VARCHAR(256) NOT NULL,
  name VARCHAR(64) DEFAULT NULL,
  role VARCHAR(32) DEFAULT 'editor' COMMENT 'admin/editor',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='管理员';

-- 内容审核日志
CREATE TABLE IF NOT EXISTS content_audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_id BIGINT DEFAULT NULL,
  action VARCHAR(32) NOT NULL COMMENT 'create/update/delete/publish/hide',
  target_type VARCHAR(32) NOT NULL,
  target_id BIGINT NOT NULL,
  detail TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_target (target_type, target_id)
) ENGINE=InnoDB COMMENT='内容审核日志';

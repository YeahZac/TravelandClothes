-- auth_token 列名与 authService 对齐：expire_at → expires_at
-- 云托管启动 warmSchemas 也会自动执行同等迁移；本文件供人工/运维补跑。

-- 仅有旧列时改名
-- ALTER TABLE auth_token CHANGE COLUMN expire_at expires_at VARCHAR(40) NOT NULL DEFAULT '';

-- 两列并存时：拷贝后删旧列
UPDATE auth_token
SET expires_at = expire_at
WHERE (expires_at IS NULL OR expires_at = '')
  AND expire_at IS NOT NULL
  AND expire_at != '';

-- 若 CHANGE 尚未执行且仅有 expire_at，请先跑：
-- ALTER TABLE auth_token CHANGE COLUMN expire_at expires_at VARCHAR(40) NOT NULL DEFAULT '';

-- 两列并存时删旧列（确认 expires_at 有数据后再执行）
-- ALTER TABLE auth_token DROP COLUMN expire_at;

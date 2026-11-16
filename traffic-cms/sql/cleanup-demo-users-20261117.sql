-- 清理程序自动造的演示账号（小林/七七、demo_friend_*、channel=demo）
-- 目标库：travel_clothes（CynosDB）
-- 用法：云控制台可逐条执行；用普通表存 ID，不依赖 TEMPORARY TABLE / 同一连接
--
-- 验收：最后 demo_left = 0；真实「微信用户 / YX*」仍在

USE travel_clothes;

-- ========== 1. 预览 ==========
SELECT id, nick_name, openid, invite_code, channel, created_at
FROM user_account
WHERE channel = 'demo'
   OR openid LIKE 'demo_friend_%'
   OR openid LIKE 'demo_%'
ORDER BY id;

-- ========== 2. 落一批要删的用户 ID（普通表，可跨语句）==========
DROP TABLE IF EXISTS _cleanup_demo_uids;
CREATE TABLE _cleanup_demo_uids (
  id INT NOT NULL PRIMARY KEY
);

INSERT INTO _cleanup_demo_uids (id)
SELECT id
FROM user_account
WHERE channel = 'demo'
   OR openid LIKE 'demo_friend_%'
   OR openid LIKE 'demo_%';

SELECT COUNT(*) AS will_delete FROM _cleanup_demo_uids;

-- ========== 3. 按依赖删关联，再删用户 ==========
DELETE FROM friend_edge
WHERE user_id IN (SELECT id FROM _cleanup_demo_uids)
   OR friend_user_id IN (SELECT id FROM _cleanup_demo_uids);

DELETE FROM social_action_day WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM social_feed WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM jar_ledger WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM jar_state WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM wallet_ledger WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM user_wallet WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM tree_drop WHERE owner_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM user_seed WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM auth_token WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM task_completion WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM task_action_event WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM user_steps_day WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM user_checkin WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM iaa_reward WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM subscribe_grant WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM subscribe_outbox WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM invite_reward_hold WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);

DELETE FROM invite_event
WHERE inviter_id IN (SELECT id FROM _cleanup_demo_uids)
   OR invitee_id IN (SELECT id FROM _cleanup_demo_uids);

DELETE FROM lottery_draw WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM lottery_win_claim WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM user_lottery_pity WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM lottery_action_lock WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM flash_redeem_log WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM user_address WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM user_feedback WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM festival_ticket WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);
DELETE FROM redeem_order WHERE user_id IN (SELECT id FROM _cleanup_demo_uids);

DELETE FROM user_account
WHERE id IN (SELECT id FROM _cleanup_demo_uids);

-- ========== 4. 收尾 + 验收 ==========
DROP TABLE IF EXISTS _cleanup_demo_uids;

SELECT COUNT(*) AS demo_left
FROM user_account
WHERE channel = 'demo'
   OR openid LIKE 'demo_friend_%'
   OR openid LIKE 'demo_%';
-- 期望 demo_left = 0

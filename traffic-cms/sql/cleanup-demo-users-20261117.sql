-- 清理程序自动造的演示账号（小林/七七、demo_friend_*、channel=demo）
-- 目标库：travel_clothes（CynosDB）
-- 不会删除真实微信登录用户（邀请码 YX*、openid 非 demo_*）
--
-- 验收：
-- 1) 预览 SELECT 只应出现小林/七七/阿柚等 demo 行
-- 2) 删除后同条件 COUNT(*) = 0
-- 3) 真实「微信用户 / YX*」仍在 user_account

USE travel_clothes;

-- ========== 1. 先预览（务必先跑）==========
SELECT id, nick_name, openid, invite_code, channel, created_at
FROM user_account
WHERE channel = 'demo'
   OR openid LIKE 'demo_friend_%'
   OR openid LIKE 'demo_%'
ORDER BY id;

-- ========== 2. 确认无误后再执行删除 ==========
START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS tmp_demo_uids;
CREATE TEMPORARY TABLE tmp_demo_uids AS
SELECT id
FROM user_account
WHERE channel = 'demo'
   OR openid LIKE 'demo_friend_%'
   OR openid LIKE 'demo_%';

-- 好友边（双向）
DELETE FROM friend_edge
WHERE user_id IN (SELECT id FROM tmp_demo_uids)
   OR friend_user_id IN (SELECT id FROM tmp_demo_uids);

DELETE FROM social_action_day WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM social_feed WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM jar_ledger WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM jar_state WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM wallet_ledger WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM user_wallet WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM tree_drop WHERE owner_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM user_seed WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM auth_token WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM task_completion WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM task_action_event WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM user_steps_day WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM user_checkin WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM iaa_reward WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM subscribe_grant WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM subscribe_outbox WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM invite_reward_hold WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM invite_event
WHERE inviter_id IN (SELECT id FROM tmp_demo_uids)
   OR invitee_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM lottery_draw WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM lottery_win_claim WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM user_lottery_pity WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM lottery_action_lock WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM flash_redeem_log WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM user_address WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM user_feedback WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM festival_ticket WHERE user_id IN (SELECT id FROM tmp_demo_uids);
DELETE FROM redeem_order WHERE user_id IN (SELECT id FROM tmp_demo_uids);

DELETE FROM user_account WHERE id IN (SELECT id FROM tmp_demo_uids);

COMMIT;

-- ========== 3. 验收 ==========
SELECT COUNT(*) AS demo_left
FROM user_account
WHERE channel = 'demo'
   OR openid LIKE 'demo_friend_%'
   OR openid LIKE 'demo_%';
-- 期望 demo_left = 0

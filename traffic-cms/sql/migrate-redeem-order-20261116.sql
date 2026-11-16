-- 目标库：travel_clothes
-- 部署 stability-kernel-v4 前执行；可重复执行。
USE travel_clothes;

DROP PROCEDURE IF EXISTS qmyx_add_column_if_missing;
DELIMITER //
CREATE PROCEDURE qmyx_add_column_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition VARCHAR(512)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = p_table
       AND COLUMN_NAME = p_column
  ) THEN
    SET @ddl = CONCAT(
      'ALTER TABLE `', REPLACE(p_table, '`', '``'),
      '` ADD COLUMN `', REPLACE(p_column, '`', '``'),
      '` ', p_definition
    );
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END//
DELIMITER ;

CALL qmyx_add_column_if_missing('redeem_order', 'refund_status', 'VARCHAR(16) NOT NULL DEFAULT ''none''');
CALL qmyx_add_column_if_missing('redeem_order', 'refund_cent', 'INT NOT NULL DEFAULT 0');
CALL qmyx_add_column_if_missing('redeem_order', 'wx_refund_id', 'VARCHAR(128) NOT NULL DEFAULT ''''');
CALL qmyx_add_column_if_missing('redeem_order', 'refunded_at', 'VARCHAR(40) NOT NULL DEFAULT ''''');
CALL qmyx_add_column_if_missing('redeem_order', 'entry_from', 'VARCHAR(64) NOT NULL DEFAULT ''''');
CALL qmyx_add_column_if_missing('redeem_order', 'items_json', 'MEDIUMTEXT NULL');

DROP PROCEDURE qmyx_add_column_if_missing;

-- 验收：应返回 6 行，且 present 全为 1。
SELECT required.column_name,
       COUNT(c.COLUMN_NAME) AS present
FROM (
  SELECT 'refund_status' AS column_name
  UNION ALL SELECT 'refund_cent'
  UNION ALL SELECT 'wx_refund_id'
  UNION ALL SELECT 'refunded_at'
  UNION ALL SELECT 'entry_from'
  UNION ALL SELECT 'items_json'
) required
LEFT JOIN information_schema.COLUMNS c
  ON c.TABLE_SCHEMA = DATABASE()
 AND c.TABLE_NAME = 'redeem_order'
 AND c.COLUMN_NAME = required.column_name
GROUP BY required.column_name
ORDER BY required.column_name;

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `endpoint` varchar(500) NOT NULL,
  `p256dh` varchar(200) NOT NULL,
  `auth` varchar(100) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_push_sub_user_endpoint` (`user_id`,`endpoint`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

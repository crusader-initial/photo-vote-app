-- Add phone login support: users.phone, users.passwordHash, favorites.userId
ALTER TABLE `users` ADD COLUMN `phone` varchar(20);
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `passwordHash` varchar(255);
--> statement-breakpoint
ALTER TABLE `users` ADD UNIQUE INDEX `users_phone_unique`(`phone`);
--> statement-breakpoint
ALTER TABLE `favorites` ADD COLUMN `userId` int;
--> statement-breakpoint
-- Optional: add index for favorites by userId for getFavoritesByUserId
CREATE INDEX `favorites_userId_idx` ON `favorites` (`userId`);

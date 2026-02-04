CREATE TABLE `comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cardId` int NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);

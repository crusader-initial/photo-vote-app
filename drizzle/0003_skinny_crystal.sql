CREATE TABLE `favorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cardId` int NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `favorites_id` PRIMARY KEY(`id`)
);

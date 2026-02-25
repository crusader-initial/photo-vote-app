import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) or "phone:xxx" for phone login. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  /** Phone number for phone login; unique when set. */
  phone: varchar("phone", { length: 20 }).unique(),
  /** bcrypt/pbkdf2 hash for phone login; only set when user registered with phone. */
  passwordHash: varchar("passwordHash", { length: 255 }),
  /** User UUID from Hermit Purple Java service (optional). */
  hermitUserUUID: varchar("hermitUserUUID", { length: 64 }),
  /** Avatar image URL (uploaded by user). */
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Cards table - stores voting cards created by uploaders
 */
export const cards = mysqlTable("cards", {
  id: int("id").autoincrement().primaryKey(),
  /** Device ID of the uploader */
  deviceId: varchar("deviceId", { length: 64 }).notNull(),
  /** Index of the photo the uploader predicted would be chosen (0-based) */
  predictedPhotoIndex: int("predictedPhotoIndex").notNull(),
  /** Total number of votes collected */
  totalVotes: int("totalVotes").default(0).notNull(),
  /** Whether the card has reached 30 votes */
  isCompleted: boolean("isCompleted").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Card = typeof cards.$inferSelect;
export type InsertCard = typeof cards.$inferInsert;

/**
 * Photos table - stores photos belonging to cards
 */
export const photos = mysqlTable("photos", {
  id: int("id").autoincrement().primaryKey(),
  /** Reference to the parent card */
  cardId: int("cardId").notNull(),
  /** Photo URL in S3 storage */
  url: varchar("url", { length: 512 }).notNull(),
  /** Index of the photo within the card (0-3) */
  photoIndex: int("photoIndex").notNull(),
  /** Number of votes this photo received */
  voteCount: int("voteCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Photo = typeof photos.$inferSelect;
export type InsertPhoto = typeof photos.$inferInsert;

/**
 * Votes table - stores individual votes
 */
export const votes = mysqlTable("votes", {
  id: int("id").autoincrement().primaryKey(),
  /** Reference to the card being voted on */
  cardId: int("cardId").notNull(),
  /** Reference to the photo that was chosen */
  photoId: int("photoId").notNull(),
  /** Device ID of the voter */
  deviceId: varchar("deviceId", { length: 64 }).notNull(),
  /** Date of the vote (for daily limit tracking) */
  voteDate: varchar("voteDate", { length: 10 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Vote = typeof votes.$inferSelect;
export type InsertVote = typeof votes.$inferInsert;

/**
 * Comments table - stores comments on cards (only visible after voting).
 * parentId = null 为主评论，非 null 为回复（楼中楼）。
 */
export const comments = mysqlTable("comments", {
  id: int("id").autoincrement().primaryKey(),
  /** Reference to the card being commented on */
  cardId: int("cardId").notNull(),
  /** Parent comment id; null = 主评论，非 null = 回复该条 */
  parentId: int("parentId"),
  /** Device ID of the commenter */
  deviceId: varchar("deviceId", { length: 64 }).notNull(),
  /** Comment content */
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;

/**
 * Favorites table - stores user's favorite cards (only after voting)
 * When user is logged in by phone, userId is set; otherwise deviceId is used.
 */
export const favorites = mysqlTable("favorites", {
  id: int("id").autoincrement().primaryKey(),
  /** Reference to the card being favorited */
  cardId: int("cardId").notNull(),
  /** User ID when logged in by phone; null when using deviceId only */
  userId: int("userId"),
  /** Device ID of the user who favorited (fallback when not logged in) */
  deviceId: varchar("deviceId", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Favorite = typeof favorites.$inferSelect;
export type InsertFavorite = typeof favorites.$inferInsert;

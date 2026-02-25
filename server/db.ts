import { eq, and, sql, desc, notInArray, isNull, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, cards, photos, votes, comments, favorites, feedbacks, InsertCard, InsertPhoto, InsertVote, InsertComment, InsertFavorite, InsertFeedback, Card, Photo, Comment } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByPhone(phone: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

const PHONE_OPENID_PREFIX = "phone:";
export function phoneToOpenId(phone: string): string {
  return PHONE_OPENID_PREFIX + phone.trim();
}

export async function createUserWithPhone(phone: string, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const openId = phoneToOpenId(phone);
  const now = new Date();
  await db.insert(users).values({
    openId,
    phone: phone.trim(),
    passwordHash,
    lastSignedIn: now,
  });
  return getUserByOpenId(openId);
}

/** Create user by phone only (for verification-code login; no password). */
export async function createUserByPhone(phone: string, hermitUserUUID?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const openId = phoneToOpenId(phone);
  const now = new Date();
  await db.insert(users).values({
    openId,
    phone: phone.trim(),
    hermitUserUUID,
    lastSignedIn: now,
  });
  return getUserByOpenId(openId);
}

export async function updateUserAvatar(userId: number, avatarUrl: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ avatarUrl }).where(eq(users.id, userId));
}

// ==================== Card Operations ====================

export async function createCard(data: InsertCard): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(cards).values(data);
  return Number(result[0].insertId);
}

export async function getCardById(cardId: number): Promise<Card | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  return result[0];
}

export async function getCardsByUserId(userId: number): Promise<Card[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(cards).where(eq(cards.userId, userId)).orderBy(desc(cards.createdAt));
}

export async function updateCardVotes(cardId: number, totalVotes: number, isCompleted: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(cards).set({ totalVotes, isCompleted }).where(eq(cards.id, cardId));
}

/** Delete a card and all related data. Only allowed for card owner (userId). */
export async function deleteCard(cardId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const card = await getCardById(cardId);
  if (!card || card.userId !== userId) return false;

  await db.delete(votes).where(eq(votes.cardId, cardId));
  await db.delete(comments).where(eq(comments.cardId, cardId));
  await db.delete(favorites).where(eq(favorites.cardId, cardId));
  await db.delete(photos).where(eq(photos.cardId, cardId));
  await db.delete(cards).where(eq(cards.id, cardId));
  return true;
}

// ==================== Photo Operations ====================

export async function createPhotos(data: InsertPhoto[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(photos).values(data);
}

export async function getPhotosByCardId(cardId: number): Promise<Photo[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(photos).where(eq(photos.cardId, cardId));
}

export async function incrementPhotoVoteCount(photoId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(photos).set({ voteCount: sql`${photos.voteCount} + 1` }).where(eq(photos.id, photoId));
}

// ==================== Vote Operations ====================

export async function createVote(data: InsertVote): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(votes).values(data);
  return Number(result[0].insertId);
}

export async function hasVotedOnCard(userId: number, cardId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const result = await db.select().from(votes)
    .where(and(eq(votes.userId, userId), eq(votes.cardId, cardId)))
    .limit(1);
  
  return result.length > 0;
}

export async function getRandomAvailableCard(userId?: number): Promise<Card | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const isDevelopment = process.env.NODE_ENV === "development";
  const conditions = [eq(cards.isCompleted, false)];

  if (userId != null) {
    const votedRows = await db.select({ cardId: votes.cardId }).from(votes).where(eq(votes.userId, userId));
    const votedCardIds = votedRows.map((r) => r.cardId);
    if (votedCardIds.length > 0) {
      conditions.push(notInArray(cards.id, votedCardIds));
    }
    if (!isDevelopment) {
      conditions.push(sql`${cards.userId} != ${userId} OR ${cards.userId} IS NULL`);
    }
  }

  const result = await db
    .select()
    .from(cards)
    .where(and(...conditions))
    .orderBy(sql`RAND()`)
    .limit(1);

  return result[0];
}

/** Get multiple random cards for voting (for preloading). Excludes voted + optional ids. */
export async function getRandomAvailableCards(
  limit: number,
  excludeCardIds: number[] = [],
  userId?: number
): Promise<Card[]> {
  const db = await getDb();
  if (!db) return [];

  const isDevelopment = process.env.NODE_ENV === "development";
  const conditions = [eq(cards.isCompleted, false)];

  if (userId != null) {
    const votedRows = await db.select({ cardId: votes.cardId }).from(votes).where(eq(votes.userId, userId));
    const votedCardIds = votedRows.map((r) => r.cardId);
    const excludeIds = [...new Set([...votedCardIds, ...excludeCardIds])];
    if (excludeIds.length > 0) {
      conditions.push(notInArray(cards.id, excludeIds));
    }
    if (!isDevelopment) {
      conditions.push(sql`${cards.userId} != ${userId} OR ${cards.userId} IS NULL`);
    }
  } else if (excludeCardIds.length > 0) {
    conditions.push(notInArray(cards.id, excludeCardIds));
  }

  const result = await db
    .select()
    .from(cards)
    .where(and(...conditions))
    .orderBy(sql`RAND()`)
    .limit(limit);

  return result;
}

// ==================== Comment Operations ====================

/** Build a display name for a commenter. Prefers real name, then masked phone, then generic fallback. */
function buildUserName(user: { name: string | null; phone: string | null } | null | undefined): string {
  if (user?.name?.trim()) return user.name.trim();
  if (user?.phone) {
    const p = user.phone;
    if (p.length >= 11) return `${p.slice(0, 3)}****${p.slice(7)}`;
    return p;
  }
  return "用户";
}

export async function createComment(data: InsertComment): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(comments).values(data);
  return Number(result[0].insertId);
}

/** 主评论列表（仅 parentId 为 null），按热度（回复数）+ 时间排序 */
export async function getTopLevelCommentsByCardId(cardId: number): Promise<(Comment & { replyCount: number; userName: string })[]> {
  const db = await getDb();
  if (!db) return [];

  const topLevel = await db.select().from(comments)
    .where(and(eq(comments.cardId, cardId), isNull(comments.parentId)))
    .orderBy(desc(comments.createdAt));

  if (topLevel.length === 0) return [];

  const ids = topLevel.map((c) => c.id);
  const countRows = await db.select({
    parentId: comments.parentId,
    replyCount: sql<number>`count(*)`.as("replyCount"),
  })
    .from(comments)
    .where(inArray(comments.parentId, ids))
    .groupBy(comments.parentId);

  const countMap = new Map<number, number>();
  countRows.forEach((r) => {
    if (r.parentId != null) countMap.set(r.parentId, Number(r.replyCount));
  });

  const withCount = topLevel.map((c) => ({
    ...c,
    replyCount: countMap.get(c.id) ?? 0,
  }));

  withCount.sort((a, b) => {
    const hotA = a.replyCount;
    const hotB = b.replyCount;
    if (hotB !== hotA) return hotB - hotA;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Batch-fetch user info for display names
  const userIds = [...new Set(withCount.filter((c) => c.userId != null).map((c) => c.userId as number))];
  const userMap = new Map<number, { name: string | null; phone: string | null }>();
  if (userIds.length > 0) {
    const userRows = await db.select({ id: users.id, name: users.name, phone: users.phone })
      .from(users).where(inArray(users.id, userIds));
    userRows.forEach((u) => userMap.set(u.id, { name: u.name, phone: u.phone }));
  }

  return withCount.map((c) => ({
    ...c,
    userName: buildUserName(c.userId != null ? userMap.get(c.userId) : null),
  }));
}

/** 某条评论下的直接回复（楼中楼），按时间正序 */
export async function getRepliesByParentId(parentId: number): Promise<(Comment & { replyCount: number; userName: string })[]> {
  const db = await getDb();
  if (!db) return [];

  const replies = await db.select().from(comments)
    .where(eq(comments.parentId, parentId))
    .orderBy(comments.createdAt);

  if (replies.length === 0) return [];

  const ids = replies.map((c) => c.id);
  const countRows = await db.select({
    parentId: comments.parentId,
    replyCount: sql<number>`count(*)`.as("replyCount"),
  })
    .from(comments)
    .where(inArray(comments.parentId, ids))
    .groupBy(comments.parentId);

  const countMap = new Map<number, number>();
  countRows.forEach((r) => {
    if (r.parentId != null) countMap.set(r.parentId, Number(r.replyCount));
  });

  // Batch-fetch user info for display names
  const userIds = [...new Set(replies.filter((c) => c.userId != null).map((c) => c.userId as number))];
  const userMap = new Map<number, { name: string | null; phone: string | null }>();
  if (userIds.length > 0) {
    const userRows = await db.select({ id: users.id, name: users.name, phone: users.phone })
      .from(users).where(inArray(users.id, userIds));
    userRows.forEach((u) => userMap.set(u.id, { name: u.name, phone: u.phone }));
  }

  return replies.map((c) => ({
    ...c,
    replyCount: countMap.get(c.id) ?? 0,
    userName: buildUserName(c.userId != null ? userMap.get(c.userId) : null),
  }));
}

export async function getCommentById(id: number): Promise<Comment | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  return result[0] ?? null;
}

/** 兼容旧逻辑：返回该卡片下所有评论（扁平，按时间倒序） */
export async function getCommentsByCardId(cardId: number): Promise<Comment[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(comments)
    .where(eq(comments.cardId, cardId))
    .orderBy(desc(comments.createdAt));
}

export async function getCommentsCount(cardId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(comments)
    .where(eq(comments.cardId, cardId));
  
  return result[0]?.count ?? 0;
}

export async function getVoteByUserAndCard(userId: number, cardId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(votes)
    .where(and(eq(votes.userId, userId), eq(votes.cardId, cardId)))
    .limit(1);
  
  return result[0] ?? null;
}

// ==================== Favorite Operations ====================

export async function createFavorite(data: InsertFavorite): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(favorites).values(data);
  return Number(result[0].insertId);
}

export async function deleteFavoriteByUserId(userId: number, cardId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.cardId, cardId)));
}

export async function isFavoritedByUserId(userId: number, cardId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select().from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.cardId, cardId)))
    .limit(1);
  return result.length > 0;
}

export async function getFavoritesByUserId(userId: number): Promise<{ cardId: number; createdAt: Date }[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({
    cardId: favorites.cardId,
    createdAt: favorites.createdAt,
  })
    .from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt));
  return result;
}

// ==================== Feedback Operations ====================

export async function createFeedback(data: InsertFeedback): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(feedbacks).values(data);
  return Number(result[0].insertId);
}

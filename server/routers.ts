import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { storagePut } from "./storage";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // User operations
  users: router({
    updateAvatar: protectedProcedure
      .input(z.object({
        base64: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const extension = input.mimeType.split("/")[1] || "jpg";
        const fileKey = `avatars/${ctx.user.id}-${randomSuffix}.${extension}`;
        const buffer = Buffer.from(input.base64, "base64");
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        await db.updateUserAvatar(ctx.user.id, url);
        return { avatarUrl: url };
      }),
  }),

  // Card operations
  cards: router({
    // Create a new card with photos
    create: protectedProcedure
      .input(z.object({
        predictedPhotoIndex: z.number().min(0).max(3),
        photos: z.array(z.object({
          base64: z.string(),
          mimeType: z.string(),
        })).min(2).max(4),
      }))
      .mutation(async ({ input, ctx }) => {
        const cardId = await db.createCard({
          userId: ctx.user.id,
          predictedPhotoIndex: input.predictedPhotoIndex,
        });

        try {
          const photoRecords = await Promise.all(
            input.photos.map(async (photo, index) => {
              const randomSuffix = Math.random().toString(36).substring(2, 10);
              const extension = photo.mimeType.split("/")[1] || "jpg";
              const fileKey = `cards/${cardId}/photo-${index}-${randomSuffix}.${extension}`;
              const buffer = Buffer.from(photo.base64, "base64");
              const { url } = await storagePut(fileKey, buffer, photo.mimeType);
              return { cardId, url, photoIndex: index };
            }),
          );

          await db.createPhotos(photoRecords);
        } catch (err) {
          // Rollback: delete the card if photo upload or save fails
          await db.deleteCard(cardId, ctx.user.id);
          throw err;
        }

        return { cardId };
      }),

    // Get card by ID with photos
    getById: publicProcedure
      .input(z.object({ cardId: z.number() }))
      .query(async ({ input }) => {
        const card = await db.getCardById(input.cardId);
        if (!card) return null;
        const photos = await db.getPhotosByCardId(input.cardId);
        return { ...card, photos };
      }),

    // Get cards created by the current logged-in user
    getMyCards: protectedProcedure
      .query(async ({ ctx }) => {
        const cards = await db.getCardsByUserId(ctx.user.id);
        const cardsWithPhotos = await Promise.all(
          cards.map(async (card) => {
            const photos = await db.getPhotosByCardId(card.id);
            return { ...card, photos };
          })
        );
        return cardsWithPhotos;
      }),

    // Delete own card (and related votes, comments, favorites, photos)
    delete: protectedProcedure
      .input(z.object({ cardId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const deleted = await db.deleteCard(input.cardId, ctx.user.id);
        if (!deleted) {
          throw new Error("无法删除该卡片（仅可删除自己的上传）");
        }
        return { success: true };
      }),

    // Get a random card to vote on
    getRandomForVoting: protectedProcedure
      .query(async ({ ctx }) => {
        const card = await db.getRandomAvailableCard(ctx.user.id);
        if (!card) return null;
        const photos = await db.getPhotosByCardId(card.id);
        return { ...card, photos };
      }),

    // Get multiple random cards for preloading (exclude recently shown to avoid repeat)
    // Public: unauthenticated users can browse cards (but cannot vote/comment/favorite)
    getRandomForVotingBatch: publicProcedure
      .input(z.object({
        count: z.number().min(1).max(10),
        excludeCardIds: z.array(z.number()).optional(),
      }))
      .query(async ({ input, ctx }) => {
        const exclude = input.excludeCardIds ?? [];
        // Pass userId only when authenticated; unauthenticated users see all cards
        const cards = await db.getRandomAvailableCards(input.count, exclude, ctx.user?.id);
        const cardsWithPhotos = await Promise.all(
          cards.map(async (card) => {
            const photos = await db.getPhotosByCardId(card.id);
            return { ...card, photos };
          })
        );
        // Filter out cards that have no photos (orphan cards from failed uploads)
        return cardsWithPhotos.filter((c) => c.photos.length > 0);
      }),
  }),

  // Vote operations
  votes: router({
    // Submit a vote (requires login)
    submit: protectedProcedure
      .input(z.object({
        cardId: z.number(),
        photoId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const hasVoted = await db.hasVotedOnCard(ctx.user.id, input.cardId);
        if (hasVoted) {
          throw new Error("Already voted on this card");
        }

        const today = new Date().toISOString().split('T')[0];
        await db.createVote({
          userId: ctx.user.id,
          cardId: input.cardId,
          photoId: input.photoId,
          voteDate: today,
        });

        await db.incrementPhotoVoteCount(input.photoId);

        const card = await db.getCardById(input.cardId);
        if (card) {
          const newTotalVotes = card.totalVotes + 1;
          const isCompleted = newTotalVotes >= 10;
          await db.updateCardVotes(input.cardId, newTotalVotes, isCompleted);
        }

        const photos = await db.getPhotosByCardId(input.cardId);
        const votedPhoto = photos.find(p => p.id === input.photoId);
        const totalVotes = photos.reduce((sum, p) => sum + p.voteCount, 0);
        const percentage = totalVotes > 0 && votedPhoto 
          ? Math.round((votedPhoto.voteCount / totalVotes) * 100) 
          : 0;

        return {
          success: true,
          percentage,
          voteCount: votedPhoto?.voteCount ?? 0,
          totalVotes,
          voteDate: today,
        };
      }),

    // Check if current user has voted on a card
    hasVoted: protectedProcedure
      .input(z.object({ cardId: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.hasVotedOnCard(ctx.user.id, input.cardId);
      }),

    // Get current user's vote result on a card
    myVoteResult: protectedProcedure
      .input(z.object({ cardId: z.number() }))
      .query(async ({ input, ctx }) => {
        const vote = await db.getVoteByUserAndCard(ctx.user.id, input.cardId);
        if (!vote) return null;

        const photos = await db.getPhotosByCardId(input.cardId);
        const totalVotes = photos.reduce((sum, p) => sum + p.voteCount, 0);
        const votedPhoto = photos.find((p) => p.id === vote.photoId);
        const voteCount = votedPhoto?.voteCount ?? 0;
        const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
        const photoStats = photos.map((photo) => ({
          id: photo.id,
          voteCount: photo.voteCount,
          percentage: totalVotes > 0 ? Math.round((photo.voteCount / totalVotes) * 100) : 0,
        }));

        return {
          photoId: vote.photoId,
          voteCount,
          percentage,
          totalVotes,
          photoStats,
          voteDate: vote.voteDate,
          createdAt: vote.createdAt,
        };
      }),
  }),

  // Comment operations
  comments: router({
    // 当前用户可查看评论：已投票或已收藏
    getByCardId: protectedProcedure
      .input(z.object({ cardId: z.number() }))
      .query(async ({ input, ctx }) => {
        const hasVoted = await db.hasVotedOnCard(ctx.user.id, input.cardId);
        const hasFavorited = await db.isFavoritedByUserId(ctx.user.id, input.cardId);
        if (!hasVoted && !hasFavorited) {
          return { comments: [], canView: false };
        }

        const comments = await db.getTopLevelCommentsByCardId(input.cardId);
        const commentsWithVotes = await Promise.all(
          comments.map(async (comment) => {
            const vote = comment.userId != null
              ? await db.getVoteByUserAndCard(comment.userId, input.cardId)
              : null;
            return { ...comment, votedPhotoId: vote?.photoId ?? null };
          })
        );
        return { comments: commentsWithVotes, canView: true };
      }),

    // 获取某条评论下的回复
    getReplies: protectedProcedure
      .input(z.object({
        parentId: z.number(),
        cardId: z.number(),
      }))
      .query(async ({ input, ctx }) => {
        const hasVoted = await db.hasVotedOnCard(ctx.user.id, input.cardId);
        const hasFavorited = await db.isFavoritedByUserId(ctx.user.id, input.cardId);
        if (!hasVoted && !hasFavorited) {
          return { replies: [], parentUserName: null };
        }
        const parent = await db.getCommentById(input.parentId);
        if (!parent || parent.cardId !== input.cardId) {
          return { replies: [], parentUserName: null };
        }
        const replies = await db.getRepliesByParentId(input.parentId);
        const repliesWithVotes = await Promise.all(
          replies.map(async (comment) => {
            const vote = comment.userId != null
              ? await db.getVoteByUserAndCard(comment.userId, input.cardId)
              : null;
            return { ...comment, votedPhotoId: vote?.photoId ?? null };
          })
        );
        // Build parentUserName from parent's userId
        let parentUserName = "用户";
        if (parent.userId != null) {
          const parentUser = await db.getUserById(parent.userId);
          if (parentUser?.name?.trim()) parentUserName = parentUser.name.trim();
          else if (parentUser?.phone) {
            const p = parentUser.phone;
            parentUserName = p.length >= 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p;
          }
        }
        return { replies: repliesWithVotes, parentUserName };
      }),

    // 发表评论：已投票或已收藏方可发表
    create: protectedProcedure
      .input(z.object({
        cardId: z.number(),
        content: z.string().min(1).max(500),
        parentId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const hasVoted = await db.hasVotedOnCard(ctx.user.id, input.cardId);
        const hasFavorited = await db.isFavoritedByUserId(ctx.user.id, input.cardId);
        if (!hasVoted && !hasFavorited) {
          throw new Error("参与投票后可发表评论");
        }
        if (input.parentId != null) {
          const parent = await db.getCommentById(input.parentId);
          if (!parent || parent.cardId !== input.cardId) {
            throw new Error("Invalid reply target");
          }
        }
        const commentId = await db.createComment({
          cardId: input.cardId,
          userId: ctx.user.id,
          content: input.content,
          parentId: input.parentId ?? undefined,
        });
        return { commentId };
      }),

    // Get comments count
    getCount: publicProcedure
      .input(z.object({ cardId: z.number() }))
      .query(async ({ input }) => {
        const count = await db.getCommentsCount(input.cardId);
        return { count };
      }),
  }),

  // Feedback operations
  feedbacks: router({
    submit: protectedProcedure
      .input(z.object({
        type: z.enum(["bug", "suggestion", "other"]),
        content: z.string().min(1).max(2000),
        contactInfo: z.string().max(255).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.createFeedback({
          userId: ctx.user.id,
          type: input.type,
          content: input.content,
          contactInfo: input.contactInfo,
        });
        return { success: true };
      }),
  }),

  // Favorite operations
  favorites: router({
    // Toggle favorite (requires login + must have voted)
    toggle: protectedProcedure
      .input(z.object({ cardId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const hasVoted = await db.hasVotedOnCard(ctx.user.id, input.cardId);
        if (!hasVoted) {
          throw new Error("Must vote on this card before favoriting");
        }
        const isFav = await db.isFavoritedByUserId(ctx.user.id, input.cardId);
        if (isFav) {
          await db.deleteFavoriteByUserId(ctx.user.id, input.cardId);
          return { isFavorited: false };
        }
        await db.createFavorite({ cardId: input.cardId, userId: ctx.user.id });
        return { isFavorited: true };
      }),

    // Check if card is favorited by current user
    check: protectedProcedure
      .input(z.object({ cardId: z.number() }))
      .query(async ({ input, ctx }) => {
        const isFavorited = await db.isFavoritedByUserId(ctx.user.id, input.cardId);
        return { isFavorited };
      }),

    // Get current user's favorites
    getMyFavorites: protectedProcedure
      .query(async ({ ctx }) => {
        const favoritesList = await db.getFavoritesByUserId(ctx.user.id);
        const favoritesWithDetails = await Promise.all(
          favoritesList.map(async (fav) => {
            const card = await db.getCardById(fav.cardId);
            if (!card) return null;
            const photos = await db.getPhotosByCardId(fav.cardId);
            return { ...card, photos, favoritedAt: fav.createdAt };
          })
        );
        return favoritesWithDetails.filter(Boolean);
      }),
  }),
});

export type AppRouter = typeof appRouter;

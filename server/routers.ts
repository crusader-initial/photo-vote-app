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
    create: publicProcedure
      .input(z.object({
        deviceId: z.string().min(1),
        predictedPhotoIndex: z.number().min(0).max(3),
        photos: z.array(z.object({
          base64: z.string(),
          mimeType: z.string(),
        })).min(2).max(4),
      }))
      .mutation(async ({ input }) => {
        // Create the card first
        const cardId = await db.createCard({
          deviceId: input.deviceId,
          predictedPhotoIndex: input.predictedPhotoIndex,
        });

        // Upload photos to OSS and create photo records
        const photoRecords = await Promise.all(
          input.photos.map(async (photo, index) => {
            const randomSuffix = Math.random().toString(36).substring(2, 10);
            const extension = photo.mimeType.split("/")[1] || "jpg";
            const fileKey = `cards/${cardId}/photo-${index}-${randomSuffix}.${extension}`;
            const buffer = Buffer.from(photo.base64, "base64");
            const { url } = await storagePut(fileKey, buffer, photo.mimeType);

            return {
              cardId,
              url,
              photoIndex: index,
            };
          }),
        );

        await db.createPhotos(photoRecords);

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

    // Get cards created by a device
    getMyCards: publicProcedure
      .input(z.object({ deviceId: z.string() }))
      .query(async ({ input }) => {
        const cards = await db.getCardsByDeviceId(input.deviceId);
        const cardsWithPhotos = await Promise.all(
          cards.map(async (card) => {
            const photos = await db.getPhotosByCardId(card.id);
            return { ...card, photos };
          })
        );
        return cardsWithPhotos;
      }),

    // Delete own card (and related votes, comments, favorites, photos)
    delete: publicProcedure
      .input(z.object({
        cardId: z.number(),
        deviceId: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const deleted = await db.deleteCard(input.cardId, input.deviceId);
        if (!deleted) {
          throw new Error("无法删除该卡片（仅可删除自己的上传）");
        }
        return { success: true };
      }),

    // Get a random card to vote on
    getRandomForVoting: publicProcedure
      .input(z.object({ deviceId: z.string() }))
      .query(async ({ input }) => {
        const card = await db.getRandomAvailableCard(input.deviceId);
        if (!card) return null;

        const photos = await db.getPhotosByCardId(card.id);
        return { ...card, photos };
      }),

    // Get multiple random cards for preloading (exclude recently shown to avoid repeat)
    getRandomForVotingBatch: publicProcedure
      .input(z.object({
        deviceId: z.string(),
        count: z.number().min(1).max(10),
        excludeCardIds: z.array(z.number()).optional(),
      }))
      .query(async ({ input }) => {
        const exclude = input.excludeCardIds ?? [];
        const cards = await db.getRandomAvailableCards(input.deviceId, input.count, exclude);
        const cardsWithPhotos = await Promise.all(
          cards.map(async (card) => {
            const photos = await db.getPhotosByCardId(card.id);
            return { ...card, photos };
          })
        );
        return cardsWithPhotos;
      }),
  }),

  // Vote operations
  votes: router({
    // Submit a vote (requires login)
    submit: protectedProcedure
      .input(z.object({
        deviceId: z.string().min(1),
        cardId: z.number(),
        photoId: z.number(),
      }))
      .mutation(async ({ input }) => {
        // Check if already voted on this card
        const hasVoted = await db.hasVotedOnCard(input.deviceId, input.cardId);
        if (hasVoted) {
          throw new Error("Already voted on this card");
        }

        const today = new Date().toISOString().split('T')[0];
        // Create the vote
        await db.createVote({
          deviceId: input.deviceId,
          cardId: input.cardId,
          photoId: input.photoId,
          voteDate: today,
        });

        // Update photo vote count
        await db.incrementPhotoVoteCount(input.photoId);

        // Update card total votes
        const card = await db.getCardById(input.cardId);
        if (card) {
          const newTotalVotes = card.totalVotes + 1;
          const isCompleted = newTotalVotes >= 10;
          await db.updateCardVotes(input.cardId, newTotalVotes, isCompleted);
        }

        // Get updated photo stats
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
        };
      }),

    // Check if device has voted on a card
    hasVoted: publicProcedure
      .input(z.object({
        deviceId: z.string(),
        cardId: z.number(),
      }))
      .query(async ({ input }) => {
        return db.hasVotedOnCard(input.deviceId, input.cardId);
      }),
  }),

  // Comment operations（按「当前用户」是否投过票/已收藏判断，非按当前设备）
  comments: router({
    // 当前用户可查看评论：本设备投过 / 本设备收藏 / 已登录且该用户收藏（收藏即表示用户曾投过票）
    getByCardId: publicProcedure
      .input(z.object({
        cardId: z.number(),
        deviceId: z.string(),
      }))
      .query(async ({ input, ctx }) => {
        const hasVotedOnDevice = await db.hasVotedOnCard(input.deviceId, input.cardId);
        const hasFavoritedOnDevice = await db.isFavorited(input.deviceId, input.cardId);
        const hasFavoritedByUser =
          ctx.user?.id != null && (await db.isFavoritedByUserId(ctx.user.id, input.cardId));
        const canView = hasVotedOnDevice || hasFavoritedOnDevice || hasFavoritedByUser;
        if (!canView) {
          return { comments: [], canView: false };
        }

        const comments = await db.getTopLevelCommentsByCardId(input.cardId);
        
        // Get vote info for each commenter
        const commentsWithVotes = await Promise.all(
          comments.map(async (comment) => {
            const vote = await db.getVoteByDeviceAndCard(comment.deviceId, input.cardId);
            return {
              ...comment,
              votedPhotoId: vote?.photoId ?? null,
            };
          })
        );
        
        return { comments: commentsWithVotes, canView: true };
      }),

    // 获取某条评论下的回复（与 getByCardId 一致：按当前用户是否可查看）
    getReplies: publicProcedure
      .input(z.object({
        parentId: z.number(),
        cardId: z.number(),
        deviceId: z.string(),
      }))
      .query(async ({ input, ctx }) => {
        const hasVotedOnDevice = await db.hasVotedOnCard(input.deviceId, input.cardId);
        const hasFavoritedOnDevice = await db.isFavorited(input.deviceId, input.cardId);
        const hasFavoritedByUser =
          ctx.user?.id != null && (await db.isFavoritedByUserId(ctx.user.id, input.cardId));
        if (!hasVotedOnDevice && !hasFavoritedOnDevice && !hasFavoritedByUser) {
          return { replies: [], parentDeviceId: null };
        }
        const parent = await db.getCommentById(input.parentId);
        if (!parent || parent.cardId !== input.cardId) {
          return { replies: [], parentDeviceId: null };
        }
        const replies = await db.getRepliesByParentId(input.parentId);
        const repliesWithVotes = await Promise.all(
          replies.map(async (comment) => {
            const vote = await db.getVoteByDeviceAndCard(comment.deviceId, input.cardId);
            return { ...comment, votedPhotoId: vote?.photoId ?? null };
          })
        );
        return {
          replies: repliesWithVotes,
          parentDeviceId: parent.deviceId,
        };
      }),

    // 发表评论：当前用户参与过投票方可发表（本设备投过 或 已登录且该用户已收藏）
    create: protectedProcedure
      .input(z.object({
        cardId: z.number(),
        deviceId: z.string(),
        content: z.string().min(1).max(500),
        parentId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const hasVotedOnDevice = await db.hasVotedOnCard(input.deviceId, input.cardId);
        const hasFavoritedByUser = await db.isFavoritedByUserId(ctx.user.id, input.cardId);
        const currentUserHasVoted = hasVotedOnDevice || hasFavoritedByUser;
        if (!currentUserHasVoted) {
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
          deviceId: input.deviceId,
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

  // Favorite operations
  favorites: router({
    // Toggle favorite (requires login)
    toggle: protectedProcedure
      .input(z.object({
        cardId: z.number(),
        deviceId: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const hasVoted = await db.hasVotedOnCard(input.deviceId, input.cardId);
        if (!hasVoted) {
          throw new Error("Must vote on this card before favoriting");
        }

        const isFav = await db.isFavoritedByUserId(ctx.user.id, input.cardId);
        if (isFav) {
          await db.deleteFavoriteByUserId(ctx.user.id, input.cardId);
          return { isFavorited: false };
        }
        await db.createFavorite({
          cardId: input.cardId,
          deviceId: input.deviceId,
          userId: ctx.user.id,
        });
        return { isFavorited: true };
      }),

    // Check if card is favorited (by userId when logged in, else deviceId)
    check: publicProcedure
      .input(z.object({
        cardId: z.number(),
        deviceId: z.string(),
      }))
      .query(async ({ input, ctx }) => {
        if (ctx.user?.id) {
          const isFavorited = await db.isFavoritedByUserId(ctx.user.id, input.cardId);
          return { isFavorited };
        }
        const isFavorited = await db.isFavorited(input.deviceId, input.cardId);
        return { isFavorited };
      }),

    // Get user's favorites (by userId when logged in, else deviceId)
    getMyFavorites: publicProcedure
      .input(z.object({ deviceId: z.string() }))
      .query(async ({ input, ctx }) => {
        const favoritesList = ctx.user?.id
          ? await db.getFavoritesByUserId(ctx.user.id)
          : await db.getFavoritesByDeviceId(input.deviceId);

        const favoritesWithDetails = await Promise.all(
          favoritesList.map(async (fav) => {
            const card = await db.getCardById(fav.cardId);
            if (!card) return null;
            const photos = await db.getPhotosByCardId(fav.cardId);
            return {
              ...card,
              photos,
              favoritedAt: fav.createdAt,
            };
          })
        );
        return favoritesWithDetails.filter(Boolean);
      }),
  }),
});

export type AppRouter = typeof appRouter;

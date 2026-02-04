import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { storagePut } from "./storage";
import * as fs from "fs";
import * as path from "path";

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

        // Upload photos and create photo records
        const photoRecords = await Promise.all(
          input.photos.map(async (photo, index) => {
            // Check if we should use cloud storage or local storage
            const useCloudStorage = process.env.BUILT_IN_FORGE_API_KEY && 
                                   process.env.BUILT_IN_FORGE_API_KEY !== 'your-api-key';
            
            let url: string;
            
            if (useCloudStorage) {
              // Upload to S3/OSS
              const randomSuffix = Math.random().toString(36).substring(2, 10);
              const extension = photo.mimeType.split('/')[1] || 'jpg';
              const fileKey = `cards/${cardId}/photo-${index}-${randomSuffix}.${extension}`;
              const buffer = Buffer.from(photo.base64, 'base64');
              const result = await storagePut(fileKey, buffer, photo.mimeType);
              url = result.url;
            } else {
              // Save to local file system
              const randomSuffix = Math.random().toString(36).substring(2, 10);
              const extension = photo.mimeType.split('/')[1] || 'jpg';
              const filename = `card-${cardId}-photo-${index}-${randomSuffix}.${extension}`;
              const uploadDir = path.join(process.cwd(), 'uploads');
              const filepath = path.join(uploadDir, filename);
              
              // Ensure upload directory exists
              if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
              }
              
              // Write file
              const buffer = Buffer.from(photo.base64, 'base64');
              fs.writeFileSync(filepath, buffer);
              
              // Return full URL for local development
              // In production with reverse proxy, this should be the public URL
              const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000';
              url = `${baseUrl}/uploads/${filename}`;
            }
            
            return {
              cardId,
              url,
              photoIndex: index,
            };
          })
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
    // Submit a vote
    submit: publicProcedure
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

        // Check daily vote limit
        const today = new Date().toISOString().split('T')[0];
        const dailyCount = await db.getDailyVoteCount(input.deviceId, today);
        if (dailyCount >= 20) {
          throw new Error("Daily vote limit reached");
        }

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

    // Get daily vote count for a device
    getDailyCount: publicProcedure
      .input(z.object({ deviceId: z.string() }))
      .query(async ({ input }) => {
        const today = new Date().toISOString().split('T')[0];
        const count = await db.getDailyVoteCount(input.deviceId, today);
        return { count, limit: 20, remaining: Math.max(0, 20 - count) };
      }),
  }),

  // Comment operations
  comments: router({
    // Get comments for a card (only if user has voted)
    getByCardId: publicProcedure
      .input(z.object({
        cardId: z.number(),
        deviceId: z.string(),
      }))
      .query(async ({ input }) => {
        // Check if user has voted on this card
        const hasVoted = await db.hasVotedOnCard(input.deviceId, input.cardId);
        if (!hasVoted) {
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

    // 获取某条评论下的回复（楼中楼）
    getReplies: publicProcedure
      .input(z.object({
        parentId: z.number(),
        cardId: z.number(),
        deviceId: z.string(),
      }))
      .query(async ({ input }) => {
        const hasVoted = await db.hasVotedOnCard(input.deviceId, input.cardId);
        if (!hasVoted) {
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

    // Create a comment (only if user has voted).parentId 为回复目标，无则为主评论
    create: publicProcedure
      .input(z.object({
        cardId: z.number(),
        deviceId: z.string(),
        content: z.string().min(1).max(500),
        parentId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const hasVoted = await db.hasVotedOnCard(input.deviceId, input.cardId);
        if (!hasVoted) {
          throw new Error("Must vote on this card before commenting");
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
    // Toggle favorite (add or remove)
    toggle: publicProcedure
      .input(z.object({
        cardId: z.number(),
        deviceId: z.string(),
      }))
      .mutation(async ({ input }) => {
        // Check if user has voted on this card
        const hasVoted = await db.hasVotedOnCard(input.deviceId, input.cardId);
        if (!hasVoted) {
          throw new Error("Must vote on this card before favoriting");
        }

        // Check if already favorited
        const isFavorited = await db.isFavorited(input.deviceId, input.cardId);
        
        if (isFavorited) {
          // Remove favorite
          await db.deleteFavorite(input.deviceId, input.cardId);
          return { isFavorited: false };
        } else {
          // Add favorite
          await db.createFavorite({
            cardId: input.cardId,
            deviceId: input.deviceId,
          });
          return { isFavorited: true };
        }
      }),

    // Check if card is favorited
    check: publicProcedure
      .input(z.object({
        cardId: z.number(),
        deviceId: z.string(),
      }))
      .query(async ({ input }) => {
        const isFavorited = await db.isFavorited(input.deviceId, input.cardId);
        return { isFavorited };
      }),

    // Get user's favorites
    getMyFavorites: publicProcedure
      .input(z.object({ deviceId: z.string() }))
      .query(async ({ input }) => {
        const favoritesList = await db.getFavoritesByDeviceId(input.deviceId);
        
        // Get card details for each favorite
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
        
        // Filter out any null results
        return favoritesWithDetails.filter(Boolean);
      }),
  }),
});

export type AppRouter = typeof appRouter;

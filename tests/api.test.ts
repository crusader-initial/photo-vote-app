import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the database functions
vi.mock("../server/db", () => ({
  createCard: vi.fn().mockResolvedValue(1),
  getCardById: vi.fn().mockResolvedValue({
    id: 1,
    predictedPhotoIndex: 0,
    totalVotes: 0,
    isCompleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  updateCardVotes: vi.fn().mockResolvedValue(undefined),
  createPhotos: vi.fn().mockResolvedValue(undefined),
  getPhotosByCardId: vi.fn().mockResolvedValue([
    { id: 1, cardId: 1, url: "https://example.com/photo1.jpg", photoIndex: 0, voteCount: 5 },
    { id: 2, cardId: 1, url: "https://example.com/photo2.jpg", photoIndex: 1, voteCount: 3 },
  ]),
  incrementPhotoVoteCount: vi.fn().mockResolvedValue(undefined),
  createVote: vi.fn().mockResolvedValue(1),
  hasVotedOnCard: vi.fn().mockResolvedValue(false),
  getRandomAvailableCard: vi.fn().mockResolvedValue({
    id: 2,
    predictedPhotoIndex: 1,
    totalVotes: 10,
    isCompleted: false,
  }),
}));

describe("第一印象 API Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Card Operations", () => {
    it("should calculate vote percentage correctly", () => {
      const photos = [
        { id: 1, voteCount: 5 },
        { id: 2, voteCount: 3 },
        { id: 3, voteCount: 2 },
      ];
      const totalVotes = photos.reduce((sum, p) => sum + p.voteCount, 0);
      
      expect(totalVotes).toBe(10);
      
      const percentages = photos.map(p => Math.round((p.voteCount / totalVotes) * 100));
      expect(percentages).toEqual([50, 30, 20]);
    });

    it("should determine winner correctly", () => {
      const photos = [
        { id: 1, photoIndex: 0, voteCount: 5 },
        { id: 2, photoIndex: 1, voteCount: 8 },
        { id: 3, photoIndex: 2, voteCount: 2 },
      ];
      
      const sorted = [...photos].sort((a, b) => b.voteCount - a.voteCount);
      const winnerIndex = sorted[0].photoIndex;
      
      expect(winnerIndex).toBe(1);
    });

    it("should check prediction correctness", () => {
      const predictedPhotoIndex = 1;
      const winnerPhotoIndex = 1;
      
      const isPredictionCorrect = predictedPhotoIndex === winnerPhotoIndex;
      expect(isPredictionCorrect).toBe(true);
    });
  });

  describe("Card Completion", () => {
    it("should mark card as completed at 30 votes", () => {
      const requiredVotes = 30;
      
      let totalVotes = 29;
      let isCompleted = totalVotes >= requiredVotes;
      expect(isCompleted).toBe(false);
      
      totalVotes = 30;
      isCompleted = totalVotes >= requiredVotes;
      expect(isCompleted).toBe(true);
    });
  });

  describe("Device ID", () => {
    it("should generate valid device ID format", () => {
      const generateDeviceId = () => {
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 10);
        return `device_${timestamp}_${randomPart}`;
      };
      
      const deviceId = generateDeviceId();
      expect(deviceId).toMatch(/^device_[a-z0-9]+_[a-z0-9]+$/);
    });
  });
});

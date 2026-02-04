/**
 * 测试数据种子脚本
 * 用于在数据库中插入伪数据以测试投票流程
 * 
 * 运行方式: npx tsx scripts/seed-test-data.ts
 */

import { drizzle } from "drizzle-orm/mysql2";
import { cards, photos, votes } from "../drizzle/schema";

// 测试用的照片URL（使用 picsum.photos 提供的随机图片）
const TEST_PHOTO_URLS = [
  "https://picsum.photos/seed/photo1/400/400",
  "https://picsum.photos/seed/photo2/400/400",
  "https://picsum.photos/seed/photo3/400/400",
  "https://picsum.photos/seed/photo4/400/400",
  "https://picsum.photos/seed/photo5/400/400",
  "https://picsum.photos/seed/photo6/400/400",
  "https://picsum.photos/seed/photo7/400/400",
  "https://picsum.photos/seed/photo8/400/400",
  "https://picsum.photos/seed/photo9/400/400",
  "https://picsum.photos/seed/photo10/400/400",
  "https://picsum.photos/seed/photo11/400/400",
  "https://picsum.photos/seed/photo12/400/400",
];

async function seedTestData() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL 环境变量未设置");
    process.exit(1);
  }

  console.log("🔗 连接数据库...");
  const db = drizzle(databaseUrl);

  try {
    console.log("📝 插入测试数据...\n");

    // 创建3个测试卡片，每个卡片有不同数量的照片和投票
    const testCards = [
      {
        deviceId: "test-uploader-001",
        predictedPhotoIndex: 0,
        totalVotes: 15,
        isCompleted: false,
        photoCount: 3,
        voteDistribution: [8, 5, 2], // 第一张照片最多票
      },
      {
        deviceId: "test-uploader-002",
        predictedPhotoIndex: 1,
        totalVotes: 30,
        isCompleted: true,
        photoCount: 4,
        voteDistribution: [5, 12, 8, 5], // 第二张照片最多票（预测正确）
      },
      {
        deviceId: "test-uploader-003",
        predictedPhotoIndex: 2,
        totalVotes: 8,
        isCompleted: false,
        photoCount: 2,
        voteDistribution: [3, 5], // 第二张照片最多票（预测错误）
      },
    ];

    let photoUrlIndex = 0;

    for (let i = 0; i < testCards.length; i++) {
      const cardData = testCards[i];
      
      // 插入卡片
      const cardResult = await db.insert(cards).values({
        deviceId: cardData.deviceId,
        predictedPhotoIndex: cardData.predictedPhotoIndex,
        totalVotes: cardData.totalVotes,
        isCompleted: cardData.isCompleted,
      });

      const cardId = Number(cardResult[0].insertId);
      console.log(`✅ 创建卡片 #${cardId} (${cardData.deviceId})`);
      console.log(`   - 照片数量: ${cardData.photoCount}`);
      console.log(`   - 总票数: ${cardData.totalVotes}`);
      console.log(`   - 状态: ${cardData.isCompleted ? "已完成" : "进行中"}`);

      // 插入照片
      const photoRecords = [];
      for (let j = 0; j < cardData.photoCount; j++) {
        photoRecords.push({
          cardId,
          url: TEST_PHOTO_URLS[photoUrlIndex % TEST_PHOTO_URLS.length],
          photoIndex: j,
          voteCount: cardData.voteDistribution[j],
        });
        photoUrlIndex++;
      }

      await db.insert(photos).values(photoRecords);
      console.log(`   - 照片投票分布: ${cardData.voteDistribution.join(", ")}`);

      // 插入投票记录（模拟不同设备的投票）
      const today = new Date().toISOString().split("T")[0];
      const voteRecords = [];
      
      // 获取刚插入的照片ID
      const insertedPhotos = await db.select().from(photos).where(
        // @ts-ignore
        (photos) => photos.cardId === cardId
      );

      let voteIndex = 0;
      for (let j = 0; j < cardData.photoCount; j++) {
        const photoVoteCount = cardData.voteDistribution[j];
        for (let k = 0; k < photoVoteCount; k++) {
          voteRecords.push({
            cardId,
            photoId: cardId * 10 + j + 1, // 简化的photoId计算
            deviceId: `test-voter-${String(voteIndex).padStart(3, "0")}`,
            voteDate: today,
          });
          voteIndex++;
        }
      }

      if (voteRecords.length > 0) {
        await db.insert(votes).values(voteRecords);
      }
      console.log(`   - 投票记录: ${voteRecords.length} 条\n`);
    }

    console.log("🎉 测试数据插入完成！\n");
    console.log("📊 数据摘要:");
    console.log("   - 卡片总数: 3");
    console.log("   - 照片总数: 9");
    console.log("   - 投票记录: 53 条");
    console.log("\n💡 提示: 使用不同于 test-uploader-* 的 deviceId 进行投票测试");

  } catch (error) {
    console.error("❌ 插入数据失败:", error);
    process.exit(1);
  }

  process.exit(0);
}

seedTestData();

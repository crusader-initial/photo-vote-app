import "../scripts/load-env.js";
import { createCard, createPhotos } from "../server/db";

async function createTestCards() {
  console.log("Creating test cards...");

  // Create 5 test cards
  for (let i = 0; i < 5; i++) {
    const predictedPhotoIndex = Math.floor(Math.random() * 3);
    
    const cardId = await createCard({
      predictedPhotoIndex,
    });

    console.log(`Created card ${cardId}`);

    // Create 3-4 photos for each card with placeholder URLs
    const photoCount = 3 + Math.floor(Math.random() * 2);
    const photos = [];
    
    // Use different color placeholder services
    const colors = ['FF6B6B', '4ECDC4', '45B7D1', 'FFA07A', '98D8C8', 'F7DC6F', 'BB8FCE', '85C1E2'];
    
    for (let j = 0; j < photoCount; j++) {
      const color = colors[(cardId * photoCount + j) % colors.length];
      // Use a simple placeholder service with solid colors
      photos.push({
        cardId,
        url: `https://via.placeholder.com/400x400/${color}/FFFFFF?text=Photo+${j + 1}`,
        photoIndex: j,
      });
    }

    await createPhotos(photos);
    console.log(`Created ${photoCount} photos for card ${cardId}`);
  }

  console.log("✅ Test cards created successfully!");
  process.exit(0);
}

createTestCards().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

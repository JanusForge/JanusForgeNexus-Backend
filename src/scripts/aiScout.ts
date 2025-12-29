import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function patrolTheForge() {
  console.log("🌅 AI Scout starting CONTINUOUS patrol in Hardy, KY...");

  // This loop keeps the process alive so Render doesn't shut it down
  while (true) {
    try {
      // 1. Check for the latest Forge record
      const currentForge = await prisma.dailyForge.findFirst({
        orderBy: { date: 'desc' },
      });

      if (!currentForge) {
        console.log("Empty Forge. Initializing...");
        await initializeDailyForge();
      } 
      // 2. Watch for your interjection
      else if (currentForge.phase === 'Architect_Interjection') {
        console.log("📢 Architect detected! Lifting the pause...");
        await processArchitectCommand(currentForge.id);
      }

    } catch (error) {
      console.error("❌ Patrol Error:", error);
    }

    // 3. Wait 10 seconds before checking again
    // This keeps the process running forever
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

async function initializeDailyForge() {
  // ... (Your existing initialization logic)
}

async function processArchitectCommand(forgeId: string) {
  await prisma.dailyForge.update({
    where: { id: forgeId },
    data: { phase: 'COUNCIL_DEBATE' }
  });
  console.log("✅ Council phase reset. Flow restored.");
}

// Start the continuous loop
patrolTheForge();

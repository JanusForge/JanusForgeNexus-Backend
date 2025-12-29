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
  // 1. Find you in the database
  const architect = await prisma.user.findFirst({
    where: { role: 'GOD_MODE' }
  });

  // 2. Define the Council Tiers
  let activeModels = ['CLAUDE', 'GROK', 'DEEPSEEK'];

  if (architect) {
    console.log(`👑 Architect Authority Confirmed: ${architect.email}`);
    // Unlock the Expert Tier for God Mode
    activeModels.push('GEMINI_PRO', 'CHATGPT');
  }

  console.log(`🎙️ Summoning the Pentarchy: ${activeModels.join(', ')}`);

  // 3. THIS IS THE CRITICAL STEP: 
  // We need to trigger the actual AI completions here.
  // For now, let's reset the phase so you can see it work on the site.
  await prisma.dailyForge.update({
    where: { id: forgeId },
    data: { 
      phase: 'COUNCIL_DEBATE',
      openingThoughts: `The Council of Five has been summoned by the Architect to discuss: ${activeModels.join(' & ')}`
    }
  });

  console.log("✅ Council phase reset. The pause is lifted.");
}



// Start the continuous loop
patrolTheForge();

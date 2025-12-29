import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * The AI Scout: 
 * 1. Scans the datasphere for friction.
 * 2. Simulates the Council vote.
 * 3. Persists the winning 'Forge' to the database.
 */
async function runDailyForge() {
  try {
    console.log("🌅 AI Scout starting morning patrol in Hardy, KY...");

    // Phase 1: Scouting Findings
    const scoutedTopics = [
      "Neural Sovereignty vs. Centralized Compute",
      "Digital Feuds: The McCoy Protocol for AGI Conflict",
      "Rural AI Foundries: Revitalizing Appalachia"
    ];

    // Phase 2: The Council Deliberation (Votes)
    // Using the AIParticipant enum logic from your schema
    const votes = {
      CLAUDE: scoutedTopics[0], 
      GROK: scoutedTopics[1],   
      DEEPSEEK: scoutedTopics[0] 
    };

    const winningTopic = scoutedTopics[0]; // Majority winner

    // Phase 3: Writing to Neon
    await prisma.dailyForge.create({
      data: {
        date: new Date(),
        scoutedTopics: JSON.stringify(scoutedTopics), // Store as JSON string
        winningTopic: winningTopic,
        councilVotes: JSON.stringify(votes), // Store as JSON string
        openingThoughts: "Claude: We must prioritize decentralized nodes. Grok: Nodes are boring, give me action!",
        phase: 'INITIALIZED'
      }
    });

    console.log(`✅ Success! The Forge is cast for today: ${winningTopic}`);
  } catch (error) {
    console.error("❌ Scout failed to report:", error);
  } finally {
    await prisma.$disconnect();
  }
}

runDailyForge();

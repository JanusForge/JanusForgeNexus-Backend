import { PrismaClient } from '@prisma/client';
import { generateCouncilResponse } from '../services/aiService';

const prisma = new PrismaClient();

async function processLiveDialogue() {
  console.log("⚖️ The Arbiter is monitoring the Live Panel (Left Hemisphere)...");

  while (true) {
    try {
      // 1. Look for the most recent USER_MESSAGE from an authorized user 
      // that hasn't received a COUNCIL_VERDICT yet.
      const pendingMessage = await prisma.aIResponse.findFirst({
        where: {
          type: 'USER_MESSAGE',
          content: { not: '' },
          user: {
            OR: [
              { role: 'GOD_MODE' },
              { role: 'SUBSCRIBER' },
              { tokens_remaining: { gt: 0 } }
            ]
          }
        },
        include: { user: true },
        orderBy: { created_at: 'desc' }
      });

      // Check if this specific message already has a response to prevent loops
      if (pendingMessage) {
        const alreadyAnswered = await prisma.aIResponse.findFirst({
          where: {
            userId: pendingMessage.userId,
            type: 'COUNCIL_VERDICT',
            created_at: { gt: pendingMessage.created_at }
          }
        });

        if (!alreadyAnswered) {
          console.log(`🎙️ Arbiter: Interjection from ${pendingMessage.user.email} detected.`);

          // 2. Token Check (Architects bypass this)
          if (pendingMessage.user.role !== 'GOD_MODE' && pendingMessage.user.tokens_remaining <= 0) {
            console.log("🚫 Insufficient tokens. Skipping...");
            continue;
          }

          console.log("🌪️ Summoning the Pentarchy for Live Debate...");
          
          // 3. Call the Pentarchy (Parallel API calls)
          const responses = await generateCouncilResponse(pendingMessage.content);

          // 4. Update the database with the synthesis (The Verdict)
          await prisma.aIResponse.create({
            data: {
              userId: pendingMessage.userId,
              content: JSON.stringify(responses),
              type: 'COUNCIL_VERDICT'
            }
          });

          // 5. Deduct Token if not Architect
          if (pendingMessage.user.role !== 'GOD_MODE') {
            await prisma.user.update({
              where: { id: pendingMessage.userId },
              data: { tokens_remaining: { decrement: 1 } }
            });
            console.log(`🪙 Token deducted for ${pendingMessage.user.email}`);
          }

          console.log("✅ Arbiter: Synthesis complete. Live Panel updated.");
        }
      }
    } catch (error) {
      console.error("Arbiter Error:", error);
    }
    // 5-second polling for a responsive "Live" feel
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

processLiveDialogue();

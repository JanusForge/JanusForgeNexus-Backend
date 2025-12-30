import { PrismaClient } from '@prisma/client';
import { generateCouncilResponse } from '../server'; 

const prisma = new PrismaClient();

async function processLiveDialogue() {
  console.log("⚖️ The Arbiter is monitoring the Ledger & Live Panel...");

  while (true) {
    try {
      // 1. Fetch the latest user data directly from the DB
      const pendingMessage = await prisma.aIResponse.findFirst({
        where: { type: 'USER_MESSAGE' },
        include: { user: true },
        orderBy: { created_at: 'desc' }
      });

      if (pendingMessage && pendingMessage.user) {
        const user = pendingMessage.user;

        // 2. RUN THE EQUATION: token_balance - tokens_used = tokens_remaining
        const tokensRemaining = (user.token_balance || 0) - (user.tokens_used || 0);

        // 3. AUTHORIZATION CHECK
        const isAuthorized = user.role === 'GOD_MODE' || tokensRemaining > 0;

        if (isAuthorized) {
          // Check if we already answered this specific message ID
          const existingVerdict = await prisma.aIResponse.findFirst({
            where: {
              userId: user.id,
              type: 'COUNCIL_VERDICT',
              created_at: { gt: pendingMessage.created_at }
            }
          });

          if (!existingVerdict) {
            console.log(`🎙️ Processing interjection for ${user.username}. Remaining: ${tokensRemaining}`);

            // 4. SUMMON THE PENTARCHY
            const responses = await generateCouncilResponse(pendingMessage.content);

            // 5. ATOMIC UPDATE: Create response AND increment usage
            await prisma.$transaction([
              prisma.aIResponse.create({
                data: {
                  userId: user.id,
                  content: JSON.stringify(responses),
                  type: 'COUNCIL_VERDICT'
                }
              }),
              // Only deduct if not the Architect
              ...(user.role !== 'GOD_MODE' ? [
                prisma.user.update({
                  where: { id: user.id },
                  data: { tokens_used: { increment: 1 } }
                })
              ] : [])
            ]);

            console.log(`✅ Ledger updated for ${user.username}.`);
          }
        } else {
          console.log(`🚫 ${user.username} has insufficient energy (Remaining: ${tokensRemaining})`);
        }
      }
    } catch (error) {
      console.error("Arbiter Ledger Error:", error);
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

processLiveDialogue();

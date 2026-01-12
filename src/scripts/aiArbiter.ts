import prisma from './lib/prisma';
import { generateCouncilResponse } from '../server';


async function processLiveDialogue() {
  console.log("⚖️ The Arbiter is monitoring the Ledger...");

  while (true) {
    try {
      // 1. Corrected: ai_model is null for user messages in your schema
      const pendingMessage = await prisma.aIResponse.findFirst({
        where: { ai_model: null },
        include: { user: true },
        orderBy: { created_at: 'desc' }
      });

      if (pendingMessage && pendingMessage.user) {
        const user = pendingMessage.user;
        const isAuthorized = user.username === 'admin-access' || (user.token_balance && user.token_balance > 0);

        if (isAuthorized) {
          const existingVerdict = await prisma.aIResponse.findFirst({
            where: {
              post_id: pendingMessage.post_id,
              NOT: { ai_model: null }
            }
          });

          if (!existingVerdict) {
            console.log(`🎙️ Council Summoned for: ${user.username}`);
            const responseText = await generateCouncilResponse(pendingMessage.raw_response || "", "CHATGPT");

            // 2. Corrected: Using user_id, post_id, and raw_response per your DB
            await prisma.$transaction([
              prisma.aIResponse.create({
                data: {
                  user_id: user.id,
                  post_id: pendingMessage.post_id,
                  raw_response: responseText,
                  ai_model: "CHATGPT",
                  processing_time: 0
                }
              }),
              ...(user.username !== 'admin-access' ? [
                prisma.user.update({
                  where: { id: user.id },
                  data: { token_balance: { decrement: 1 } }
                })
              ] : [])
            ]);
            console.log(`✅ Ledger updated for ${user.username}.`);
          }
        }
      }
    } catch (error) {
      console.error("Arbiter Ledger Error:", error);
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

processLiveDialogue();


// Keep it clean - CLW

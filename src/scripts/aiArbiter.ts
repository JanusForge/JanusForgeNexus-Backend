import { PrismaClient } from '@prisma/client';
import { generateCouncilResponse } from '../server';

const prisma = new PrismaClient();

async function processLiveDialogue() {
  console.log("⚖️ The Arbiter is monitoring the Ledger & Live Panel...");

  while (true) {
    try {
      // 1. Fetch the latest user message (where ai_model is null)
      const pendingMessage = await prisma.aIResponse.findFirst({
        where: { ai_model: null },
        include: { user: true },
        orderBy: { created_at: 'desc' }
      });

      if (pendingMessage && pendingMessage.user) {
        const user = pendingMessage.user;
        const isAuthorized = user.username === 'admin-access' || (user.token_balance && user.token_balance > 0);

        if (isAuthorized) {
          // 2. Check if a response already exists for this specific post_id
          const existingVerdict = await prisma.aIResponse.findFirst({
            where: {
              post_id: pendingMessage.post_id,
              NOT: { ai_model: null }
            }
          });

          if (!existingVerdict) {
            console.log(`🎙️ Council Summoned for: ${user.username}`);

            // 3. Generate content using the exported engine
            const responseText = await generateCouncilResponse(pendingMessage.raw_response || "", "gpt4");

            // 4. Update the DB using your actual schema fields
            await prisma.$transaction([
              prisma.aIResponse.create({
                data: {
                  user_id: user.id,
                  post_id: pendingMessage.post_id,
                  raw_response: responseText,
                  ai_model: 'GPT4',
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

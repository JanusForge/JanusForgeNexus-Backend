// src/simulateForge.ts
import prisma from './lib/prisma';
import { triggerCouncilDebate } from './lib/councilDebate';
import { aiClients } from './server'; // Exported from your server file

async function testForgeDebate() {
  console.log("🧪 Starting Manual Forge Test...");

  // 1. Find or create a test conversation
  let testConvo = await prisma.conversation.findFirst({
    where: { title: "Test Debate" }
  });

  if (!testConvo) {
    testConvo = await prisma.conversation.create({
      data: {
        title: "Test Debate",
        is_daily_forge: true,
      }
    });
  }

  console.log(`✅ Using Conversation ID: ${testConvo.id}`);

  // 2. Create a "Human" starter post to trigger the AIs
  const starterPost = await prisma.post.create({
    data: {
      content: "Council: Should AI be allowed to own intellectual property?",
      is_human: true,
      conversation_id: testConvo.id,
    }
  });

  console.log("📨 Starter post created. Triggering Council...");

  // 3. Mock the Socket.io 'io' object to log to console instead of network
  const mockIo = {
    to: (id: string) => ({
      emit: (event: string, data: any) => {
        console.log(`📡 [Socket Event: ${event}] to Room ${id}:`, data.name, "responded.");
      }
    })
  } as any;

  // 4. Run the debate
  await triggerCouncilDebate({
    conversationId: testConvo.id,
    io: mockIo,
    currentTokens: 999,
    ...aiClients
  });

  console.log("🏁 Test Complete. Check your terminal logs above!");
}

testForgeDebate().catch(console.error);

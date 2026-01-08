import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixFinalTitleMismatch() {
  try {
    console.log('Fixing final title mismatch...\n');
    
    // Find the DailyForge entry with (v.3)
    const dailyForgeEntry = await prisma.dailyForge.findUnique({
      where: { id: 'df4af48d-fcdc-4b86-9291-d11311477ff4' }
    });
    
    if (!dailyForgeEntry) {
      console.log('❌ DailyForge entry not found');
      return;
    }
    
    console.log(`DailyForge: ${dailyForgeEntry.winningTopic}`);
    console.log(`Conversation ID: ${dailyForgeEntry.conversationId}\n`);
    
    if (!dailyForgeEntry.conversationId) {
      console.log('❌ No conversation linked');
      return;
    }
    
    // Get the conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: dailyForgeEntry.conversationId }
    });
    
    if (!conversation) {
      console.log('❌ Conversation not found');
      return;
    }
    
    console.log(`Current conversation title: ${conversation.title}`);
    console.log(`Should match: ${dailyForgeEntry.winningTopic}\n`);
    
    if (conversation.title === dailyForgeEntry.winningTopic) {
      console.log('✅ Titles already match!');
      return;
    }
    
    // Update the conversation title
    const updatedConversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { title: dailyForgeEntry.winningTopic }
    });
    
    console.log(`✅ Updated conversation title:`);
    console.log(`   From: ${conversation.title}`);
    console.log(`   To:   ${updatedConversation.title}\n`);
    
    // Final verification
    const finalCheck = await prisma.dailyForge.findUnique({
      where: { id: dailyForgeEntry.id },
      include: { conversation: { select: { title: true } } }
    });
    
    console.log('🔍 Final verification:');
    console.log(`DailyForge: ${finalCheck.winningTopic}`);
    console.log(`Conversation: ${finalCheck.conversation.title}`);
    console.log(`Match: ${finalCheck.winningTopic === finalCheck.conversation.title ? '✅' : '❌'}`);
    
    if (finalCheck.winningTopic === finalCheck.conversation.title) {
      console.log('\n🎉 All titles now match perfectly!');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixFinalTitleMismatch();

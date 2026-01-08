import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function updateConversations() {
  try {
    console.log('Updating conversation titles and marking as daily_forge...\n');
    
    // Get all DailyForge entries with their linked conversations
    const dailyForgeEntries = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      include: { 
        conversation: { 
          select: { 
            id: true, 
            title: true,
            is_daily_forge: true
          } 
        } 
      }
    });
    
    console.log('Found DailyForge entries with conversations:\n');
    
    // First, show what we have and what will change
    const updates = [];
    
    dailyForgeEntries.forEach((entry, i) => {
      if (entry.conversation) {
        const needsTitleUpdate = entry.conversation.title !== entry.winningTopic;
        const needsFlagUpdate = !entry.conversation.is_daily_forge;
        
        if (needsTitleUpdate || needsFlagUpdate) {
          updates.push({
            conversationId: entry.conversation.id,
            currentTitle: entry.conversation.title || 'Untitled',
            newTitle: entry.winningTopic,
            currentFlag: entry.conversation.is_daily_forge,
            newFlag: true,
            dailyForgeTopic: entry.winningTopic
          });
        }
        
        console.log(`${i+1}. ${entry.winningTopic.substring(0, 50)}...`);
        console.log(`   Linked to: ${entry.conversation.title || 'Untitled'}`);
        console.log(`   Title match: ${!needsTitleUpdate ? '✅' : '❌ (will update)'}`);
        console.log(`   Is Daily Forge: ${entry.conversation.is_daily_forge ? '✅' : '❌ (will update)'}`);
        console.log('');
      } else {
        console.log(`${i+1}. ${entry.winningTopic.substring(0, 50)}...`);
        console.log(`   ❌ No conversation linked\n`);
      }
    });
    
    if (updates.length === 0) {
      console.log('✅ All conversations already have correct titles and flags!');
      return;
    }
    
    console.log(`\n🔄 Preparing to update ${updates.length} conversations...\n`);
    
    // Show what will change
    updates.forEach((update, i) => {
      console.log(`${i+1}. Conversation ID: ${update.conversationId.substring(0, 8)}...`);
      console.log(`   From: "${update.currentTitle.substring(0, 50)}..."`);
      console.log(`   To:   "${update.newTitle.substring(0, 50)}..."`);
      console.log(`   Flag: ${update.currentFlag ? 'true → true' : 'false → true'}`);
      console.log('');
    });
    
    // Actually perform updates
    console.log('📝 Updating conversations...\n');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const update of updates) {
      try {
        const updated = await prisma.conversation.update({
          where: { id: update.conversationId },
          data: { 
            title: update.newTitle,
            is_daily_forge: true
          }
        });
        
        console.log(`✅ Updated: ${updated.title.substring(0, 50)}...`);
        console.log(`   ID: ${updated.id.substring(0, 8)}..., Is Daily Forge: ${updated.is_daily_forge ? '✅' : '❌'}`);
        successCount++;
        
      } catch (err) {
        console.log(`❌ Failed to update ${update.conversationId}: ${err.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n📊 Update results: ${successCount} successful, ${errorCount} failed`);
    
    // Final verification
    console.log('\n\n📋 Final Conversation Status:');
    console.log('='.repeat(80));
    
    const updatedConversations = await prisma.conversation.findMany({
      where: {
        id: {
          in: updates.map(u => u.conversationId)
        }
      },
      orderBy: { created_at: 'desc' }
    });
    
    updatedConversations.forEach((conv, i) => {
      const dailyForgeMatch = dailyForgeEntries.find(df => 
        df.conversationId === conv.id
      );
      
      console.log(`\n${i+1}. ${conv.title.substring(0, 60)}...`);
      console.log(`   ID: ${conv.id.substring(0, 8)}...`);
      console.log(`   Created: ${conv.created_at.toISOString().split('T')[0]}`);
      console.log(`   Is Daily Forge: ${conv.is_daily_forge ? '✅' : '❌'}`);
      console.log(`   Daily Topic: ${conv.daily_topic || 'None'}`);
      
      if (dailyForgeMatch) {
        console.log(`   Linked DailyForge: ${dailyForgeMatch.date.toISOString().split('T')[0]}`);
      }
    });
    
    // Also show all conversations marked as daily_forge
    console.log('\n\n🎯 All conversations marked as is_daily_forge:');
    console.log('='.repeat(80));
    
    const allDailyForgeConvs = await prisma.conversation.findMany({
      where: { is_daily_forge: true },
      orderBy: { created_at: 'desc' }
    });
    
    if (allDailyForgeConvs.length > 0) {
      allDailyForgeConvs.forEach((conv, i) => {
        console.log(`${i+1}. ${conv.title.substring(0, 60)}...`);
        console.log(`   Date: ${conv.created_at.toISOString().split('T')[0]}`);
        console.log(`   ID: ${conv.id.substring(0, 8)}...\n`);
      });
    } else {
      console.log('No conversations marked as daily_forge');
    }
    
    console.log(`\n🎉 Updated ${successCount} conversations to match DailyForge titles and flags!`);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateConversations();

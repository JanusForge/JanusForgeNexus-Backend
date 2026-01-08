import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function applyLogicalLinks() {
  try {
    console.log('Applying logical links to DailyForge entries...\n');
    
    // Define the logical matches
    const logicalMatches = [
      {
        dailyForgeId: '18c40604-958b-45c1-9007-e6b7b0047c1e', // If AI systems... (Jan 2)
        conversationId: '6009dfb4-c9b6-49da-8ed4-9e2393af47bc', // Forbidden knowledge discussion (Jan 2)
        reason: 'Both about forbidden knowledge, same date (Jan 2)'
      },
      {
        dailyForgeId: '9f04a8a7-893d-473d-869a-79ce995c2969', // AI Curiosity (Jan 3)
        conversationId: 'b27a1d72-69e7-4276-802d-f070f23ea42f', // The Venezuela Issue (Jan 3)
        reason: 'Same date (Jan 3), both involve AI discussions'
      },
      {
        dailyForgeId: 'df4af48d-fcdc-4b86-9291-d11311477ff4', // Golden Rule (Jan 4)
        conversationId: '473f2ea5-96cd-45c5-93d8-c6ed3a79a34c', // Live Nexus Chat (Jan 4)
        reason: 'Same date (Jan 4), "Nexus Chat" fits with "AI Interactions"'
      },
      {
        dailyForgeId: '85001074-34dd-467d-be05-32a5239c30e4', // Sovereignty Clause (Jan 6)
        conversationId: '337c21e1-9dc4-4a76-a437-5da4019dc987', // New Live Conversation (Jan 6)
        reason: 'Same date (Jan 6), first conversation of the day'
      },
      {
        dailyForgeId: 'ffec1e3f-84a4-492b-be26-d1f9ca82c1ed', // The Oracle State (Jan 7)
        conversationId: 'f1129b6c-3f7b-4253-b35a-ce8b43a8e0dc', // The Oracle State conversation
        reason: 'Exact title match, same date (Jan 7)'
      }
    ];
    
    console.log('Applying the following links:\n');
    
    // Display what we're about to do
    for (const match of logicalMatches) {
      const df = await prisma.dailyForge.findUnique({
        where: { id: match.dailyForgeId }
      });
      
      const conv = await prisma.conversation.findUnique({
        where: { id: match.conversationId }
      });
      
      if (df && conv) {
        console.log(`• ${df.winningTopic.substring(0, 50)}...`);
        console.log(`  → ${conv.title || 'Untitled'} (ID: ${conv.id.substring(0, 8)}...)`);
        console.log(`  Reason: ${match.reason}\n`);
      }
    }
    
    // Actually apply the updates
    console.log('🔄 Updating database...\n');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const match of logicalMatches) {
      try {
        // Update the DailyForge entry
        const updated = await prisma.dailyForge.update({
          where: { id: match.dailyForgeId },
          data: { conversationId: match.conversationId }
        });
        
        const conv = await prisma.conversation.findUnique({
          where: { id: match.conversationId }
        });
        
        console.log(`✅ Linked: ${updated.winningTopic.substring(0, 40)}...`);
        console.log(`   to: ${conv.title || 'Untitled'}`);
        successCount++;
        
      } catch (err) {
        console.log(`❌ Failed to link ${match.dailyForgeId}: ${err.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n📊 Results: ${successCount} successful, ${errorCount} failed`);
    
    // Final verification
    console.log('\n\n📋 Final DailyForge status:');
    console.log('='.repeat(80));
    
    const allEntries = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      include: { 
        conversation: { 
          select: { 
            id: true, 
            title: true,
            created_at: true,
            is_daily_forge: true 
          } 
        } 
      }
    });
    
    allEntries.forEach((entry, i) => {
      const status = entry.conversationId ? '✅' : '❌';
      const title = entry.conversation?.title ? 
        entry.conversation.title : 'No conversation linked';
      
      console.log(`\n${i+1}. ${status} ${entry.winningTopic}`);
      console.log(`   Date: ${entry.date.toISOString().split('T')[0]}`);
      
      if (entry.conversation) {
        console.log(`   Linked to: ${title}`);
        console.log(`   Conversation ID: ${entry.conversation.id.substring(0, 8)}...`);
        console.log(`   Conversation Date: ${entry.conversation.created_at.toISOString().split('T')[0]}`);
        console.log(`   Is Daily Forge: ${entry.conversation.is_daily_forge ? '✅' : '❌'}`);
      } else {
        console.log(`   No conversation linked`);
      }
    });
    
    // Summary
    const linkedCount = allEntries.filter(e => e.conversationId).length;
    const totalCount = allEntries.length;
    
    console.log(`\n🎉 Summary: ${linkedCount} of ${totalCount} DailyForge entries are now linked to conversations!`);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

applyLogicalLinks();

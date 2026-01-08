import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function finalVerification() {
  try {
    console.log('🎯 FINAL VERIFICATION: DailyForge and Conversation Consistency\n');
    
    // Get all DailyForge entries with conversations
    const dailyForgeEntries = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      include: { 
        conversation: true 
      }
    });
    
    console.log('📊 DailyForge Summary:');
    console.log('='.repeat(80));
    
    let allGood = true;
    
    dailyForgeEntries.forEach((entry, i) => {
      const status = entry.conversationId ? '✅' : '❌';
      const titleMatch = entry.conversation && 
                        entry.conversation.title === entry.winningTopic ? 
                        '✅' : '❌';
      const flagMatch = entry.conversation && 
                       entry.conversation.is_daily_forge ? 
                       '✅' : '❌';
      
      console.log(`\n${i+1}. ${entry.winningTopic}`);
      console.log(`   Date: ${entry.date.toISOString().split('T')[0]}`);
      console.log(`   Linked: ${status}`);
      
      if (entry.conversation) {
        console.log(`   Conversation: ${entry.conversation.title}`);
        console.log(`   Title Match: ${titleMatch}`);
        console.log(`   Is Daily Forge: ${flagMatch}`);
        console.log(`   Conversation Date: ${entry.conversation.created_at.toISOString().split('T')[0]}`);
        
        if (titleMatch === '❌' || flagMatch === '❌') {
          allGood = false;
        }
      } else {
        console.log(`   No conversation linked`);
        allGood = false;
      }
    });
    
    // Check conversations marked as daily_forge
    console.log('\n\n📝 Conversations marked as is_daily_forge:');
    console.log('='.repeat(80));
    
    const dailyForgeConvs = await prisma.conversation.findMany({
      where: { is_daily_forge: true },
      orderBy: { created_at: 'desc' },
      include: {
        daily_forges: {
          select: { id: true, date: true }
        }
      }
    });
    
    dailyForgeConvs.forEach((conv, i) => {
      const linkedToDF = conv.daily_forges.length > 0 ? '✅' : '❌';
      console.log(`\n${i+1}. ${conv.title}`);
      console.log(`   ID: ${conv.id.substring(0, 8)}...`);
      console.log(`   Created: ${conv.created_at.toISOString().split('T')[0]}`);
      console.log(`   Linked to DailyForge: ${linkedToDF}`);
      console.log(`   Daily Topic: ${conv.daily_topic || 'None'}`);
      
      if (conv.daily_forges.length > 0) {
        console.log(`   DailyForge Date: ${conv.daily_forges[0].date.toISOString().split('T')[0]}`);
      }
    });
    
    // Summary
    console.log('\n\n🎉 FINAL SUMMARY:');
    console.log('='.repeat(80));
    console.log(`Total DailyForge entries: ${dailyForgeEntries.length}`);
    console.log(`Linked to conversations: ${dailyForgeEntries.filter(e => e.conversationId).length}`);
    console.log(`Conversations marked as daily_forge: ${dailyForgeConvs.length}`);
    
    if (allGood) {
      console.log('\n✅ SUCCESS: All DailyForge entries are properly linked with matching titles and flags!');
    } else {
      console.log('\n⚠️  ISSUES: Some entries need attention (see above for ❌ marks)');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

finalVerification();

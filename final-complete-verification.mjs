import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function finalCompleteVerification() {
  try {
    console.log('🎯 COMPLETE SYSTEM VERIFICATION\n');
    console.log('='.repeat(80));
    
    // 1. Check all DailyForge entries
    console.log('\n📋 ALL DAILYFORGE ENTRIES:');
    console.log('='.repeat(80));
    
    const allDailyForge = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      include: { 
        conversation: { 
          select: { 
            title: true,
            created_at: true,
            is_daily_forge: true
          } 
        } 
      }
    });
    
    let allLinked = true;
    let allTitlesMatch = true;
    let allFlagsCorrect = true;
    
    allDailyForge.forEach((entry, i) => {
      const linked = entry.conversationId ? '✅' : '❌';
      const titleMatch = entry.conversation && 
                        entry.conversation.title === entry.winningTopic ? 
                        '✅' : '❌';
      const flagCorrect = entry.conversation && 
                         entry.conversation.is_daily_forge ? 
                         '✅' : '❌';
      
      if (!entry.conversationId) allLinked = false;
      if (titleMatch === '❌') allTitlesMatch = false;
      if (flagCorrect === '❌') allFlagsCorrect = false;
      
      console.log(`\n${i+1}. ${linked} ${entry.winningTopic}`);
      console.log(`   Date: ${entry.date.toISOString().split('T')[0]}`);
      
      if (entry.conversation) {
        console.log(`   Conversation: ${entry.conversation.title}`);
        console.log(`   Title Match: ${titleMatch}`);
        console.log(`   Is Daily Forge: ${flagCorrect}`);
        console.log(`   Conversation Date: ${entry.conversation.created_at.toISOString().split('T')[0]}`);
      } else {
        console.log(`   No conversation linked`);
      }
    });
    
    // 2. Check conversations marked as daily_forge
    console.log('\n\n💬 CONVERSATIONS MARKED AS DAILY_FORGE:');
    console.log('='.repeat(80));
    
    const dailyForgeConvs = await prisma.conversation.findMany({
      where: { is_daily_forge: true },
      orderBy: { created_at: 'desc' },
      include: {
        daily_forges: {
          select: { id: true, date: true, winningTopic: true }
        }
      }
    });
    
    dailyForgeConvs.forEach((conv, i) => {
      const linkedToDF = conv.daily_forges.length > 0 ? '✅' : '❌';
      console.log(`\n${i+1}. ${conv.title}`);
      console.log(`   ID: ${conv.id.substring(0, 8)}...`);
      console.log(`   Created: ${conv.created_at.toISOString().split('T')[0]}`);
      console.log(`   Linked to DailyForge: ${linkedToDF}`);
      
      if (conv.daily_forges.length > 0) {
        console.log(`   DailyForge Date: ${conv.daily_forges[0].date.toISOString().split('T')[0]}`);
        console.log(`   DailyForge Topic: ${conv.daily_forges[0].winningTopic.substring(0, 40)}...`);
      }
    });
    
    // 3. Summary
    console.log('\n\n🎉 FINAL SUMMARY:');
    console.log('='.repeat(80));
    
    console.log(`Total DailyForge entries: ${allDailyForge.length}`);
    console.log(`Linked to conversations: ${allDailyForge.filter(e => e.conversationId).length}`);
    console.log(`Conversations marked as daily_forge: ${dailyForgeConvs.length}`);
    
    console.log('\n✅ CHECKLIST:');
    console.log(`1. All DailyForge entries linked: ${allLinked ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`2. All titles match: ${allTitlesMatch ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`3. All flags correct: ${allFlagsCorrect ? '✅ PASS' : '❌ FAIL'}`);
    
    if (allLinked && allTitlesMatch && allFlagsCorrect) {
      console.log('\n✨ SUCCESS: System is completely consistent and properly linked!');
    } else {
      console.log('\n⚠️  ISSUES: Some checks failed (see above for details)');
    }
    
    // 4. Test the original query
    console.log('\n\n🔍 TEST ORIGINAL QUERY:');
    console.log('='.repeat(80));
    
    const testEntries = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      take: 10,
      include: { conversation: { select: { title: true } } }
    });
    
    console.log(`\nFound ${testEntries.length} DailyForge entries:`);
    testEntries.forEach((entry, i) => {
      console.log(`\n${i+1}. ${entry.winningTopic}`);
      console.log(`   Date: ${entry.date.toISOString().split('T')[0]}`);
      console.log(`   ID: ${entry.id}`);
      console.log(`   Conversation: ${entry.conversation?.title || 'None'}`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

finalCompleteVerification();

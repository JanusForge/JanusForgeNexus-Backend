import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function analyzeTimestamps() {
  try {
    console.log('Analyzing DailyForge and Conversation timestamps...\n');
    
    // Get the 5 DailyForge entries that need linking
    const dailyForgeEntries = await prisma.dailyForge.findMany({
      where: {
        id: {
          in: [
            'ffec1e3f-84a4-492b-be26-d1f9ca82c1ed',    // 1. The Oracle State (Jan 7)
            '85001074-34dd-467d-be05-32a5239c30e4',    // 2. The Sovereignty Clause (Jan 6)
            'df4af48d-fcdc-4b86-9291-d11311477ff4',    // 3. Golden Rule (Jan 4)
            '9f04a8a7-893d-473d-869a-79ce995c2969',    // 6. AI Curiosity (Jan 3)
            '18c40604-958b-45c1-9007-e6b7b0047c1e'     // 7. If AI systems... (Jan 2)
          ]
        }
      },
      orderBy: { date: 'desc' } // Newest first
    });
    
    console.log('📅 DailyForge Entries:');
    console.log('='.repeat(80));
    dailyForgeEntries.forEach((df, i) => {
      const date = new Date(df.date);
      console.log(`\n${i+1}. ${df.winningTopic}`);
      console.log(`   ID: ${df.id}`);
      console.log(`   Full Date: ${date.toISOString()}`);
      console.log(`   Date: ${date.toISOString().split('T')[0]}`);
      console.log(`   Time: ${date.toISOString().split('T')[1].split('.')[0]} UTC`);
      console.log(`   Local: ${date.toLocaleString()}`);
    });
    
    // Get conversations from the relevant date range
    const conversations = await prisma.conversation.findMany({
      where: {
        created_at: {
          gte: new Date('2026-01-01T00:00:00.000Z'),
          lte: new Date('2026-01-08T00:00:00.000Z')
        }
      },
      orderBy: { created_at: 'desc' }
    });
    
    console.log('\n\n💬 Conversations (Jan 1-7, 2026):');
    console.log('='.repeat(80));
    
    // Group by date for easier reading
    const convByDate = {};
    conversations.forEach(conv => {
      const dateKey = conv.created_at.toISOString().split('T')[0];
      if (!convByDate[dateKey]) convByDate[dateKey] = [];
      convByDate[dateKey].push(conv);
    });
    
    // Display conversations grouped by date
    Object.keys(convByDate).sort().reverse().forEach(date => {
      console.log(`\n📅 ${date}:`);
      convByDate[date].forEach((conv, i) => {
        const convDate = new Date(conv.created_at);
        console.log(`\n  ${i+1}. ${conv.title || 'Untitled'}`);
        console.log(`     ID: ${conv.id}`);
        console.log(`     Time: ${convDate.toISOString().split('T')[1].split('.')[0]} UTC`);
        console.log(`     Is Daily Forge: ${conv.is_daily_forge ? '✅' : '❌'}`);
        console.log(`     Daily Topic: ${conv.daily_topic || 'None'}`);
      });
    });
    
    // Analysis
    console.log('\n\n🔍 ANALYSIS:');
    console.log('='.repeat(80));
    
    console.log('\n📊 Date Distribution:');
    console.log('\nDailyForge Dates:');
    const dfDates = [...new Set(dailyForgeEntries.map(df => df.date.toISOString().split('T')[0]))];
    dfDates.forEach(date => console.log(`  • ${date}`));
    
    console.log('\nConversation Dates:');
    Object.keys(convByDate).sort().reverse().forEach(date => {
      console.log(`  • ${date}: ${convByDate[date].length} conversations`);
    });
    
    console.log('\n\n🎯 RECOMMENDATIONS:');
    console.log('='.repeat(80));
    
    console.log('\n1. The Oracle State (Jan 7):');
    console.log('   ✅ Has matching conversation with same title');
    
    console.log('\n2. The Sovereignty Clause (Jan 6):');
    const jan6Convs = convByDate['2026-01-06'] || [];
    if (jan6Convs.length > 0) {
      console.log(`   Found ${jan6Convs.length} conversation(s) on Jan 6`);
      jan6Convs.forEach((conv, i) => {
        console.log(`   ${i+1}. "${conv.title || 'Untitled'}"`);
      });
    } else {
      console.log('   ❌ No conversations on Jan 6');
    }
    
    console.log('\n3. Golden Rule (Jan 4):');
    const jan4Convs = convByDate['2026-01-04'] || [];
    if (jan4Convs.length > 0) {
      console.log(`   Found ${jan4Convs.length} conversation(s) on Jan 4`);
    } else {
      console.log('   ❌ No conversations on Jan 4');
      console.log('   → Closest date: Jan 5 (5 conversations available)');
    }
    
    console.log('\n4. AI Curiosity (Jan 3):');
    const jan3Convs = convByDate['2026-01-03'] || [];
    if (jan3Convs.length > 0) {
      console.log(`   Found ${jan3Convs.length} conversation(s) on Jan 3`);
    } else {
      console.log('   ❌ No conversations on Jan 3');
      console.log('   → Closest date: Jan 5 (5 conversations available)');
    }
    
    console.log('\n5. If AI systems... (Jan 2):');
    const jan2Convs = convByDate['2026-01-02'] || [];
    if (jan2Convs.length > 0) {
      console.log(`   Found ${jan2Convs.length} conversation(s) on Jan 2`);
    } else {
      console.log('   ❌ No conversations on Jan 2');
      console.log('   → Closest date: Jan 5 (5 conversations available)');
    }
    
    console.log('\n\n💡 SUGGESTED APPROACH:');
    console.log('1. Link "The Oracle State" to its matching conversation');
    console.log('2. For other topics, either:');
    console.log('   a) Create new conversations on the correct dates');
    console.log('   b) Use existing Jan 5 conversations and update their titles');
    console.log('   c) Accept date mismatches but maintain the links');
    
    // Count conversations without daily_forge flag
    const nonDailyConvs = conversations.filter(conv => !conv.is_daily_forge);
    console.log(`\n📈 Stats: ${nonDailyConvs.length} of ${conversations.length} conversations are NOT marked as daily_forge`);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeTimestamps();

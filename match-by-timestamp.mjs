import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function matchByTimestamp() {
  try {
    console.log('Matching DailyForge entries to conversations by timestamp...\n');
    
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
    
    console.log('📅 DailyForge Entries (with exact timestamps):');
    dailyForgeEntries.forEach((df, i) => {
      console.log(`\n${i+1}. ${df.winningTopic}`);
      console.log(`   ID: ${df.id}`);
      console.log(`   Date: ${df.date.toISOString()}`);
      console.log(`   Date Only: ${df.date.toISOString().split('T')[0]}`);
      console.log(`   Time: ${df.date.toISOString().split('T')[1].split('.')[0]}`);
    });
    
    // Get all conversations from Jan 2-7, 2026
    const conversations = await prisma.conversation.findMany({
      where: {
        created_at: {
          gte: new Date('2026-01-02T00:00:00.000Z'),
          lte: new Date('2026-01-08T00:00:00.000Z')
        }
      },
      orderBy: { created_at: 'desc' }
    });
    
    console.log('\n\n💬 Conversations from Jan 2-7, 2026:');
    conversations.forEach((conv, i) => {
      console.log(`\n${i+1}. ${conv.title || 'Untitled'}`);
      console.log(`   ID: ${conv.id}`);
      console.log(`   Created: ${conv.created_at.toISOString()}`);
      console.log(`   Date Only: ${conv.created_at.toISOString().split('T')[0]}`);
      console.log(`   Time: ${conv.created_at.toISOString().split('T')[1].split('.')[0]}`);
      console.log(`   Is Daily Forge: ${conv.is_daily_forge}`);
      console.log(`   Daily Topic: ${conv.daily_topic || 'None'}`);
    });
    
    // Try to match by date and logical ordering
    console.log('\n\n🎯 Attempting to match by date:');
    
    // Group conversations by date
    const convByDate = {};
    conversations.forEach(conv => {
      const dateKey = conv.created_at.toISOString().split('T')[0];
      if (!convByDate[dateKey]) convByDate[dateKey] = [];
      convByDate[dateKey].push(conv);
    });
    
    // Group DailyForge by date
    const dfByDate = {};
    dailyForgeEntries.forEach(df => {
      const dateKey = df.date.toISOString().split('T')[0];
      if (!dfByDate[dateKey]) dfByDate[dateKey] = [];
      dfByDate[dateKey].push(df);
    });
    
    console.log('\n📊 DailyForge entries by date:');
    Object.keys(dfByDate).sort().reverse().forEach(date => {
      console.log(`\n${date}:`);
      dfByDate[date].forEach(df => {
        console.log(`  • ${df.winningTopic.substring(0, 60)}...`);
      });
    });
    
    console.log('\n📊 Conversations by date:');
    Object.keys(convByDate).sort().reverse().forEach(date => {
      console.log(`\n${date}:`);
      convByDate[date].forEach(conv => {
        console.log(`  • ${conv.title || 'Untitled'} (${conv.is_daily_forge ? 'DailyForge' : 'Regular'})`);
      });
    });
    
    // Try to find logical matches
    console.log('\n\n🔗 Suggested matches based on date and context:');
    
    const suggestedMatches = [];
    
    // 1. The Oracle State (Jan 7) - Already has a matching conversation
    const oracleStateDF = dailyForgeEntries.find(df => 
      df.winningTopic.includes('Oracle State')
    );
    const oracleStateConv = conversations.find(conv => 
      conv.title && conv.title.includes('Oracle State')
    );
    
    if (oracleStateDF && oracleStateConv) {
      suggestedMatches.push({
        dailyForge: oracleStateDF,
        conversation: oracleStateConv,
        reason: 'Exact title match'
      });
    }
    
    // 2. The Sovereignty Clause (Jan 6)
    const sovereigntyDF = dailyForgeEntries.find(df => 
      df.winningTopic.includes('Sovereignty')
    );
    const jan6Convs = convByDate['2026-01-06'] || [];
    if (sovereigntyDF && jan6Convs.length > 0) {
      // Pick the first conversation from Jan 6
      suggestedMatches.push({
        dailyForge: sovereigntyDF,
        conversation: jan6Convs[0],
        reason: 'Same date (Jan 6) - first conversation'
      });
    }
    
    // 3. Golden Rule (Jan 4) - No conversations on Jan 4, so use Jan 5
    const goldenRuleDF = dailyForgeEntries.find(df => 
      df.winningTopic.includes('Golden Rule')
    );
    const jan5Convs = convByDate['2026-01-05'] || [];
    if (goldenRuleDF && jan5Convs.length > 0) {
      // Find a conversation that might be related to Golden Rule
      const goldenRuleConv = jan5Convs.find(conv => 
        conv.title && (
          conv.title.includes('Golden') || 
          conv.title.includes('Rule') ||
          conv.title.includes('Council')
        )
      ) || jan5Convs[0]; // Fallback to first Jan 5 conversation
      
      suggestedMatches.push({
        dailyForge: goldenRuleDF,
        conversation: goldenRuleConv,
        reason: 'Closest date match (Jan 5)'
      });
    }
    
    // 4. AI Curiosity (Jan 3) - No conversations on Jan 3, use Jan 5
    const curiosityDF = dailyForgeEntries.find(df => 
      df.winningTopic.includes('AI Curiosity')
    );
    if (curiosityDF && jan5Convs.length > 1) {
      // Use second conversation from Jan 5
      suggestedMatches.push({
        dailyForge: curiosityDF,
        conversation: jan5Convs[1] || jan5Convs[0],
        reason: 'Closest date match (Jan 5)'
      });
    }
    
    // 5. If AI systems... (Jan 2) - No conversations on Jan 2, use Jan 5
    const forbiddenDF = dailyForgeEntries.find(df => 
      df.winningTopic.includes('genuine curiosity')
    );
    if (forbiddenDF && jan5Convs.length > 2) {
      // Use third conversation from Jan 5
      suggestedMatches.push({
        dailyForge: forbiddenDF,
        conversation: jan5Convs[2] || jan5Convs[0],
        reason: 'Closest date match (Jan 5)'
      });
    }
    
    // Display suggested matches
    console.log('\nProposed Links:');
    suggestedMatches.forEach((match, i) => {
      console.log(`\n${i+1}. ${match.dailyForge.winningTopic.substring(0, 50)}...`);
      console.log(`   Date: ${match.dailyForge.date.toISOString().split('T')[0]}`);
      console.log(`   → ${match.conversation.title || 'Untitled'}`);
      console.log(`   Conversation Date: ${match.conversation.created_at.toISOString().split('T')[0]}`);
      console.log(`   Reason: ${match.reason}`);
    });
    
    console.log('\n\n⚠️  Note: Many conversations were created on Jan 5. You might want to:');
    console.log('1. Check which specific conversations correspond to each topic');
    console.log('2. Or update conversation titles to match the DailyForge topics');
    console.log('3. Or accept these approximate matches');
    
    // Ask if we should proceed
    console.log('\nDo you want to proceed with these matches? (yes/no)');
    // For now, we'll just show the suggestions
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

matchByTimestamp();

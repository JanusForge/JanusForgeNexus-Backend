import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function findMatches() {
  try {
    console.log('Looking for conversations that match DailyForge topics...');
    
    // Get the specific DailyForge entries you mentioned
    const dailyForgeIds = [
      'ffec1e3f-84a4-492b-be26-d1f9ca82c1ed',    // 1. The Oracle State
      '85001074-34dd-467d-be05-32a5239c30e4',    // 2. The Sovereignty Clause
      'df4af48d-fcdc-4b86-9291-d11311477ff4',    // 3. Golden Rule for AI to AI to Human Interactions
      '9f04a8a7-893d-473d-869a-79ce995c2969',    // 6. AI Curiosity and Forbidden Knowledge
      '18c40604-958b-45c1-9007-e6b7b0047c1e'     // 7. If AI systems develop genuine curiosity...
    ];
    
    const dailyEntries = await prisma.dailyForge.findMany({
      where: { id: { in: dailyForgeIds } }
    });
    
    console.log('\n📋 DailyForge entries to link:');
    dailyEntries.forEach(entry => {
      console.log(`\n• ${entry.winningTopic}`);
      console.log(`  ID: ${entry.id}`);
      console.log(`  Date: ${entry.date.toISOString().split('T')[0]}`);
    });
    
    // Search for conversations with matching topics
    console.log('\n\n🔍 Searching for matching conversations...');
    
    const allConversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { is_daily_forge: true },
          { daily_topic: { not: null } },
          { title: { not: null } }
        ]
      },
      orderBy: { created_at: 'desc' },
      take: 20
    });
    
    console.log(`\nFound ${allConversations.length} potential conversations:`);
    
    allConversations.forEach((conv, i) => {
      console.log(`\n${i+1}. Title: ${conv.title || 'Untitled'}`);
      console.log(`   ID: ${conv.id}`);
      console.log(`   Daily Topic: ${conv.daily_topic || 'None'}`);
      console.log(`   Is Daily Forge: ${conv.is_daily_forge}`);
      console.log(`   Created: ${conv.created_at.toISOString().split('T')[0]}`);
    });
    
    // Try to auto-match based on keywords
    console.log('\n\n🎯 Attempting to match based on keywords...');
    
    const matches = [];
    
    for (const entry of dailyEntries) {
      const keywords = entry.winningTopic.toLowerCase().split(' ').slice(0, 5);
      const searchTerms = keywords.join(' ');
      
      const matchingConvs = allConversations.filter(conv => {
        const convText = `${conv.title || ''} ${conv.daily_topic || ''}`.toLowerCase();
        return keywords.some(keyword => 
          keyword.length > 3 && convText.includes(keyword)
        );
      });
      
      if (matchingConvs.length > 0) {
        matches.push({
          dailyForge: entry,
          conversations: matchingConvs
        });
      }
    }
    
    console.log(`\nFound ${matches.length} potential matches:`);
    matches.forEach((match, i) => {
      console.log(`\n${i+1}. DailyForge: ${match.dailyForge.winningTopic}`);
      match.conversations.forEach((conv, j) => {
        console.log(`   Match ${j+1}: ${conv.title || 'Untitled'} (ID: ${conv.id})`);
      });
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

findMatches();

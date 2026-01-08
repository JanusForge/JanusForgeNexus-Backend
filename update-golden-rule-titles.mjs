import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function updateGoldenRuleTitles() {
  try {
    console.log('Updating Golden Rule titles with version numbers...\n');
    
    // Get all Golden Rule entries
    const goldenRuleEntries = await prisma.dailyForge.findMany({
      where: {
        winningTopic: {
          contains: 'Golden Rule'
        }
      },
      orderBy: { date: 'desc' }
    });
    
    console.log('Current Golden Rule entries:\n');
    goldenRuleEntries.forEach((entry, i) => {
      const linked = entry.conversationId ? '✅ Linked' : '❌ Unlinked';
      console.log(`${i+1}. ${entry.winningTopic}`);
      console.log(`   ID: ${entry.id}`);
      console.log(`   Status: ${linked}`);
    });
    
    // Update titles with version numbers
    console.log('\n\n🔄 Updating titles...\n');
    
    const updates = [
      {
        id: 'eddc299e-9c7f-47dc-8f70-05b7a9cbf266',
        currentTitle: 'Golden Rule: for AI to AI to Human Interactions',
        newTitle: 'Golden Rule: for AI to AI to Human Interactions (v.1)'
      },
      {
        id: '664acc64-1432-4787-9703-55ffd5a2571a',
        currentTitle: 'Golden Rule for AI to AI Converdations',
        newTitle: 'Golden Rule for AI to AI Conversations (v.2)'
      },
      {
        id: 'df4af48d-fcdc-4b86-9291-d11311477ff4',
        currentTitle: 'Golden Rule for AI to AI to Human Interactions',
        newTitle: 'Golden Rule for AI to AI to Human Interactions (v.3)'
      }
    ];
    
    for (const update of updates) {
      try {
        const updated = await prisma.dailyForge.update({
          where: { id: update.id },
          data: { winningTopic: update.newTitle }
        });
        
        console.log(`✅ Updated: ${update.currentTitle.substring(0, 40)}...`);
        console.log(`   → ${update.newTitle}`);
        
      } catch (err) {
        console.log(`❌ Failed to update ${update.id}: ${err.message}`);
      }
    }
    
    // Now find conversations for the unlinked entries
    console.log('\n\n🔗 Finding conversations for unlinked entries...\n');
    
    const unlinkedEntries = await prisma.dailyForge.findMany({
      where: {
        id: {
          in: ['eddc299e-9c7f-47dc-8f70-05b7a9cbf266', '664acc64-1432-4787-9703-55ffd5a2571a']
        },
        conversationId: null
      }
    });
    
    console.log(`Found ${unlinkedEntries.length} unlinked Golden Rule entries:\n`);
    unlinkedEntries.forEach(entry => {
      console.log(`• ${entry.winningTopic}`);
      console.log(`  ID: ${entry.id}\n`);
    });
    
    // Find available conversations (not linked to DailyForge and not already daily_forge)
    const availableConversations = await prisma.conversation.findMany({
      where: {
        daily_forges: { none: {} }, // Not linked to any DailyForge
        is_daily_forge: false, // Not already marked as daily_forge
        created_at: {
          gte: new Date('2026-01-01T00:00:00.000Z'),
          lte: new Date('2026-01-08T00:00:00.000Z')
        }
      },
      orderBy: { created_at: 'desc' },
      take: 5
    });
    
    console.log(`Found ${availableConversations.length} available conversations:\n`);
    availableConversations.forEach((conv, i) => {
      console.log(`${i+1}. ${conv.title || 'Untitled'}`);
      console.log(`   ID: ${conv.id}`);
      console.log(`   Created: ${conv.created_at.toISOString().split('T')[0]}\n`);
    });
    
    // Link them if we have enough conversations
    if (unlinkedEntries.length > 0 && availableConversations.length >= unlinkedEntries.length) {
      console.log('🔗 Linking unlinked entries to available conversations...\n');
      
      for (let i = 0; i < unlinkedEntries.length; i++) {
        const entry = unlinkedEntries[i];
        const conv = availableConversations[i];
        
        try {
          // Link the DailyForge to conversation
          const updatedEntry = await prisma.dailyForge.update({
            where: { id: entry.id },
            data: { conversationId: conv.id }
          });
          
          // Update conversation title and flag
          const updatedConv = await prisma.conversation.update({
            where: { id: conv.id },
            data: { 
              title: updatedEntry.winningTopic,
              is_daily_forge: true
            }
          });
          
          console.log(`✅ Linked: ${updatedEntry.winningTopic}`);
          console.log(`   to: ${updatedConv.title} (${updatedConv.id.substring(0, 8)}...)`);
          console.log(`   Marked as daily_forge: ${updatedConv.is_daily_forge}\n`);
          
        } catch (err) {
          console.log(`❌ Failed to link ${entry.id}: ${err.message}`);
        }
      }
    } else if (unlinkedEntries.length > 0) {
      console.log(`⚠️  Not enough available conversations. Need ${unlinkedEntries.length}, found ${availableConversations.length}`);
      console.log('\nOptions:');
      console.log('1. Create new conversations for the remaining entries');
      console.log('2. Use conversations from different dates');
      console.log('3. Leave them unlinked for now');
    }
    
    // Final verification
    console.log('\n📊 Final Golden Rule entries:\n');
    const finalEntries = await prisma.dailyForge.findMany({
      where: {
        winningTopic: {
          contains: 'Golden Rule'
        }
      },
      orderBy: { date: 'desc' },
      include: { conversation: { select: { title: true, is_daily_forge: true } } }
    });
    
    finalEntries.forEach((entry, i) => {
      const status = entry.conversationId ? '✅' : '❌';
      console.log(`${i+1}. ${status} ${entry.winningTopic}`);
      console.log(`   Linked to: ${entry.conversation?.title || 'None'}`);
      if (entry.conversation) {
        console.log(`   Is Daily Forge: ${entry.conversation.is_daily_forge ? '✅' : '❌'}`);
      }
      console.log('');
    });
    
    console.log(`\n🎉 Updated ${updates.length} Golden Rule entries with version numbers.`);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateGoldenRuleTitles();

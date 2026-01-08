import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function linkLogicalMatches() {
  try {
    console.log('Creating logical links based on dates and topics...\n');
    
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
    
    console.log('Proposed Logical Links:\n');
    
    // Display and verify each match
    for (const match of logicalMatches) {
      try {
        // Get DailyForge entry
        const df = await prisma.dailyForge.findUnique({
          where: { id: match.dailyForgeId }
        });
        
        // Get Conversation
        const conv = await prisma.conversation.findUnique({
          where: { id: match.conversationId }
        });
        
        if (!df) {
          console.log(`❌ DailyForge not found: ${match.dailyForgeId}`);
          continue;
        }
        
        if (!conv) {
          console.log(`❌ Conversation not found: ${match.conversationId}`);
          continue;
        }
        
        console.log(`✅ ${df.winningTopic.substring(0, 50)}...`);
        console.log(`   DailyForge Date: ${df.date.toISOString().split('T')[0]} ${df.date.toISOString().split('T')[1].split('.')[0]}`);
        console.log(`   → ${conv.title || 'Untitled'}`);
        console.log(`   Conversation Date: ${conv.created_at.toISOString().split('T')[0]} ${conv.created_at.toISOString().split('T')[1].split('.')[0]}`);
        console.log(`   Reason: ${match.reason}`);
        console.log('');
        
      } catch (err) {
        console.log(`⚠️  Error checking match: ${err.message}`);
      }
    }
    
    // Ask if we should apply these links
    console.log('\n\nApply these links? This will update the database.');
    console.log('Type "YES" to proceed, or anything else to cancel:');
    
    // For now, we'll just show what would happen. To actually apply, you'd need to:
    // 1. Remove the read-only simulation below
    // 2. Uncomment the update code
    
    console.log('\n[SIMULATION MODE - No changes will be made to database]');
    console.log('To actually apply, replace the simulation code with:');
    console.log(`
      // Actually update the database
      for (const match of logicalMatches) {
        await prisma.dailyForge.update({
          where: { id: match.dailyForgeId },
          data: { conversationId: match.conversationId }
        });
      }
    `);
    
    // Simulation - show what would happen
    console.log('\n📝 What would happen:');
    for (const match of logicalMatches) {
      const df = await prisma.dailyForge.findUnique({
        where: { id: match.dailyForgeId }
      });
      const conv = await prisma.conversation.findUnique({
        where: { id: match.conversationId }
      });
      
      if (df && conv) {
        console.log(`• ${df.winningTopic.substring(0, 40)}...`);
        console.log(`  → Would link to: ${conv.title || 'Untitled'}`);
      }
    }
    
    // Show current status
    console.log('\n\n📊 Current DailyForge status (before changes):');
    const allEntries = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      include: { conversation: { select: { title: true } } }
    });
    
    allEntries.forEach((entry, i) => {
      const hasLink = entry.conversationId ? '✅' : '❌';
      const title = entry.conversation?.title ? 
        entry.conversation.title.substring(0, 30) : 'No link';
      
      console.log(`${i+1}. ${hasLink} ${entry.winningTopic.substring(0, 40)}...`);
      console.log(`   Currently linked to: ${title}`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

linkLogicalMatches();

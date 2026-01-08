import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanDuplicates() {
  try {
    console.log('Cleaning duplicate DailyForge entries...\n');
    
    // First, let's see all Golden Rule entries
    const goldenRuleEntries = await prisma.dailyForge.findMany({
      where: {
        winningTopic: {
          contains: 'Golden Rule'
        }
      },
      orderBy: { date: 'desc' }
    });
    
    console.log(`Found ${goldenRuleEntries.length} "Golden Rule" entries:\n`);
    
    goldenRuleEntries.forEach((entry, i) => {
      const linked = entry.conversationId ? '✅ Linked' : '❌ Unlinked';
      console.log(`${i+1}. ${entry.winningTopic}`);
      console.log(`   ID: ${entry.id}`);
      console.log(`   Date: ${entry.date.toISOString().split('T')[0]}`);
      console.log(`   Status: ${linked}`);
      console.log(`   Conversation ID: ${entry.conversationId || 'None'}\n`);
    });
    
    // Find exact duplicates (same winningTopic and same date)
    const entriesByTopicAndDate = {};
    
    goldenRuleEntries.forEach(entry => {
      const key = `${entry.winningTopic}|${entry.date.toISOString().split('T')[0]}`;
      if (!entriesByTopicAndDate[key]) {
        entriesByTopicAndDate[key] = [];
      }
      entriesByTopicAndDate[key].push(entry);
    });
    
    console.log('\n🔍 Duplicate analysis:');
    console.log('='.repeat(60));
    
    const duplicatesToDelete = [];
    
    Object.keys(entriesByTopicAndDate).forEach(key => {
      const entries = entriesByTopicAndDate[key];
      if (entries.length > 1) {
        console.log(`\nFound ${entries.length} duplicates for: "${entries[0].winningTopic.substring(0, 40)}..."`);
        
        // Keep the linked one, delete unlinked ones
        const linkedEntry = entries.find(e => e.conversationId);
        const unlinkedEntries = entries.filter(e => !e.conversationId);
        
        if (linkedEntry) {
          console.log(`   Keeping: ${linkedEntry.id} (Linked to conversation)`);
          
          unlinkedEntries.forEach(unlinked => {
            console.log(`   Deleting: ${unlinked.id} (Unlinked duplicate)`);
            duplicatesToDelete.push(unlinked.id);
          });
        } else {
          // If none are linked, keep the first one
          console.log(`   Keeping: ${entries[0].id} (First entry)`);
          
          entries.slice(1).forEach(unlinked => {
            console.log(`   Deleting: ${unlinked.id} (Duplicate)`);
            duplicatesToDelete.push(unlinked.id);
          });
        }
      }
    });
    
    if (duplicatesToDelete.length === 0) {
      console.log('\n✅ No exact duplicates found to delete.');
      return;
    }
    
    // Ask for confirmation
    console.log(`\n⚠️  Ready to delete ${duplicatesToDelete.length} duplicate entries.`);
    console.log('Type "DELETE" to confirm, or anything else to cancel:');
    
    // For safety, we'll simulate first. Change to "DELETE" to actually delete
    const confirmation = 'SIMULATE'; // Change to 'DELETE' to actually delete
    
    if (confirmation === 'DELETE') {
      console.log('\n🗑️  Deleting duplicates...\n');
      
      let deletedCount = 0;
      for (const id of duplicatesToDelete) {
        try {
          await prisma.dailyForge.delete({
            where: { id }
          });
          console.log(`✅ Deleted: ${id}`);
          deletedCount++;
        } catch (err) {
          console.log(`❌ Failed to delete ${id}: ${err.message}`);
        }
      }
      
      console.log(`\n🗑️  Deleted ${deletedCount} duplicate entries.`);
      
    } else {
      console.log('\n🔒 SIMULATION MODE - No entries will be deleted.');
      console.log('To actually delete, change confirmation to "DELETE" in the code.');
      console.log(`Would delete: ${duplicatesToDelete.length} entries`);
    }
    
    // Show what the data would look like after cleanup
    console.log('\n📊 What data would look like after cleanup:');
    console.log('='.repeat(60));
    
    const afterCleanup = goldenRuleEntries.filter(entry => 
      !duplicatesToDelete.includes(entry.id)
    );
    
    console.log(`\nRemaining "Golden Rule" entries: ${afterCleanup.length}\n`);
    
    afterCleanup.forEach((entry, i) => {
      const linked = entry.conversationId ? '✅ Linked' : '❌ Unlinked';
      console.log(`${i+1}. ${entry.winningTopic}`);
      console.log(`   ID: ${entry.id}`);
      console.log(`   Date: ${entry.date.toISOString().split('T')[0]}`);
      console.log(`   Status: ${linked}`);
    });
    
    // Final check of all DailyForge entries
    console.log('\n\n📋 All DailyForge entries after cleanup:');
    console.log('='.repeat(60));
    
    const allEntries = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      include: { conversation: { select: { title: true } } }
    });
    
    allEntries.forEach((entry, i) => {
      const status = entry.conversationId ? '✅' : '❌';
      console.log(`\n${i+1}. ${status} ${entry.winningTopic.substring(0, 50)}...`);
      console.log(`   Date: ${entry.date.toISOString().split('T')[0]}`);
      console.log(`   Linked to: ${entry.conversation?.title || 'None'}`);
    });
    
    console.log(`\n📈 Total: ${allEntries.length} entries`);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

cleanDuplicates();

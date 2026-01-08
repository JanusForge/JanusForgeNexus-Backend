const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  try {
    const entries = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      take: 10
    });

    console.log(`Found ${entries.length} DailyForge entries:`);
    entries.forEach((entry, i) => {
      console.log(`\n${i+1}. ${entry.winningTopic}`);
      console.log(`   Date: ${entry.date}`);
      console.log(`   ID: ${entry.id}`);
      console.log(`   Conversation ID: ${entry.conversationId || 'None'}`);
    });
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();

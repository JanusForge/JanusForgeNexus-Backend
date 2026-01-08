import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function verifyFix() {
  try {
    console.log('Testing DailyForge access after schema update...');
    
    // Method 1: Try the original query
    const entries = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      take: 5
    });
    
    console.log(`✅ Success! Found ${entries.length} DailyForge entries`);
    
    if (entries.length > 0) {
      console.log('\nSample entry:');
      console.log({
        id: entries[0].id,
        date: entries[0].date,
        winningTopic: entries[0].winningTopic,
        phase: entries[0].phase
      });
    }
    
    // Method 2: Also test with raw SQL to confirm table name
    console.log('\n--- Testing raw SQL query ---');
    const rawResult = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "DailyForge"`;
    console.log(`Raw SQL confirms table has ${rawResult[0].count} rows`);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('\nFull error details:', err);
  } finally {
    await prisma.$disconnect();
  }
}

verifyFix();

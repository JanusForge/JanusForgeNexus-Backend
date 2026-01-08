import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkTable() {
  try {
    console.log('Checking for DailyForge table...');
    
    // Check all possible table names
    const tableNames = [
      'DailyForge',
      'daily_forge', 
      'daily_forges',
      'Daily_Forge',
      'dailyforge'
    ];
    
    for (const tableName of tableNames) {
      try {
        const result = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "${tableName}"`;
        console.log(`✅ Table "${tableName}" exists with ${result[0].count} rows`);
      } catch (err) {
        console.log(`❌ Table "${tableName}" not found`);
      }
    }
    
    // Also check what tables exist with "daily" in the name
    console.log('\nSearching for tables containing "daily":');
    const dailyTables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%daily%'
      ORDER BY table_name
    `;
    
    if (dailyTables.length > 0) {
      console.log('Found tables:');
      dailyTables.forEach(table => console.log(`  - ${table.table_name}`));
    } else {
      console.log('No tables found containing "daily"');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkTable();

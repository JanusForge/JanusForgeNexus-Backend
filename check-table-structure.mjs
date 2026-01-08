import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkTableStructure() {
  try {
    console.log('Checking DailyForge table structure...');
    
    // Get column information for the DailyForge table
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'DailyForge'
      ORDER BY ordinal_position
    `;
    
    console.log('\n📊 DailyForge table columns:');
    console.log('===========================');
    columns.forEach(col => {
      console.log(`- ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // Check if conversationId column exists with different naming
    const conversationColumns = columns.filter(col => 
      col.column_name.toLowerCase().includes('conversation')
    );
    
    console.log('\n🔍 Conversation-related columns:');
    if (conversationColumns.length > 0) {
      conversationColumns.forEach(col => {
        console.log(`- ${col.column_name}`);
      });
    } else {
      console.log('No conversation-related columns found.');
    }
    
    // Also check if we can query the table with raw SQL
    console.log('\n📋 Sample data (first 3 rows):');
    const sampleData = await prisma.$queryRaw`SELECT * FROM "DailyForge" LIMIT 3`;
    
    if (sampleData.length > 0) {
      sampleData.forEach((row, index) => {
        console.log(`\nRow ${index + 1}:`);
        Object.keys(row).forEach(key => {
          console.log(`  ${key}: ${row[key]}`);
        });
      });
    } else {
      console.log('Table is empty.');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkTableStructure();

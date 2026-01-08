import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function addColumn() {
  try {
    console.log('Adding conversationId column to DailyForge table...');
    
    // First, check current structure
    const beforeColumns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'DailyForge'
      ORDER BY ordinal_position
    `;
    
    console.log('\n📊 Current columns before change:');
    beforeColumns.forEach(col => console.log(`  - ${col.column_name} (${col.data_type})`));
    
    // Add the column (make it nullable since existing rows won't have it)
    await prisma.$executeRaw`
      ALTER TABLE "DailyForge" 
      ADD COLUMN IF NOT EXISTS "conversationId" TEXT 
      REFERENCES "conversations"("id") 
      ON DELETE SET NULL
    `;
    
    console.log('\n✅ Added conversationId column successfully');
    
    // Verify the column was added
    const afterColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'DailyForge'
      ORDER BY ordinal_position
    `;
    
    console.log('\n📊 Updated table structure:');
    afterColumns.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // Check if any data needs to be migrated
    const rowCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "DailyForge"`;
    console.log(`\n📈 Total rows in DailyForge: ${rowCount[0].count}`);
    
    // Show a few rows to see conversationId values
    console.log('\n🔍 Checking first 3 rows for conversationId values:');
    const sampleRows = await prisma.$queryRaw`
      SELECT id, date, "winningTopic", "conversationId"
      FROM "DailyForge" 
      ORDER BY date DESC 
      LIMIT 3
    `;
    
    sampleRows.forEach((row, i) => {
      console.log(`\nRow ${i+1}:`);
      console.log(`  ID: ${row.id}`);
      console.log(`  Date: ${row.date}`);
      console.log(`  Topic: ${row.winningTopic}`);
      console.log(`  conversationId: ${row.conversationId || 'NULL (new column)'}`);
    });
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('\nFull error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

addColumn();

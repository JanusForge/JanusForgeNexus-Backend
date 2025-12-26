// This fixes the schema mismatch for the conversations endpoint
const { Client } = require('pg');

async function testConversationsQuery() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('🔍 Testing database schema...');
    
    // First, check what columns actually exist
    const tableInfo = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'conversations'
      ORDER BY ordinal_position;
    `);
    
    console.log('\n📊 Conversations table columns:');
    tableInfo.rows.forEach(row => {
      console.log(`  • ${row.column_name} (${row.data_type})`);
    });
    
    // Try a simpler query to get conversations
    const result = await client.query(`
      SELECT 
        c.id,
        c.content,
        c.created_at,
        u.username,
        u.tier
      FROM conversations c
      JOIN users u ON c.user_id = u.id
      ORDER BY c.created_at DESC
      LIMIT 10
    `);
    
    console.log('\n✅ Query successful!');
    console.log(`📝 Found ${result.rows.length} conversations`);
    
    if (result.rows.length > 0) {
      console.log('\nSample conversation:');
      console.log(JSON.stringify(result.rows[0], null, 2));
    }
    
    await client.end();
    return result.rows;
    
  } catch (error) {
    console.error('\n❌ Database error:', error.message);
    
    // Try alternative query if the first fails
    try {
      console.log('\n🔄 Trying alternative query...');
      const altResult = await client.query(`
        SELECT * FROM conversations 
        ORDER BY created_at DESC 
        LIMIT 10
      `);
      console.log(`✅ Alternative query found ${altResult.rows.length} conversations`);
      await client.end();
      return altResult.rows;
    } catch (altError) {
      console.error('❌ Alternative query also failed:', altError.message);
      await client.end();
      return [];
    }
  }
}

testConversationsQuery();

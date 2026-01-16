const { Client } = require('pg');
require('dotenv').config();

console.log('🔌 Testing connection to new Render database...');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    console.log('📊 Connecting...');
    await client.connect();
    console.log('✅ Connected successfully!');

    // Test query
    const result = await client.query('SELECT version() as version, current_database() as db');
    console.log('💾 Database Info:');
    console.log('   Version:', result.rows[0].version);
    console.log('   Database:', result.rows[0].db);

    // Check existing tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log(`📋 Found ${tables.rows.length} existing tables:`);
    tables.rows.forEach((table, i) => {
      console.log(`   ${i + 1}. ${table.table_name}`);
    });

    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    
    if (error.message.includes('password authentication')) {
      console.log('\n💡 Authentication failed. Check username/password.');
    } else if (error.message.includes('does not exist')) {
      console.log('\n💡 Database "janusforge_db" might not exist.');
      console.log('   Create it in Render.com dashboard.');
    }
    
    return false;
  } finally {
    await client.end();
  }
}

test().then(success => {
  process.exit(success ? 0 : 1);
});

const { Client } = require('pg');

console.log('🔍 Verifying CORRECT database connection...');

const client = new Client({
  host: 'dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com',
  port: 5432,
  user: 'janusforge_db_user',
  password: 'ULGk5U42rCFKuOJnZWFOuG0rihKtkcS9',
  database: 'janusforge_db',
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    await client.connect();
    console.log('✅ Direct connection to CORRECT database works!');
    
    const result = await client.query('SELECT NOW() as time, version() as version');
    console.log('📅 Time:', result.rows[0].time);
    console.log('💾', result.rows[0].version.split(',')[0]);
    
    // List tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log(`\n📊 Found ${tables.rows.length} tables:`);
    tables.rows.forEach((table, i) => {
      console.log(`   ${i + 1}. ${table.table_name}`);
    });
    
  } catch (error) {
    console.error('❌ Direct connection failed:', error.message);
  } finally {
    await client.end();
  }
}

test();

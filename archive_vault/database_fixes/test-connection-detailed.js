const { Client } = require('pg');

const config = {
  host: 'dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com',
  port: 5432,
  database: 'janusforge_db',
  user: 'janusforge_db_user',
  password: 'ULGk5U42rCFKuOJnZWFOuG0rihKtkcS9',
  ssl: {
    rejectUnauthorized: false,
    require: true
  },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 10000,
  max: 10
};

console.log('🔌 Testing detailed connection...');
console.log('Host:', config.host);
console.log('Database:', config.database);

const client = new Client(config);

async function test() {
  try {
    console.log('Attempting connection...');
    await client.connect();
    console.log('✅ Connected successfully!');
    
    // Test query
    const result = await client.query('SELECT version() as version, current_database() as db');
    console.log('💾 Database Info:');
    console.log('   Version:', result.rows[0].version);
    console.log('   Database:', result.rows[0].db);
    
    // Check tables
    const tables = await client.query(`
      SELECT table_name, table_type
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log(`📋 Found ${tables.rows.length} tables:`);
    tables.rows.forEach((table, i) => {
      console.log(`   ${i + 1}. ${table.table_name} (${table.table_type})`);
    });
    
    return true;
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Error detail:', error.detail);
    
    return false;
  } finally {
    try {
      await client.end();
    } catch (e) {
      // Ignore
    }
  }
}

test().then(success => {
  process.exit(success ? 0 : 1);
});

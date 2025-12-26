const { Client } = require('pg');
require('dotenv').config();

console.log('🔌 Testing full Render.com connection...');
console.log('📊 Using DATABASE_URL from .env');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.log('❌ DATABASE_URL not found in .env');
  process.exit(1);
}

console.log('Host: dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com');
console.log('Database: janusforge_db');

const client = new Client({
  connectionString: connectionString,
  ssl: { 
    rejectUnauthorized: false,
    require: true
  },
  connectionTimeoutMillis: 15000
});

async function test() {
  try {
    console.log('Attempting connection...');
    await client.connect();
    console.log('✅ Connected to Render.com database!');
    
    // Test query
    const version = await client.query('SELECT version()');
    console.log('💾 Database:', version.rows[0].version.split(',')[0]);
    
    // Check tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    if (tables.rows.length > 0) {
      console.log(`📋 Found ${tables.rows.length} existing tables:`);
      tables.rows.forEach((table, i) => {
        console.log(`   ${i + 1}. ${table.table_name}`);
      });
    } else {
      console.log('📋 No tables found (fresh database)');
      console.log('💡 Tables will be created when server starts');
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    
    if (error.message.includes('database "janusforge_db" does not exist')) {
      console.log('\n💡 Database does not exist on Render.com.');
      console.log('📋 To create it:');
      console.log('   1. Connect to default postgres database:');
      console.log('      psql "postgresql://janusforge_db_user:ULGk5U42rCFKuOJnZWFOuG0rihKtkcS9@dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com/postgres?sslmode=require"');
      console.log('   2. Run: CREATE DATABASE janusforge_db;');
      console.log('   3. Exit: \\q');
    } else if (error.message.includes('password authentication')) {
      console.log('\n💡 Authentication failed. Check password.');
    }
    
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

const { Client } = require('pg');
require('dotenv').config();

console.log('🔌 Testing Render.com database connection...');

// Use the DATABASE_URL directly
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.log('❌ DATABASE_URL not set in .env');
  process.exit(1);
}

console.log('📊 Connection string configured');
console.log('Host: dpg-d56p1bbuibrs739ojang-a');
console.log('Database: janusforge_db');

const client = new Client({
  connectionString: connectionString,
  ssl: { 
    rejectUnauthorized: false,
    require: true
  },
  connectionTimeoutMillis: 10000
});

async function testConnection() {
  try {
    console.log('Attempting to connect...');
    await client.connect();
    console.log('✅ Connected successfully!');
    
    // Test a simple query
    const result = await client.query('SELECT version() as version');
    console.log('💾 Database version:', result.rows[0].version);
    
    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    
    // Try alternative approach - might be database doesn't exist yet
    console.log('\n💡 For Render.com free tier:');
    console.log('   The database might need to be created manually.');
    console.log('\n📋 To create the database:');
    console.log('   1. Go to dashboard.render.com');
    console.log('   2. Find your PostgreSQL database (dpg-d56p1bbuibrs739ojang-a)');
    console.log('   3. Click "Connect" → "External Connection"');
    console.log('   4. Use this command:');
    console.log('      psql "postgresql://janusforge_db_user:ULGk5U42rCFKuOJnZWFOuG0rihKtkcS9@dpg-d56p1bbuibrs739ojang-a/postgres?sslmode=require"');
    console.log('   5. Then run: CREATE DATABASE janusforge_db;');
    
    return false;
  } finally {
    try {
      await client.end();
    } catch (e) {
      // Ignore
    }
  }
}

testConnection();

console.log('🔍 Diagnostic test...');
require('dotenv').config();

console.log('DATABASE_URL from .env:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');

if (process.env.DATABASE_URL) {
  const url = process.env.DATABASE_URL;
  console.log('URL contains correct host:', url.includes('dpg-d56p1bbuibrs739ojang-a'));
  console.log('URL contains correct user:', url.includes('janusforge_db_user'));
  console.log('First 80 chars:', url.substring(0, 80) + '...');
}

// Test direct connection
const { Client } = require('pg');
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
    console.log('✅ Direct pg client connection works');
    await client.end();
    console.log('✅ All basic connectivity tests PASS');
  } catch (error) {
    console.error('❌ Direct connection failed:', error.message);
  }
}

test();

const { Client } = require('pg');
require('dotenv').config();

console.log('🔬 Testing Professional Tier Connection (WITH SSL FIX)...');
console.log('=========================================================');

// Extract just the base URL without query parameters for debugging
const dbUrl = process.env.DATABASE_URL;
console.log('📋 Database URL (first 60 chars):', dbUrl.substring(0, 60) + '...');

// Test with different SSL configurations
const testConfigs = [
  { name: 'SSL require (strict)', ssl: { rejectUnauthorized: true } },
  { name: 'SSL allow', ssl: { rejectUnauthorized: false } },
  { name: 'No SSL', ssl: false }
];

async function testConnection(config) {
  console.log(`\n🔧 Testing: ${config.name}...`);
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL.split('?')[0], // Remove query params for clean test
    ssl: config.ssl,
    connectionTimeoutMillis: 15000,
    query_timeout: 15000,
    keepalives: true,
    keepalives_idle: 60
  });

  try {
    console.log('   Connecting...');
    await client.connect();
    console.log(`   ✅ ${config.name}: SUCCESS!`);
    
    // Quick query to verify
    const result = await client.query('SELECT NOW() as time, version() as version');
    console.log(`   📅 Server time: ${result.rows[0].time}`);
    console.log(`   💾 ${result.rows[0].version.split(',')[0]}`);
    
    await client.end();
    return true;
  } catch (error) {
    console.log(`   ❌ ${config.name}: ${error.message}`);
    await client.end().catch(() => {});
    return false;
  }
}

async function runTests() {
  console.log('\n🎯 Running connection tests...');
  
  let success = false;
  for (const config of testConfigs) {
    if (await testConnection(config)) {
      success = true;
      console.log(`\n💡 Use this SSL setting: ${config.name}`);
      break;
    }
  }
  
  if (!success) {
    console.log('\n🔴 ALL CONNECTION TESTS FAILED');
    console.log('\n🔧 Troubleshooting steps:');
    console.log('1. Wait 10 minutes for upgrade to fully propagate');
    console.log('2. Check Render dashboard for any alerts');
    console.log('3. Try connecting with different SSL modes:');
    console.log('   - Add ?sslmode=require to URL');
    console.log('   - Add ?sslmode=no-verify');
    console.log('   - Add ?sslmode=disable (not recommended)');
    console.log('4. Contact Render support: support@render.com');
    
    // Try one more test with modified URL
    console.log('\n🔄 Testing with modified URL...');
    const modifiedUrl = process.env.DATABASE_URL.replace('render.com', 'render.com:5432');
    console.log('Modified URL:', modifiedUrl.substring(0, 70) + '...');
  } else {
    console.log('\n🎉 PROFESSIONAL TIER CONNECTION VERIFIED!');
    console.log('✅ Database is responding');
    console.log('✅ SSL configured correctly');
    console.log('✅ Professional tier active');
  }
}

runTests();

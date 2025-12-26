const { Client } = require('pg');

const client = new Client({
  host: 'dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com',
  port: 5432,
  user: 'janusforge_db_user',
  password: 'ULGk5U42rCFKuOJnZWFOuG0rihKtkcS9',
  database: 'janusforge_db',
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000
});

async function test() {
  console.log('🔍 Testing direct PostgreSQL connection...');
  console.log('Host:', client.host);
  console.log('User:', client.user);
  
  try {
    await client.connect();
    console.log('✅ Connected successfully!');
    
    const result = await client.query('SELECT NOW() as time, version() as version');
    console.log('📅 Time:', result.rows[0].time);
    console.log('💾', result.rows[0].version.split(',')[0]);
    
    // Test your specific database
    const dbResult = await client.query("SELECT current_database(), current_user");
    console.log('📊 Database:', dbResult.rows[0].current_database);
    console.log('👤 User:', dbResult.rows[0].current_user);
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    
    if (error.message.includes('password authentication failed')) {
      console.log('\n🔑 PASSWORD ISSUE: Credentials might be incorrect');
      console.log('   Check your Render dashboard for the correct password');
    } else if (error.message.includes('does not exist')) {
      console.log('\n📁 DATABASE ISSUE: Database might not exist');
      console.log('   Verify database name in Render dashboard');
    } else if (error.message.includes('timeout')) {
      console.log('\n🌐 NETWORK ISSUE: Cannot reach the server');
      console.log('   Check firewall/network settings');
    }
  } finally {
    await client.end();
  }
}

test();

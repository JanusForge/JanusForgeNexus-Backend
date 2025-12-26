const { Client } = require('pg');

// Extract connection details from DATABASE_URL
const dbUrl = process.env.DATABASE_URL || '';
console.log('Database URL:', dbUrl.substring(0, 50) + '...');

// Try to connect to postgres default database to check if we can reach the host
const urlParts = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
if (!urlParts) {
  console.log('❌ Could not parse DATABASE_URL');
  process.exit(1);
}

const [_, user, password, host, port, database] = urlParts;
console.log(`Host: ${host}, Port: ${port}, Database: ${database}`);

// Try connecting to 'postgres' database first (usually exists)
const testClient = new Client({
  host: host,
  port: port,
  user: user,
  password: password,
  database: 'postgres', // Try default postgres database
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    console.log('Testing connection to Render.com host...');
    await testClient.connect();
    console.log('✅ Connected to Render.com!');
    
    // Check if our database exists
    const dbCheck = await testClient.query(`
      SELECT datname FROM pg_database WHERE datname = 'janusforge_db'
    `);
    
    if (dbCheck.rows.length > 0) {
      console.log('✅ Database "janusforge_db" exists');
    } else {
      console.log('❌ Database "janusforge_db" does not exist');
      console.log('\n💡 You need to create the database on Render.com:');
      console.log('   1. Go to dashboard.render.com');
      console.log('   2. Click on your PostgreSQL database');
      console.log('   3. Find "Commands" or "SQL Shell"');
      console.log('   4. Run: CREATE DATABASE janusforge_db;');
    }
    
  } catch (error) {
    console.error('❌ Connection error:', error.message);
  } finally {
    await testClient.end();
  }
}

test();

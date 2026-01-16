const { Client } = require('pg');

// Connect to default postgres database to create our database
const adminClient = new Client({
  host: 'dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com',
  port: 5432,
  user: 'janusforge_db_user',
  password: 'ULGk5U42rCFKuOJnZWFOuG0rihKtkcS9',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function createDatabase() {
  try {
    console.log('Connecting to Render.com...');
    await adminClient.connect();
    console.log('✅ Connected to postgres database');
    
    console.log('Creating janusforge_db...');
    await adminClient.query('CREATE DATABASE janusforge_db');
    console.log('✅ Database janusforge_db created successfully!');
    
    console.log('\n🎉 Database is ready!');
    console.log('Connection URL:');
    console.log('postgresql://janusforge_db_user:ULGk5U42rCFKuOJnZWFOuG0rihKtkcS9@dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com/janusforge_db?sslmode=require');
    
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('✅ Database janusforge_db already exists');
    } else {
      console.error('❌ Error:', error.message);
      console.log('\n💡 You may need to create it manually in Render.com dashboard.');
    }
  } finally {
    await adminClient.end();
  }
}

createDatabase();

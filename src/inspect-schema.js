const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://janusforge_db_user:ULGk5U42rCFKuOJnZWFOuG0rihKtkcS9@dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com/janusforge_db?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function inspectSchema() {
  console.log('🔍 Inspecting actual database schema...\n');
  
  try {
    await client.connect();
    
    // 1. Check users table
    console.log('📋 USERS table columns:');
    const userColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    userColumns.rows.forEach(col => {
      console.log(`  • ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    console.log('\n📋 TIER_CONFIGURATIONS table columns:');
    const tierColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tier_configurations'
      ORDER BY ordinal_position
    `);
    
    tierColumns.rows.forEach(col => {
      console.log(`  • ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    console.log('\n📋 Sample data from tier_configurations:');
    const sampleTiers = await client.query('SELECT * FROM tier_configurations LIMIT 1');
    if (sampleTiers.rows.length > 0) {
      const row = sampleTiers.rows[0];
      console.log('First row keys:', Object.keys(row));
      console.log('First row values:', row);
    }
    
    console.log('\n📋 All tables in database:');
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    tables.rows.forEach((table, i) => {
      console.log(`  ${i + 1}. ${table.table_name}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

inspectSchema();

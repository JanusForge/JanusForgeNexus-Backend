const { Client } = require('pg');
require('dotenv').config();

async function testDirectConnection() {
  console.log('🔌 Testing direct PostgreSQL connection to Render.com...');
  
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('❌ DATABASE_URL not configured');
    return;
  }
  
  console.log('Connection string (partial):', connectionString.substring(0, 60) + '...');
  
  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false,
      require: true
    },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000
  });
  
  try {
    console.log('Attempting connection...');
    await client.connect();
    console.log('✅ Direct connection successful!');
    
    // Test query
    const result = await client.query('SELECT version() as version');
    console.log('Database version:', result.rows[0].version);
    
    // Check our tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log(`Found ${tables.rows.length} tables:`);
    tables.rows.forEach(table => console.log(`  - ${table.table_name}`));
    
    // Check tier_configurations
    try {
      const tiers = await client.query('SELECT tier, ai_models, token_allowance FROM tier_configurations');
      console.log(`\nTier configurations (${tiers.rows.length}):`);
      tiers.rows.forEach(tier => {
        console.log(`  - ${tier.tier}: ${tier.ai_models.length} AI models, ${tier.token_allowance} tokens`);
      });
    } catch (tierError) {
      console.log('Tier table might not exist yet:', tierError.message);
    }
    
  } catch (error) {
    console.error('❌ Direct connection failed:', error.message);
    console.error('Error code:', error.code);
    
    if (error.code === '57P01') {
      console.log('\n💡 Admin shutdown in progress. Render.com might be restarting.');
    } else if (error.code === '57P03') {
      console.log('\n💡 Cannot connect now. Render.com database might be starting up.');
    }
    
  } finally {
    try {
      await client.end();
    } catch (e) {
      // Ignore
    }
  }
}

testDirectConnection();

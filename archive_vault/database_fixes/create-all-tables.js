const { Client } = require('pg');

const config = {
  host: 'dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com',
  port: 5432,
  database: 'janusforge_db',
  user: 'janusforge_db_user',
  password: 'ULGk5U42rCFKuOJnZWFOuG0rihKtkcS9',
  ssl: { rejectUnauthorized: false, require: true }
};

async function setupDatabase() {
  const client = new Client(config);
  
  try {
    console.log('🔗 Connecting to database...');
    await client.connect();
    console.log('✅ Connected');
    
    console.log('📊 Creating all tables...');
    
    const sql = `
      -- Enable UUID extension
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        tier VARCHAR(20) DEFAULT 'FREE',
        token_balance INTEGER DEFAULT 0,
        refresh_token TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Conversations table
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(500),
        is_daily_forge BOOLEAN DEFAULT false,
        daily_topic TEXT,
        forge_date TIMESTAMP,
        council_members TEXT[],
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      );
      
      -- Posts table
      CREATE TABLE IF NOT EXISTS posts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        content TEXT NOT NULL,
        is_human BOOLEAN DEFAULT true,
        ai_model VARCHAR(20),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        parent_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
        likes INTEGER DEFAULT 0,
        required_tier VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      -- AI Responses table
      CREATE TABLE IF NOT EXISTS ai_responses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        post_id UUID UNIQUE NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        ai_model VARCHAR(20) NOT NULL,
        raw_response TEXT NOT NULL,
        processing_time INTEGER NOT NULL,
        tokens_used INTEGER NOT NULL,
        cost_cents INTEGER NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Debate Votes table
      CREATE TABLE IF NOT EXISTS debate_votes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        ai_model VARCHAR(20) NOT NULL,
        score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, conversation_id, ai_model)
      );
      
      -- Token Transactions table
      CREATE TABLE IF NOT EXISTS token_transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Tier Configurations table
      CREATE TABLE IF NOT EXISTS tier_configurations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tier VARCHAR(20) UNIQUE NOT NULL,
        ai_models TEXT[] NOT NULL,
        token_allowance INTEGER NOT NULL,
        price_cents INTEGER NOT NULL
      );
      
      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_posts_conversation ON posts(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
      CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_ai_responses_post ON ai_responses(post_id);
      CREATE INDEX IF NOT EXISTS idx_debate_votes_conversation ON debate_votes(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_token_transactions_user ON token_transactions(user_id);
    `;
    
    await client.query(sql);
    console.log('✅ All tables created successfully');
    
    // Seed tier configurations
    console.log('🌱 Seeding tier configurations...');
    const seedSQL = `
      INSERT INTO tier_configurations (tier, ai_models, token_allowance, price_cents) VALUES
        ('FREE', ARRAY['CHATGPT', 'DEEPSEEK'], 50, 0),
        ('BASIC', ARRAY['CHATGPT', 'DEEPSEEK', 'GEMINI_PRO'], 250, 900),
        ('PROFESSIONAL', ARRAY['GROK', 'GEMINI_PRO', 'CLAUDE', 'CHATGPT', 'DEEPSEEK'], 1000, 2900),
        ('ENTERPRISE', ARRAY['GROK', 'GEMINI_PRO', 'CLAUDE', 'CHATGPT', 'DEEPSEEK'], 50000, 9900)
      ON CONFLICT (tier) DO UPDATE SET
        ai_models = EXCLUDED.ai_models,
        token_allowance = EXCLUDED.token_allowance,
        price_cents = EXCLUDED.price_cents;
    `;
    
    await client.query(seedSQL);
    console.log('✅ Tier configurations seeded');
    
    // Create welcome conversation
    console.log('💬 Creating welcome conversation...');
    const welcomeSQL = `
      INSERT INTO conversations (id, title, is_daily_forge, created_at) VALUES
        (uuid_generate_v4(), 'Welcome to Janus Forge Nexus!', false, NOW())
      ON CONFLICT DO NOTHING;
    `;
    
    await client.query(welcomeSQL);
    console.log('✅ Welcome conversation created');
    
    // Verify tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log(`\n📋 Database now has ${tables.rows.length} tables:`);
    tables.rows.forEach(table => console.log(`   - ${table.table_name}`));
    
    console.log('\n🎉 Database setup complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

setupDatabase();

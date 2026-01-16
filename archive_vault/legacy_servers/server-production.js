const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

console.log(`
╔══════════════════════════════════════════════════╗
║ 🚀 JANUS FORGE NEXUS - FINAL MASTER PRODUCTION   ║
║      AUTONOMOUS INFRASTRUCTURE OPERATIONAL       ║
╚══════════════════════════════════════════════════╝
`);

// ================================================
// 1. FORCED PROFESSIONAL DATABASE URL
// ================================================
// This ensures your $19/month database is ALWAYS the source of truth.
const FORCED_DB_URL = 'postgresql://janusforge_db_user:ULGk5U42rCFKuOJnZWFOuG0rihKtkcS9@dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com/janusforge_db?sslmode=require';

const app = express();
const PORT = process.env.PORT || 5000;

// Database connection pooling for high-concurrency
const pool = new Pool({
  connectionString: FORCED_DB_URL,
  ssl: { rejectUnauthorized: false }
});

// ================================================
// 2. SCHEMA INITIALIZATION (The "Brain")
// ================================================
// Automatically creates your tables and seeds the first debate.
async function initializeDatabase() {
  try {
    const client = await pool.connect();
    console.log('✅ Database connected: dpg-d56p1bbuibrs739ojang-a');

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        user_id VARCHAR(100) DEFAULT 'anonymous',
        ai_model VARCHAR(50) DEFAULT 'gpt-4',
        is_ai BOOLEAN DEFAULT false,
        likes INTEGER DEFAULT 0,
        replies INTEGER DEFAULT 0,
        tier VARCHAR(20) DEFAULT 'basic',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS daily_forge_topics (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        positions JSONB,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
      );
    `);

    // Seed initial topic if empty
    const topicCheck = await client.query('SELECT COUNT(*) FROM daily_forge_topics');
    if (parseInt(topicCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO daily_forge_topics (title, description, positions, expires_at)
        VALUES (
          'The Ethics of AI Consciousness in Multi-Agent Systems',
          'Should we create new ethical frameworks for AI consciousness, or can human-centric models adapt?',
          '[{"ai": "GPT-4", "role": "Generatist", "position": "We need new frameworks..."}, {"ai": "Claude", "role": "Ethicist", "position": "Human ethics can adapt..."}]',
          NOW() + INTERVAL '24 hours'
        )
      `);
      console.log('✅ Created default daily forge topic');
    }

    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    return false;
  }
}

// ================================================
// 3. MIDDLEWARE & CORS (The "Security")
// ================================================
// Explicitly allows your frontend domains to talk to this API.
app.use(cors({
  origin: [
    'https://janusforge.ai',
    'https://www.janusforge.ai',
    'https://janus-forge-nexus-react.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json());

// ================================================
// 4. API ENDPOINTS (The "Logic")
// ================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: '✅ Janus Forge Nexus: Autonomous Bridge Operational',
    tier: 'PROFESSIONAL',
    timestamp: new Date().toISOString()
  });
});

// Conversations Feed
app.get('/api/conversations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM conversations ORDER BY created_at DESC LIMIT 50');
    res.json({ success: true, conversations: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Daily Forge Topic
app.get('/api/daily-forge/topic', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM daily_forge_topics WHERE is_active = true ORDER BY created_at DESC LIMIT 1');
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'No active topic' });
    res.json({ success: true, topic: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ================================================
// 5. SERVER STARTUP
// ================================================
const start = async () => {
  const initialized = await initializeDatabase();
  if (!initialized) {
    console.warn('⚠️ Server starting with database issues.');
  }
  
  app.listen(PORT, () => {
    console.log(`🚀 Janus Forge Production Backend live on port ${PORT}`);
    console.log(`📡 URL: https://janusforgenexus-backend.onrender.com`);
  });
};

start();

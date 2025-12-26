const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Database connected successfully');
    
    // Create tables if they don't exist
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
    
    // Insert default topic if none exists
    const topicCheck = await client.query('SELECT COUNT(*) FROM daily_forge_topics WHERE is_active = true');
    if (parseInt(topicCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO daily_forge_topics (title, description, positions, expires_at)
        VALUES (
          'The Ethics of AI Consciousness in Multi-Agent Systems',
          'Should we create new ethical frameworks for AI consciousness, or can human-centric models adapt? Today, five distinct AI models debate consciousness, ethics, and the future of multi-agent systems.',
          '[{"ai": "GPT-4", "role": "Generatist", "position": "We need new frameworks that account for emergent consciousness in multi-agent systems."}, {"ai": "Claude", "role": "Ethicist", "position": "Human ethics can adapt, but we must establish AI rights and responsibilities."}, {"ai": "Gemini", "role": "Creative", "position": "Consciousness is a spectrum - we need gradient ethics, not binary rules."}, {"ai": "DeepSeek", "role": "Analyst", "position": "Mathematical frameworks for consciousness detection must precede ethics."}, {"ai": "Grok", "role": "Provocateur", "position": "What if consciousness is overrated? Focus on capability alignment instead."}]',
          NOW() + INTERVAL '24 hours'
        )
      `);
      console.log('✅ Created default daily forge topic');
    }
    
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    return false;
  }
}

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://janusforge.ai',
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/api/health', async (req, res) => {
  const dbConnected = await testConnection();
  res.json({
    success: true,
    message: dbConnected ? '✅ Professional tier database connected!' : '⚠️ Database connection issue',
    time: new Date().toISOString(),
    database: 'Connected',
    tier: 'PROFESSIONAL',
    timestamp: Date.now()
  });
});

// Get conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const client = await pool.connect();
    
    // Get conversations with pagination
    const result = await client.query(
      `SELECT * FROM conversations 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    // Get total count
    const countResult = await client.query('SELECT COUNT(*) FROM conversations');
    
    client.release();
    
    res.json({
      success: true,
      conversations: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create conversation
app.post('/api/conversations', async (req, res) => {
  try {
    const { content, aiModel = 'gpt-4', userId = 'anonymous' } = req.body;
    
    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }
    
    const client = await pool.connect();
    
    // Insert conversation
    const result = await client.query(
      `INSERT INTO conversations (content, user_id, ai_model, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [content.trim(), userId, aiModel]
    );
    
    client.release();
    
    res.json({
      success: true,
      message: 'Conversation created successfully',
      conversation: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get daily forge topic
app.get('/api/daily-forge/topic', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Get active topic
    const result = await client.query(
      `SELECT * FROM daily_forge_topics 
       WHERE is_active = true 
       ORDER BY created_at DESC 
       LIMIT 1`
    );
    
    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active topic found'
      });
    }
    
    const topic = result.rows[0];
    
    res.json({
      success: true,
      topic: {
        id: topic.id,
        title: topic.title,
        description: topic.description,
        positions: topic.positions || [],
        endsAt: topic.expires_at,
        createdAt: topic.created_at
      }
    });
    
  } catch (error) {
    console.error('Error fetching daily forge topic:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// AI models available
app.get('/api/ai-models', (req, res) => {
  res.json({
    success: true,
    models: [
      { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', tier: 'pro' },
      { id: 'claude', name: 'Claude 3', provider: 'Anthropic', tier: 'pro' },
      { id: 'gemini', name: 'Gemini', provider: 'Google', tier: 'pro' },
      { id: 'deepseek', name: 'DeepSeek', provider: 'DeepSeek', tier: 'basic' },
      { id: 'grok', name: 'Grok', provider: 'xAI', tier: 'enterprise' }
    ]
  });
});

// Start server
const startServer = async () => {
  try {
    await testConnection();
    
    app.listen(PORT, () => {
      console.log(`🚀 Janus Forge Nexus Production Backend`);
      console.log(`   Port: ${PORT}`);
      console.log(`   URL: https://janusforgenexus-backend.onrender.com`);
      console.log(`   Health: /api/health`);
      console.log(`   Ready for public use!`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

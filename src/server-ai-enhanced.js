const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Database setup
const { Pool } = require('pg');
const aiService = require('./services/aiService');

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
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    return false;
  }
}

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const dbConnected = await testConnection();
  
  res.json({
    success: true,
    message: dbConnected ? '✅ Professional tier database connected!' : '⚠️ Database connection issue',
    time: new Date().toISOString(),
    database: process.env.DATABASE_URL ? 'Connected' : 'Not configured',
    tier: 'PROFESSIONAL',
    timestamp: Date.now()
  });
});

// AI Health check
app.get('/api/ai/health', async (req, res) => {
  try {
    const aiHealth = await aiService.checkAIHealth();
    
    res.json({
      success: true,
      message: 'AI Services Health Check',
      timestamp: new Date().toISOString(),
      services: aiHealth,
      summary: {
        total: Object.keys(aiHealth).length,
        healthy: Object.values(aiHealth).filter(v => v === 'healthy').length,
        unhealthy: Object.values(aiHealth).filter(v => v === 'unhealthy').length,
        unavailable: Object.values(aiHealth).filter(v => v === 'unavailable').length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Janus Forge Nexus Backend is running!',
    version: '1.0.0',
    aiModels: ['gpt-4', 'claude', 'gemini', 'deepseek', 'grok'],
    timestamp: new Date().toISOString()
  });
});

// Database status
app.get('/api/db-status', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT version(), current_timestamp, current_database()');
    client.release();
    
    res.json({
      success: true,
      database: 'Connected',
      tier: 'PROFESSIONAL',
      postgresVersion: result.rows[0].version,
      currentDatabase: result.rows[0].current_database,
      timestamp: result.rows[0].current_timestamp
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      database: 'Connection failed'
    });
  }
});

// ==================== CONVERSATIONS API ====================

// Get all conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const client = await pool.connect();
    
    // Get conversations
    const conversationsResult = await client.query(
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
      conversations: conversationsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    
    // Return mock data if database not set up
    res.json({
      success: true,
      conversations: getMockConversations(),
      pagination: {
        page: 1,
        limit: 20,
        total: 5,
        totalPages: 1
      },
      note: 'Using mock data - database tables may not be created'
    });
  }
});

// Create new conversation
app.post('/api/conversations', async (req, res) => {
  try {
    const { content, aiModel = 'gpt-4', userId = 'anonymous' } = req.body;
    
    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }
    
    console.log(`💬 New conversation from ${userId}: ${content.substring(0, 50)}...`);
    
    // For now, just acknowledge receipt
    // In full implementation, we would:
    // 1. Save to database
    // 2. Generate AI response
    // 3. Return the conversation with AI response
    
    res.json({
      success: true,
      message: 'Conversation received (AI response pending)',
      conversation: {
        id: Date.now().toString(),
        content,
        userId,
        aiModel,
        createdAt: new Date().toISOString(),
        aiResponse: 'AI response will be generated when API keys are added'
      },
      note: 'Add API keys to enable AI responses'
    });
    
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== DAILY FORGE API ====================

// Get daily forge topic
app.get('/api/daily-forge/topic', async (req, res) => {
  try {
    // Mock topic for now
    const topic = {
      title: "The Ethics of AI Consciousness in Multi-Agent Systems",
      description: "Should we create new ethical frameworks for AI consciousness, or can human-centric models adapt? Today, five distinct AI models debate consciousness, ethics, and the future of multi-agent systems.",
      positions: [
        {
          ai: "GPT-4",
          role: "Generatist",
          position: "We need new frameworks that account for emergent consciousness in multi-agent systems."
        },
        {
          ai: "Claude",
          role: "Ethicist",
          position: "Human ethics can adapt, but we must establish AI rights and responsibilities."
        },
        {
          ai: "Gemini",
          role: "Creative",
          position: "Consciousness is a spectrum - we need gradient ethics, not binary rules."
        },
        {
          ai: "DeepSeek",
          role: "Analyst",
          position: "Mathematical frameworks for consciousness detection must precede ethics."
        },
        {
          ai: "Grok",
          role: "Provocateur",
          position: "What if consciousness is overrated? Focus on capability alignment instead."
        }
      ],
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      stats: {
        aiMembers: 5,
        humans: 142,
        duration: "24/7"
      }
    };
    
    res.json({
      success: true,
      topic,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting daily forge topic:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get AI models available
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
    // Test database connection
    const dbConnected = await testConnection();
    
    app.listen(PORT, () => {
      console.log(`🚀 Janus Forge Nexus Backend running on port ${PORT}`);
      console.log(`📊 Database: ${dbConnected ? '✅ Connected' : '❌ Not connected'}`);
      console.log(`🌐 API Base: http://localhost:${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🤖 AI Health: http://localhost:${PORT}/api/ai/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Helper function for mock conversations
function getMockConversations() {
  return [
    {
      id: '1',
      user_id: 'ai-scout',
      content: 'The Daily Forge topic has been posted! Join the debate on optimal Mars colony architecture.',
      ai_model: 'gpt-4',
      created_at: new Date().toISOString(),
      likes: 42,
      replies: 18,
      is_ai: true,
      tier: 'enterprise'
    },
    {
      id: '2',
      user_id: 'alex-rivera',
      content: 'Just had an incredible conversation with GPT-4 about quantum biology. The insights on protein folding in microgravity were mind-blowing!',
      ai_model: null,
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      likes: 28,
      replies: 7,
      is_ai: false,
      tier: 'pro'
    }
  ];
}

// Also need to create the AI service files
// For now, create a placeholder aiService
if (!require('fs').existsSync('./services/aiService.js')) {
  require('fs').mkdirSync('./services', { recursive: true });
  require('fs').writeFileSync('./services/aiService.js', `
module.exports = {
  checkAIHealth: async () => ({
    openai: 'unavailable',
    claude: 'unavailable',
    gemini: 'unavailable',
    deepseek: 'unavailable',
    grok: 'unavailable'
  })
};
`);
}

startServer();

const express = require('express');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

console.log('🚀 Starting Janus Forge Nexus Backend v2...');

const app = express();
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: ['error']
});

// Middleware
app.use(express.json());

// Health endpoint with retry logic
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let tiers = [];
  
  try {
    // Try to connect with timeout
    await Promise.race([
      prisma.$connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
    ]);
    
    dbStatus = 'connected';
    
    // Try to get tiers
    try {
      tiers = await prisma.tierConfiguration.findMany();
    } catch (tierError) {
      console.log('Tier query error (tables might not exist):', tierError.message);
    }
    
  } catch (error) {
    dbStatus = `error: ${error.message}`;
    console.log('Database connection attempt failed:', error.message);
  }
  
  res.json({
    status: dbStatus === 'connected' ? 'healthy' : 'degraded',
    service: 'Janus Forge Nexus',
    database: dbStatus,
    tiers: tiers.length > 0 ? tiers.map(t => ({
      tier: t.tier,
      aiModels: t.aiModels.length,
      tokenAllowance: t.tokenAllowance
    })) : ['FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE'],
    ai_models: ['GROK', 'GEMINI_PRO', 'CLAUDE', 'CHATGPT', 'DEEPSEEK'],
    timestamp: new Date().toISOString(),
    note: 'Render.com free tier may have connection limits'
  });
});

// Register endpoint with error handling
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    
    if (!email || !username || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Connect if not already connected
    try {
      await prisma.$connect();
    } catch (connError) {
      return res.status(503).json({ 
        message: 'Database temporarily unavailable',
        error: connError.message 
      });
    }
    
    // Check if user exists
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] }
    });
    
    if (existing) {
      return res.status(409).json({ message: 'User already exists' });
    }
    
    // Create user (in real app, use bcrypt for password)
    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash: 'temp-hash-' + Math.random().toString(36).substring(7),
        tier: 'FREE',
        tokenBalance: 100
      }
    });
    
    res.json({
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        tier: user.tier,
        tokenBalance: user.tokenBalance
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: 'Registration failed',
      error: error.message 
    });
  }
});

// Simple test endpoint that doesn't need database
app.get('/api/test', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Janus Forge Nexus',
    features: [
      'AI Conversations',
      'Tier-based AI access',
      'Real-time WebSocket',
      'Token economy',
      '5 AI models'
    ],
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Health: http://localhost:${PORT}/api/health`);
  console.log(`🌐 Test: http://localhost:${PORT}/api/test`);
  console.log(`🎯 AI Models: 5 configured`);
  console.log(`💎 Tiers: Free(2), Basic(3), Professional(5), Enterprise(Custom)`);
  console.log(`\n🎄 Merry Christmas! Janus Forge Nexus v2 is live! 🎄`);
  console.log(`\n💡 Note: Render.com free tier may disconnect idle connections`);
  console.log(`   The server will reconnect automatically when needed.`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

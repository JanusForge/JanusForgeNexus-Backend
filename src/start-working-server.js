const express = require('express');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

console.log('🚀 Starting Janus Forge Nexus Backend...');

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

// Health endpoint
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$connect();
    
    // Get tier configurations
    const tiers = await prisma.tierConfiguration.findMany();
    
    res.json({
      status: 'healthy',
      service: 'Janus Forge Nexus',
      database: 'connected',
      tiers: tiers.map(t => ({
        tier: t.tier,
        aiModels: t.aiModels.length,
        tokenAllowance: t.tokenAllowance
      })),
      ai_models: ['GROK', 'GEMINI_PRO', 'CLAUDE', 'CHATGPT', 'DEEPSEEK'],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.json({
      status: 'degraded',
      service: 'Janus Forge Nexus',
      database: 'error: ' + error.message,
      ai_models: ['GROK', 'GEMINI_PRO', 'CLAUDE', 'CHATGPT', 'DEEPSEEK'],
      tiers: ['FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE'],
      timestamp: new Date().toISOString()
    });
  }
});

// Simple register endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    
    if (!email || !username || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Check if user exists
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] }
    });
    
    if (existing) {
      return res.status(409).json({ message: 'User already exists' });
    }
    
    // Create user (in real app, hash password)
    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash: 'temp-hash', // In real app, use bcrypt
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
    res.status(500).json({ message: 'Registration error: ' + error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Health: http://localhost:${PORT}/api/health`);
  console.log(`🎯 AI Models: 5 configured`);
  console.log(`💎 Tiers: Free(2), Basic(3), Professional(5), Enterprise(Custom)`);
  console.log(`\n🎄 Merry Christmas! Janus Forge Nexus is live! 🎄`);
});

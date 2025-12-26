import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Simple health check
router.get('/', async (req, res) => {
  try {
    await prisma.$connect();
    
    // Get tier configurations
    const tiers = await prisma.tierConfiguration.findMany();
    
    res.json({
      status: 'healthy',
      service: 'Janus Forge Nexus Backend',
      database: 'connected',
      tiers: tiers.map(t => ({
        tier: t.tier,
        aiModels: t.aiModels,
        tokenAllowance: t.tokenAllowance,
        price: `$${(t.priceCents / 100).toFixed(2)}`
      })),
      ai_models: ['GROK', 'GEMINI_PRO', 'CLAUDE', 'CHATGPT', 'DEEPSEEK'],
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'Janus Forge Nexus Backend',
      database: 'error: ' + error.message,
      ai_models: ['GROK', 'GEMINI_PRO', 'CLAUDE', 'CHATGPT', 'DEEPSEEK'],
      timestamp: new Date().toISOString()
    });
  }
});

// Ping endpoint
router.get('/ping', (req, res) => {
  res.json({
    status: 'pong',
    timestamp: new Date().toISOString()
  });
});

export default router;

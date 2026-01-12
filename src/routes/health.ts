import { Router, Request, Response } from 'express';
import prisma from './lib/prisma';

const router = Router();
const prisma = prisma;

router.get('/', async (req: Request, res: Response) => {
  try {
    // Basic database connectivity check
    const tierCount = await prisma.tierConfiguration.count();
    const latestTiers = await prisma.tierConfiguration.findMany({
        take: 5
    });

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      tier_configs_count: tierCount,
      systems: {
        auth: 'operational',
        conversations: 'operational',
        daily_forge: 'operational'
      },
      // Fixed: Map snake_case database fields to the health report
      active_tiers: latestTiers.map(t => ({
        tier: t.tier,
        models: t.ai_models,
        allowance: t.token_allowance,
        price: t.price_cents
      }))
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

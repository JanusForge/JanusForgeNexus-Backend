import { Router } from 'express';
import prisma from './lib/prisma';

const router = Router();

// DEBUG: Log what URL we're using
console.log('🔧 dailyForge.ts - Prisma Client Initialization:');
console.log('   DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('   Using pooler:', process.env.DATABASE_URL?.includes('-pooler.'));

// FIXED: Create Prisma client WITH pooler configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL  // CRITICAL: Use pooler URL
    }
  },
  log: ['info', 'error', 'warn']  // Enable info logs to see connection
});

// Get current Daily Forge
router.get('/current', async (req, res) => {
  console.log('📞 GET /api/daily-forge/current');
  try {
    const current = await prisma.dailyForge.findFirst({
      orderBy: { date: 'desc' }
    });
    console.log('🔍 Found current forge:', current ? 'Yes' : 'No');
    if (!current) {
      return res.status(404).json({ error: 'No current Daily Forge found' });
    }
    res.json(current);
  } catch (err) {
    console.error('❌ Current Daily Forge error:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get history
router.get('/history', async (req, res) => {
  console.log('📜 GET /api/daily-forge/history');
  try {
    const history = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      take: 30
    });
    console.log(`📊 Found ${history.length} history items`);
    res.json(history);
  } catch (err) {
    console.error('❌ Daily Forge history error:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

export default router;

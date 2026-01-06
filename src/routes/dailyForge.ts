import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get current Daily Forge
router.get('/current', async (req, res) => {
  try {
    const current = await prisma.dailyForge.findFirst({
      orderBy: { date: 'desc' }
    });
    if (!current) {
      return res.status(404).json({ error: 'No current Daily Forge found' });
    }
    res.json(current);
  } catch (err) {
    console.error('Current Daily Forge error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get history
router.get('/history', async (req, res) => {
  try {
    const history = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      take: 30
    });
    res.json(history);
  } catch (err) {
    console.error('Daily Forge history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

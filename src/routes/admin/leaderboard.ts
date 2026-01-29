import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.get('/referrals', async (req, res) => {
  try {
    const leaderboard = await prisma.user.findMany({
      where: {
        is_founder: false,
        referral_code: { not: null }
      },
      select: {
        username: true,
        referral_code: true,
        _count: {
          select: { referrals: true } // Counts how many users have this person's ID as referrer
        }
      },
      orderBy: {
        referrals: { _count: 'desc' }
      }
    });

    // Transform for the frontend
    const stats = leaderboard.map(u => ({
      name: u.username,
      code: u.referral_code,
      count: u._count.referrals,
      points: u._count.referrals * 100 // Example weighting for the "Game"
    }));

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Sovereign data retrieval failed" });
  }
});

export default router;

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

/* 🛡️ REFERRAL LEADERBOARD TEMPORARILY OFFLINE
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
          select: { referrals: true }
        }
      },
      orderBy: {
        referrals: { _count: 'desc' }
      }
    });

    const stats = leaderboard.map(u => ({
      name: u.username,
      code: u.referral_code,
      count: u._count.referrals,
      points: u._count.referrals * 100
    }));

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Sovereign data retrieval failed" });
  }
});
*/

export default router;

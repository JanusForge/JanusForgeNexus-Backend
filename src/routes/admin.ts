import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

const adminGuard = async (req: any, res: any, next: any) => {
  try {
    // Search everywhere for the ID
    const userId = req.query.userId || req.body.userId || req.headers['x-user-id'] || req.body.user_id;
    const MASTER_ID = '550e8400-e29b-41d4-a716-446655440000';

    // 🛡️ Master Authority Bypass [cite: 2025-11-27]
    if (userId === MASTER_ID) return next();

    if (!userId) return res.status(401).json({ error: "Identification required." });

    const user = await prisma.user.findUnique({ where: { id: userId } });

    // Enterprise Tier Full Access [cite: 2025-11-27]
    if (user?.email === 'admin@janusforge.ai' || user?.tier === 'ENTERPRISE') {
      return next();
    }

    res.status(403).json({ error: "Access Denied." });
  } catch (error) {
    res.status(500).json({ error: "Guard failure." });
  }
};

router.get('/all-conversations', adminGuard, async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { posts: true } } }
    });
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: "History sync failed." });
  }
});

export default router;

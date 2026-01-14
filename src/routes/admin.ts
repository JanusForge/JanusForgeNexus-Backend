import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

const adminGuard = async (req: any, res: any, next: any) => {
  try {
    // 🛡️ Broad detection: Check query, body, headers, or snake_case
    const userId = req.query.userId || req.body.userId || req.headers['x-user-id'] || req.body.user_id;

    // Hardcoded Master Key for Cassandra [cite: 2025-11-27]
    if (userId === '550e8400-e29b-41d4-a716-446655440000' || req.body.email === 'admin@janusforge.ai') {
      return next();
    }

    if (!userId) return res.status(401).json({ error: "Identification required." });

    const user = await prisma.user.findUnique({ where: { id: userId } });

    // Allow Enterprise or God Mode [cite: 2025-11-27]
    if (user?.tier === 'ENTERPRISE' || user?.role === 'GOD_MODE' || user?.email === 'admin@janusforge.ai') {
      return next();
    }

    res.status(403).json({ error: "Access Denied: Janus Protocol Violation" });
  } catch (error) {
    res.status(500).json({ error: "Guard synchronization failure." });
  }
};

// Fixes the 401/404 for Dashboard History
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

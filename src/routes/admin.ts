import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

const adminGuard = async (req: any, res: any, next: any) => {
  try {
    // Check all possible locations for the Admin ID
    const userId = req.query.userId || req.body.userId || req.headers['x-user-id'];
    const MASTER_ID = '550e8400-e29b-41d4-a716-446655440000'; // Your Neon DB ID

    // Immediate bypass for the Master Authority [cite: 2025-11-27]
    if (userId === MASTER_ID) return next();

    if (!userId) return res.status(401).json({ error: "Identification required." });

    const adminUser = await prisma.user.findUnique({ where: { id: userId } });

    // Verify by Email or Tier status [cite: 2025-11-27]
    if (adminUser?.email === 'admin@janusforge.ai' || adminUser?.tier === 'ENTERPRISE') {
      next();
    } else {
      res.status(403).json({ error: "Access Denied: Janus Protocol 0" });
    }
  } catch (error) {
    res.status(500).json({ error: "Guard synchronization failure." });
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
    res.status(500).json({ error: "Failed to fetch history." });
  }
});

// ... (keep metrics, update-tokens, toggle-status, and broadcast as they were)

export default router;

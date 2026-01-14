import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

/**
 * 🛡️ ADMIN GUARD (Universal)
 * Extract identity from Query, Body, or Headers to stop 401 errors.
 */
const adminGuard = async (req: any, res: any, next: any) => {
  try {
    const userId = req.query.userId || req.body.userId || req.headers['x-user-id'] || req.body.user_id;

    if (!userId) {
      return res.status(401).json({ error: "Council identification required." });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    // 🔑 Protocol 0: Master Authority & Enterprise Bypass
    if (user?.email === 'admin@janusforge.ai' || user?.tier === 'ENTERPRISE' || user?.role === 'GOD_MODE') {
      return next();
    }

    res.status(403).json({ error: "Access Denied: Janus Protocol Violation" });
  } catch (error) {
    res.status(500).json({ error: "Guard synchronization failure." });
  }
};

/**
 * 📚 GET ALL CONVERSATIONS
 * Fixes the 404/401 for the Dashboard history.
 */
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

// --- METRICS & BROADCAST ---
router.get('/nexus-metrics', adminGuard, async (req, res) => {
  try {
    const [totalUsers, activeDebates] = await Promise.all([
      prisma.user.count(),
      prisma.conversation.count({ where: { created_at: { gte: new Date(Date.now() - 86400000) } } })
    ]);
    res.json({ totalUsers, activeDebates });
  } catch (err) {
    res.status(500).json({ error: "Metrics failure." });
  }
});

router.post('/broadcast', adminGuard, async (req, res) => {
  const { message } = req.body;
  const io = req.app.get('io');
  if (io) {
    io.emit('broadcast:incoming', { message });
    return res.json({ success: true });
  }
  res.status(500).json({ error: "Socket unavailable." });
});

export default router;

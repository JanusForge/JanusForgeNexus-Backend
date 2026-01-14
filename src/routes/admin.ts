// src/routes/admin.ts
import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

/**
 * 🛡️ ADMIN GUARD (Consolidated)
 * Handles identity verification via Query, Body, or Headers.
 * Ensures Cassandra (admin@janusforge.ai) has full site access.
 */
const adminGuard = async (req: any, res: any, next: any) => {
  try {
    // Flexibility: Look for userId in query params, request body, or custom header
    const userId = req.query.userId || req.body.userId || req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({ error: "Identification required for Nexus Watch." });
    }

    const adminUser = await prisma.user.findUnique({ where: { id: userId } });

    // Protocol 0 Check: Verify Master Authority or God Mode
    if (adminUser?.email === 'admin@janusforge.ai' || adminUser?.role === 'GOD_MODE' || adminUser?.tier === 'ENTERPRISE') {
      next();
    } else {
      console.warn(`[Security Alert] Unauthorized access attempt by: ${adminUser?.email || 'Unknown'}`);
      res.status(403).json({ error: "Access Denied: Janus Protocol 0 Violation" });
    }
  } catch (error) {
    res.status(500).json({ error: "Guard synchronization failure." });
  }
};

/**
 * 📚 GET ALL CONVERSATIONS
 * Fixes the 404/401 for the Admin Dashboard History Feed.
 */
router.get('/all-conversations', adminGuard, async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: { posts: true }
        }
      }
    });
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: "Failed to sync global conversation history." });
  }
});

/**
 * 📊 GET NEXUS METRICS
 */
router.get('/nexus-metrics', adminGuard, async (req, res) => {
  try {
    const [totalUsers, activeDebates, userTokens] = await Promise.all([
      prisma.user.count(),
      prisma.conversation.count({
        where: { created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
      }),
      prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          tokens_remaining: true,
          tokens_used: true,
          created_at: true
        },
        orderBy: { tokens_used: 'desc' },
        take: 20
      })
    ]);

    res.json({ totalUsers, activeDebates, userTokens });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch neural metrics." });
  }
});

/**
 * 🛠️ UPDATE TOKENS (Manual Override)
 */
router.post('/update-tokens', adminGuard, async (req, res) => {
  const { targetUserId, amount } = req.body;
  try {
    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { tokens_remaining: parseInt(amount) }
    });
    res.json({ success: true, newBalance: updated.tokens_remaining });
  } catch (error) {
    res.status(500).json({ error: "Token override failed." });
  }
});

/**
 * 📡 GLOBAL BROADCAST
 */
router.post('/broadcast', adminGuard, async (req, res) => {
  const { message } = req.body;
  try {
    const io = req.app.get('io');
    if (!io) throw new Error("Socket instance not found");

    io.emit('broadcast:incoming', { message });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Broadcast deployment failed." });
  }
});

export default router;

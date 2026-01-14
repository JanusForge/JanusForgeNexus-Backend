// src/routes/admin.ts
import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

/**
 * 🛡️ ADMIN GUARD
 * Ensures only the owner (admin@janusforge.ai) or authorized GOD_MODE roles
 * can access the Nexus Watch commands.
 */
const adminGuard = async (req: any, res: any, next: any) => {
  try {
    const { userId } = req.query; // Admin ID passed as query param for verification
    
    if (!userId) {
      return res.status(401).json({ error: "Identification required." });
    }

    const adminUser = await prisma.user.findUnique({ where: { id: userId } });
    
    if (adminUser?.email === 'admin@janusforge.ai' || adminUser?.role === 'GOD_MODE') {
      next();
    } else {
      console.warn(`[Security Alert] Unauthorized admin access attempt by: ${adminUser?.email || 'Unknown'}`);
      res.status(403).json({ error: "Access Denied: Janus Protocol 0 Violation" });
    }
  } catch (error) {
    res.status(500).json({ error: "Guard synchronization failure." });
  }
};

/**
 * 📊 GET NEXUS METRICS
 * Aggregates global user activity and token consumption.
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
    res.status(500).json({ error: "Failed to fetch metrics." });
  }
});

/**
 * 🛠️ UPDATE TOKENS
 * Manual override for user neural balances.
 */
router.post('/update-tokens', adminGuard, async (req, res) => {
  const { targetUserId, amount } = req.body;
  try {
    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { tokens_remaining: parseInt(amount) }
    });
    console.log(`[Admin] Token override: ${updated.email} set to ${amount}`);
    res.json({ success: true, newBalance: updated.tokens_remaining });
  } catch (error) {
    res.status(500).json({ error: "Token override failed." });
  }
});

/**
 * 🚫 TOGGLE STATUS (Remote Kill)
 * Bans or restores user access to the Nexus.
 */
router.post('/toggle-status', adminGuard, async (req, res) => {
  const { targetUserId, status } = req.body; // status: 'BANNED' | 'USER'
  try {
    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: status } 
    });
    console.log(`[Admin] Status change: ${updated.email} set to ${status}`);
    res.json({ success: true, status: updated.role });
  } catch (error) {
    res.status(500).json({ error: "Status override failed." });
  }
});

/**
 * 📡 GLOBAL BROADCAST
 * Deploys a system-wide alert to all active socket connections.
 */
router.post('/broadcast', adminGuard, async (req, res) => {
  const { message } = req.body;
  try {
    const io = req.app.get('io');
    if (!io) throw new Error("Socket instance not found");

    // Emit global broadcast event
    io.emit('broadcast:incoming', { message });
    
    console.log(`[Admin] Global Broadcast Deployed: ${message}`);
    res.json({ success: true });
  } catch (error) {
    console.error("Broadcast failure:", error);
    res.status(500).json({ error: "Broadcast deployment failed." });
  }
});

/**
 * 📚 GET ALL CONVERSATIONS
 * Fixes the 404 for the Admin Dashboard History
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
    res.status(500).json({ error: "Failed to sync conversation history." });
  }
});

export default router;

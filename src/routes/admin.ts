import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * 📡 GET /api/admin/tickets
 * Fetches all support tickets for the Nexus Watch command center.
 * Restricted to the Master Authority: admin@janusforge.ai.
 */
router.get('/tickets', async (req, res) => {
  const { userId } = req.query;

  try {
    // 🛡️ Verify Master Authority Protocol
    const caller = await prisma.user.findUnique({
      where: { id: String(userId) }
    });

    if (!caller || caller.email !== 'admin@janusforge.ai') {
      console.warn(`[SECURITY] Unauthorized access attempt to Nexus Watch by: ${userId}`);
      return res.status(403).json({ error: "Protocol 0 Violation: Unauthorized Access" });
    }

    // 🏛️ Pull all transmissions from Neon Table #11
    const tickets = await prisma.supportTicket.findMany({
      include: {
        user: {
          select: {
            username: true,
            email: true,
            tier: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    return res.json(tickets);
  } catch (error) {
    console.error("Nexus Watch Ticket Sync Error:", error);
    return res.status(500).json({ error: "Failed to synchronize with Neon clusters." });
  }
});

/**
 * 🏆 GET /api/admin/referral-leaderboard
 * Fetches ranking of advocates based on successful referrals.
 * Restricted to Master Authority.
 */
router.get('/referral-leaderboard', async (req, res) => {
  const { userId } = req.query;

  try {
    // 🛡️ Verify Authority
    const caller = await prisma.user.findUnique({ where: { id: String(userId) } });
    if (!caller || caller.email !== 'admin@janusforge.ai') {
      return res.status(403).json({ error: "Protocol 0 Violation" });
    }

    // 📊 Aggregate Advocate Data from Neon
    const leaderboard = await prisma.user.findMany({
      where: {
        referral_code: { not: null },
        email: { not: 'admin@janusforge.ai' }
      },
      select: {
        username: true,
        referral_code: true,
        _count: {
          select: { referrals: true }
        }
      },
      orderBy: {
        referrals: {
          _count: 'desc'
        }
      }
    });

    return res.json(leaderboard);
  } catch (error) {
    console.error("Referral Leaderboard Sync Error:", error);
    return res.status(500).json({ error: "Failed to synchronize referral data." });
  }
});

/**
 * 📊 GET /api/admin/nexus-metrics
 * Pulls global system health and user consumption data.
 */
router.get('/nexus-metrics', async (req, res) => {
  const { userId } = req.query;

  try {
    // 🛡️ Verify Authority
    const caller = await prisma.user.findUnique({ where: { id: String(userId) } });
    if (!caller || caller.email !== 'admin@janusforge.ai') {
      return res.status(403).json({ error: "Protocol 0 Violation" });
    }

    // Aggregate metrics from Neon
    const [totalUsers, userTokens] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          tokens_remaining: true,
          tokens_used: true,
          role: true
        }
      })
    ]);

    return res.json({
      totalUsers,
      userTokens,
      activeDebates: 0 // Placeholder for real-time socket count
    });
  } catch (error) {
    return res.status(500).json({ error: "Metrics synchronization failed." });
  }
});

/**
 * ⚡ POST /api/admin/update-tokens
 * Allows Master Authority to override fuel balances.
 */
router.post('/update-tokens', async (req, res) => {
  const { userId } = req.query;
  const { targetUserId, amount } = req.body;

  try {
    const caller = await prisma.user.findUnique({ where: { id: String(userId) } });
    if (!caller || caller.email !== 'admin@janusforge.ai') return res.sendStatus(403);

    await prisma.user.update({
      where: { id: targetUserId },
      data: { tokens_remaining: parseInt(amount) }
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Token override failed." });
  }
});

/**
 * 🚫 POST /api/admin/toggle-status
 * Execute "Remote Kill" or reactivate accounts.
 */
router.post('/toggle-status', async (req, res) => {
  const { userId } = req.query;
  const { targetUserId, status } = req.body;

  try {
    const caller = await prisma.user.findUnique({ where: { id: String(userId) } });
    if (!caller || caller.email !== 'admin@janusforge.ai') return res.sendStatus(403);

    await prisma.user.update({
      where: { id: targetUserId },
      data: { role: status }
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Status toggle failed." });
  }
});

/**
 * 📢 POST /api/admin/broadcast
 * Deploys a system-wide message to all active Neural Links (Sockets).
 */
router.post('/broadcast', async (req, res) => {
  const { userId } = req.query;
  const { message } = req.body;

  try {
    // 🛡️ Verify Authority
    const caller = await prisma.user.findUnique({ where: { id: String(userId) } });
    if (!caller || caller.email !== 'admin@janusforge.ai') return res.sendStatus(403);

    // 📡 Access the global Socket.io instance from the app context
    const io = req.app.get('io');

    if (io) {
      // Emit to all connected clients on the 'nexus:broadcast' channel
      io.emit('nexus:broadcast', {
        message,
        timestamp: new Date(),
        sender: 'MASTER AUTHORITY'
      });
      console.log(`[BROADCAST] Protocol 0 message deployed by ${caller.username}: ${message}`);
      return res.json({ success: true });
    } else {
      throw new Error("Socket.io instance not found in application context.");
    }
  } catch (error) {
    console.error("Broadcast failure:", error);
    return res.status(500).json({ error: "Broadcast failure: Neural link unavailable." });
  }
});

export default router;

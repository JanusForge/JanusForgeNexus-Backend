import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

/**
 * 🛡️ ADMIN GUARD
 * Enforces Master Authority for Admin-level operations.
 */
const adminGuard = async (req: any, res: any, next: any) => {
  try {
    const userId = req.query.userId || req.body.userId || req.headers['x-user-id'];
    const MASTER_ID = '550e8400-e29b-41d4-a716-446655440000';

    if (userId === MASTER_ID) return next();
    if (!userId) return res.status(401).json({ error: "Identification required." });

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (user?.email === 'admin@janusforge.ai' || user?.tier === 'ENTERPRISE' || user?.role === 'GOD_MODE') {
      return next();
    }

    res.status(403).json({ error: "Access Denied. Insufficient Authority." });
  } catch (error) {
    res.status(500).json({ error: "Guard failure." });
  }
};

/**
 * 📡 NEURAL LINK DIAGNOSTICS & LOGGING
 * Verifies connectivity and records heartbeat to SystemHealthLog
 */
router.get('/ping-council', adminGuard, async (req: any, res) => {
  const aiClients = req.app.get('aiClients');

  const checkModel = async (name: string, fn: () => Promise<any>) => {
    const start = Date.now();
    try {
      await fn();
      return { name, status: 'ONLINE', latency: Date.now() - start };
    } catch (err) {
      console.error(`Diagnostic failed for ${name}:`, err);
      return { name, status: 'OFFLINE', latency: 0 };
    }
  };

  try {
    const results = await Promise.all([
      checkModel('CLAUDE', () => aiClients.CLAUDE.messages.countTokens({
        model: 'claude-3-sonnet-20240229',
        messages: [{role:'user', content:'p'}]
      })),
      checkModel('GPT4', () => aiClients.GPT4.models.list()),
      checkModel('GEMINI', () => aiClients.GEMINI.getGenerativeModel({ model: "gemini-1.5-flash" }).countTokens("p")),
      checkModel('GROK', () => aiClients.GROK.models.list()),
      checkModel('DEEPSEEK', () => aiClients.DEEPSEEK.models.list()),
    ]);

    // 📊 Aggregate Metrics
    const onlineCount = results.filter(r => r.status === 'ONLINE').length;
    const totalLatency = results.reduce((acc, curr) => acc + curr.latency, 0);
    const avgLatency = Math.round(totalLatency / results.length);
    
    const systemStatus = onlineCount === results.length ? 'HEALTHY' : 
                        onlineCount > 0 ? 'DEGRADED' : 'DOWN';

    // 📝 PERSIST TO SYSTEM LOGS
    await prisma.systemHealthLog.create({
      data: {
        status: systemStatus,
        avg_latency: avgLatency,
        details: results.reduce((acc, curr) => ({ ...acc, [curr.name]: curr }), {})
      }
    });

    // Return human-readable latency for UI display
    const formattedResults = results.map(r => ({
      ...r,
      latency: r.status === 'ONLINE' ? `${r.latency}ms` : 'N/A'
    }));

    res.json({ systemStatus, avgLatency: `${avgLatency}ms`, results: formattedResults });
  } catch (error) {
    res.status(500).json({ error: "Diagnostics engine or logging failure." });
  }
});

/**
 * 📈 HEALTH HISTORY
 * Fetch the last 50 heartbeat logs for the Admin Dashboard
 */
router.get('/health-history', adminGuard, async (req, res) => {
  try {
    const logs = await prisma.systemHealthLog.findMany({
      take: 50,
      orderBy: { timestamp: 'desc' }
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve health history." });
  }
});

/**
 * 🏛️ SYSTEM HISTORY
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

export default router;

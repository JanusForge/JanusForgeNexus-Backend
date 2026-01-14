import { Router } from 'express';
import prisma from '../../lib/prisma';
import { runAdversarialSynthesis } from './synthesis-engine';

const router = Router();

router.post('/synthesis', async (req, res) => {
  const { prompt, userId, user_id, isPrivate = true } = req.body;
  const finalUserId = userId || user_id;

  if (!finalUserId) {
    return res.status(400).json({ error: "Identity lost. Please refresh." });
  }

  try {
    // Force a fresh connection to wake up Neon
    await prisma.$connect();

    const conversation = await prisma.conversation.create({
      data: { 
        user_id: finalUserId, 
        title: "Synthesis Active...", 
        is_private: isPrivate,
        name: "Nexus Prime"
      }
    });

    runAdversarialSynthesis({ conversationId: conversation.id, prompt, io: req.app.get('io') });
    res.json({ conversationId: conversation.id });
  } catch (err: any) {
    console.error("SYNTHESIS IGNITION FAILED:", err.message);
    res.status(503).json({ error: "Database warming up. Try again in 3s." });
  }
});

// Sidebar History Fetch
router.get('/', async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.json([]);

  try {
    await prisma.$connect();
    const history = await prisma.conversation.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: "Neural History sync failed." });
  }
});

export default router;

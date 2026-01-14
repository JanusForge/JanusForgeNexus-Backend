import { Router } from 'express';
import prisma from '../../lib/prisma';
import { runAdversarialSynthesis } from './synthesis-engine';

const router = Router();

// Handle Synthesis POST
router.post('/synthesis', async (req, res) => {
  const { prompt, userId, user_id, isPrivate = true } = req.body;
  const finalUserId = userId || user_id;

  if (!finalUserId) return res.status(400).json({ error: "Identity required." });

  try {
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
  } catch (err) {
    res.status(500).json({ error: "Engine ignition failed." });
  }
});

// Handle Sidebar History GET (Fixes the 404)
router.get('/', async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.json([]);

  try {
    const history = await prisma.conversation.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: "History sync failed." });
  }
});

export default router;

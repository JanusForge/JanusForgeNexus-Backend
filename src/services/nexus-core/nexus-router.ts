import { Router } from 'express';
import prisma from '../../lib/prisma';
import { runAdversarialSynthesis } from './synthesis-engine';

const router = Router();

// Fixes the 500 Synthesis Error
router.post('/synthesis', async (req, res) => {
  const { prompt, userId, user_id, isPrivate = true } = req.body;
  const finalUserId = userId || user_id;

  if (!finalUserId) {
    return res.status(400).json({ error: "User identity lost. Please re-login." });
  }

  try {
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
    res.status(500).json({ error: "Nexus Core ignition failure." });
  }
});

// NEW: Fixes the 404 for the Neural History Sidebar
router.get('/', async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.json([]); // Return empty if no user

  try {
    const history = await prisma.conversation.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch neural history." });
  }
});

export default router;

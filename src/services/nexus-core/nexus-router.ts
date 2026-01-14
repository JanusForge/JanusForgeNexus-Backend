import { Router } from 'express';
import prisma from '../../lib/prisma';
import { runAdversarialSynthesis } from './synthesis-engine';

const router = Router();

router.post('/synthesis', async (req, res) => {
  // Support both camelCase and snake_case from the frontend [cite: 2025-11-27]
  const { prompt, userId, user_id, isPrivate = true } = req.body;
  const finalUserId = userId || user_id;

  if (!finalUserId) {
    return res.status(400).json({ error: "User ID required for synthesis." });
  }

  try {
    const conversation = await prisma.conversation.create({
      data: { 
        user_id: finalUserId, 
        title: "Initializing...", 
        is_private: isPrivate,
        name: "Nexus Prime"
      }
    });

    // Invoke the 2026 AI Cluster
    runAdversarialSynthesis({ 
      conversationId: conversation.id, 
      prompt, 
      io: req.app.get('io') 
    });

    res.json({ conversationId: conversation.id });
  } catch (err) {
    console.error("Synthesis Init Failure:", err);
    res.status(500).json({ error: "Nexus Core failed to initialize." });
  }
});

export default router;

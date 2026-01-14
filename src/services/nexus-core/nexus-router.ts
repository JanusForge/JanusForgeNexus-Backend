import { Router } from 'express';
import prisma from '../../lib/prisma';
import { runAdversarialSynthesis } from './synthesis-engine';

const router = Router();

router.post('/synthesis', async (req, res) => {
  const { prompt, userId, isPrivate = true, name = "Nexus Prime" } = req.body;
  
  try {
    const conversation = await prisma.conversation.create({
      data: { user_id: userId, title: "Initializing...", is_private: isPrivate, name }
    });

    // Fire and forget the engine to keep the HTTP response fast
    runAdversarialSynthesis({ 
      conversationId: conversation.id, 
      prompt, 
      io: req.app.get('io') 
    });

    res.json({ conversationId: conversation.id });
  } catch (err) {
    res.status(500).json({ error: "Nexus initialization failed." });
  }
});

export default router;

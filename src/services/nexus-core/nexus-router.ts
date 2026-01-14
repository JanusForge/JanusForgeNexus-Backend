import { Router } from 'express';
import prisma from '../../lib/prisma';
import { runAdversarialSynthesis } from './synthesis-engine';

const router = Router();

router.post('/synthesis', async (req, res) => {
  const { prompt, userId, user_id, isPrivate = true } = req.body;
  const finalUserId = userId || user_id;

  // 🛑 Pre-database validation to stop 500 errors
  if (!finalUserId) {
    console.error("❌ Synthesis Blocked: Missing User ID");
    return res.status(400).json({ error: "User identity required." });
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

    // Invoke the 2026 AI Cluster via Socket
    runAdversarialSynthesis({ 
      conversationId: conversation.id, 
      prompt, 
      io: req.app.get('io') 
    });

    res.json({ conversationId: conversation.id });
  } catch (err) {
    console.error("Critical Engine Failure:", err);
    res.status(500).json({ error: "Nexus Core ignition failure." });
  }
});

export default router;

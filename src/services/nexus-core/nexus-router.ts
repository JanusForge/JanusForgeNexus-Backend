import express from 'express';
import prisma from '../../lib/prisma';
import { runAdversarialSynthesis } from './synthesis-engine';

const router = express.Router();

/**
 * INITIALIZE SHOWDOWN
 * Starts a private, adversarial synthesis chain.
 */
router.post('/synthesis', async (req, res) => {
  const { userId, content } = req.body;
  const SYNTHESIS_COST = 3;

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "Identity not found." });

    // OWNER ACCESS BYPASS [cite: 2025-11-27]
    const isOwner = user.email === 'admin@janusforge.ai';
    if (!isOwner && user.tokens_remaining < SYNTHESIS_COST) {
      return res.status(403).json({ error: "Insufficient tokens for synthesis." });
    }

    // Create the conversation with the new 'is_private' flag
    const conversation = await prisma.conversation.create({
      data: {
        user_id: userId,
        title: "Initializing Neural Link...",
        is_private: true, // This field isolates the chat from the Daily Forge [cite: 2025-11-27]
        is_daily_forge: false
      }
    });

    // Save the initial user interjection
    await prisma.post.create({
      data: {
        content,
        is_human: true,
        user_id: userId,
        conversation_id: conversation.id,
        name: user.username || 'Synthesizer'
      }
    });

    // Deduct tokens unless owner [cite: 2025-11-27]
    if (!isOwner) {
      await prisma.user.update({
        where: { id: userId },
        data: { tokens_remaining: { decrement: SYNTHESIS_COST } }
      });
    }

    // Wake up the Council
    runAdversarialSynthesis({
      conversationId: conversation.id,
      prompt: content,
      io: req.app.get('io'),
      aiClients: req.app.get('aiClients')
    });

    res.json({ success: true, conversationId: conversation.id });
  } catch (error) {
    console.error("Nexus Router Error:", error);
    res.status(500).json({ error: "The Synthesis Engine failed to initialize." });
  }
});

/**
 * FETCH NEURAL HISTORY
 * Retrieves only private conversations for the sidebar.
 */
router.get('/history', async (req, res) => {
  const { userId } = req.query;

  try {
    const history = await prisma.conversation.findMany({
      where: { 
        user_id: userId as string,
        is_private: true // Ensures only private chats appear in Neural History [cite: 2025-11-27]
      },
      orderBy: { created_at: 'desc' },
      select: { id: true, title: true, created_at: true }
    });
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: "Failed to load history." });
  }
});

export default router;

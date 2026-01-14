import express from 'express';
import prisma from '../lib/prisma';
import { runAdversarialSynthesis } from '../lib/synthesisEngine';

const router = express.Router();

/**
 * POST /api/conversations/synthesis
 * The primary endpoint for Nexus Prime's private "Showdown" mode.
 * OWNER ACCESS: admin@janusforge.ai bypasses token costs [cite: 2025-11-27].
 */
router.post('/synthesis', async (req, res) => {
  const { userId, content } = req.body;

  if (!userId || !content) {
    return res.status(400).json({ error: "Missing required identity or prompt data." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "Neural identity not found." });
    }

    // OWNER BYPASS: Full unrestricted access for admin@janusforge.ai [cite: 2025-11-27]
    const isOwner = user.email === 'admin@janusforge.ai';
    const SYNTHESIS_COST = 3;

    // Token validation for regular users
    if (!isOwner && user.tokens_remaining < SYNTHESIS_COST) {
      return res.status(403).json({ error: "Insufficient tokens for synthesis." });
    }

    // 1. Initialize the Private Conversation Thread
    const conversation = await prisma.conversation.create({
      data: {
        user_id: userId,
        title: content.substring(0, 45) + (content.length > 45 ? "..." : ""),
        is_private: true
      }
    });

    // 2. Save the User's Initial Directive/Prompt
    await prisma.post.create({
      data: {
        content,
        is_human: true,
        user_id: userId,
        conversation_id: conversation.id,
        name: user.username || 'Janus User'
      }
    });

    // 3. Process Token Deduction (unless admin@janusforge.ai) [cite: 2025-11-27]
    if (!isOwner) {
      await prisma.user.update({
        where: { id: userId },
        data: { tokens_remaining: { decrement: SYNTHESIS_COST } }
      });
    }

    // 4. Wake up the Cluster (AI Clients)
    const io = req.app.get('io');
    const aiClients = req.app.get('aiClients');

    // Trigger the automated adversarial dialogue in the background
    // This allows the user to be redirected to the chat UI immediately
    runAdversarialSynthesis({
      conversationId: conversation.id,
      prompt: content,
      io,
      aiClients
    }).catch(err => console.error("Synthesis Chain Error:", err));

    // Send the conversation ID back to the frontend to trigger the UI switch
    res.json({ 
      success: true, 
      conversationId: conversation.id,
      tokens_remaining: isOwner ? 999999 : user.tokens_remaining - SYNTHESIS_COST 
    });

  } catch (error) {
    console.error("Critical Synthesis Failure:", error);
    res.status(500).json({ error: "The Synthesis Engine failed to initialize." });
  }
});

/**
 * GET /api/conversations
 * Fetch private history for regular users.
 */
router.get('/', async (req, res) => {
  // Logic to fetch user's private threads...
});

export default router;
